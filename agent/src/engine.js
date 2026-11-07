/**
 * Moteur de l'agent — orchestration d'un message entrant, du transport à
 * l'exécution vérifiée, indépendante de WhatsApp.
 *
 * Flux (brief §5) : réception → idempotence → identité → (STT) → compréhension
 * → validation → permission → confirmation si sensible → exécution → vérification
 * → compte rendu, chaque étape tracée dans l'audit (brief §6).
 *
 * Dépendances injectées (toutes remplaçables : fake en test, réel en prod) :
 *   provider     : WhatsAppProvider
 *   identity     : IdentityStore
 *   idempotency  : IdempotencyStore
 *   audit        : AuditLog
 *   tools        : ToolRegistry
 *   permissions  : vérificateur (allows(staff, permission))
 *   guergne      : client des actions guergne (réel: HTTP ; test/sim: simulateur)
 *   interpret    : (text, ctx) => { tool, params } | { clarify } | null   (NLU ; réel: LLM)
 *   transcribe   : (media) => text                                        (STT ; réel: Whisper)
 */
import { normalizeIncoming } from "./normalize.js";
import { SENSITIVE } from "./guard.js";
import { DECISIONS, MOTIFS, NOTIFIER } from "./politiques.js";
import { RAISONS, analyserJid, empreinte, jidUtilisateur, resoudreNumeroDepuisJid } from "./jid.js";
import { INTENTIONS, normaliserPlan } from "./plan.js";
import { documentDeMission, genererDocument } from "./document.js";
import { cleNotification } from "./notifications.js";
import { ETAPE, agreger, estTransitoire, rendreBilan, validerMission } from "./mission.js";
// `masquer` est la mise en forme canonique du projet : la redefinir ici ferait
// diverger deux facons de masquer un numero.
import { masquer } from "./identity-store.js";
import { decrireErreur, resumerErreur } from "./erreurs.js";
import { evaluerTranscription } from "./voix/qualite-transcription.js";

let counter = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const Status = {
  RECEIVED: "RECEIVED",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  WAITING_INPUT: "WAITING_INPUT",
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  DUPLICATE: "DUPLICATE",
  REJECTED_UNKNOWN: "REJECTED_UNKNOWN",
};

/**
 * Commande de diagnostic.
 *
 * Volontairement exacte et en majuscules : une formulation libre serait
 * confondue avec une demande scolaire, et le but est precisement de ne
 * dependre d'aucune comprehension.
 */
const COMMANDE_TEST = /^\s*TEST\s+AGENT\s*$/i;

const YES = /^(oui|confirme|confirmer|ok|valide|valider)\b/i;
const NO = /^(non|annule|annuler|cancel|stop)\b/i;

export class Agent {
  constructor(deps) {
    Object.assign(this, deps);
    this.pending = new Map(); // jid -> { tool, params, runId }
    /** runIds ayant atteint une action metier : leur revendication ne se relache pas. */
    this._actionsEngagees = new Set();
    /**
     * Indicateurs d'autonomie.
     *
     * Ils existent pour une raison precise : sans mesure, « l'agent travaille
     * seul » reste une impression. Le rapport entre `automatiques` et
     * `confirmationsDemandees` dit si les politiques couvrent reellement le
     * travail quotidien, ou s'il faut en ecrire d'autres.
     */
    this._metriques = {
      messages: 0,
      conversations: 0,
      consultations: 0,
      ecritures: 0,
      automatiques: 0,
      confirmationsDemandees: 0,
      operationsReussies: 0,
      operationsEchouees: 0,
      refusPermission: 0,
      refusIdentite: 0,
      notificationsEnvoyees: 0,
      notificationsDedoublonnees: 0,
      notificationsEnAttente: 0,
      rapportsGeneres: 0,
      documentsGeneres: 0,
      repriseApresEchec: 0,
      dureeCumuleeMs: 0,
    };
  }

  /** Indicateurs d'autonomie, pour /sante et le compte rendu. */
  get metriques() {
    const m = this._metriques;
    const tentees = m.automatiques + m.confirmationsDemandees;
    return {
      ...m,
      tauxAutonomie: tentees ? Number((m.automatiques / tentees).toFixed(3)) : null,
      dureeMoyenneMs: m.messages ? Math.round(m.dureeCumuleeMs / m.messages) : null,
    };
  }

  /**
   * Point d'entrée. Garantit qu'un message obtient TOUJOURS une réponse.
   *
   * Un message a cessé d'obtenir quoi que ce soit : ni réponse, ni refus, ni
   * erreur. Pour l'utilisateur, le silence et la panne se ressemblent, et il
   * renvoie son message — ce qui ne change rien. Cette enveloppe transforme
   * toute défaillance en message explicite.
   */
  async handle(raw) {
    const runId = raw?.runId ?? uid("run");
    const msg = normalizeIncoming(raw);
    const started = Date.now();
    this._metriques.messages += 1;
    try {
      return await this._traiter(raw, msg, runId, started);
    } catch (e) {
      // `String(e?.message ?? e)` seul avait produit `erreur: "r"` en
      // production : une erreur minifiée de WhatsApp Web, indiagnosticable.
      // On garde le résumé pour l'audit, et la description complète — nom,
      // classe, pile, causes — pour le journal.
      const erreur = resumerErreur(e, { max: 300 });
      this.journalEtape?.({
        event: "handler_failed",
        run: runId,
        erreur,
        detail: decrireErreur(e),
        canal: msg?.kind ?? null,
      });

      // Aucune action métier engagée : la revendication est relâchée pour que
      // le message puisse être retraité. Si une écriture a eu lieu, on la
      // garde — rejouer une absence en créerait une seconde.
      if (!this._actionsEngagees.has(runId)) this.idempotency.oublier?.(msg.id);
      this._actionsEngagees.delete(runId);

      // L'envoi peut échouer à son tour ; cela ne doit pas masquer la cause.
      try {
        await this.provider.sendText(
          msg.fromJid,
          "Une erreur technique m'a empêché de traiter votre message. Réessayez dans un instant.",
        );
      } catch {
        /* le journal porte déjà l'échec */
      }

      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: null, role: null, channel: msg.kind,
        intent: null, result: "FAILED", error: erreur, durationMs: Date.now() - started,
      });
      return { status: Status.FAILED, runId, error: erreur };
    } finally {
      this._metriques.dureeCumuleeMs += Date.now() - started;
    }
  }

  /**
   * Échec de la chaîne vocale entrante : le dire à l'expéditeur, le consigner,
   * et s'arrêter là.
   *
   * POURQUOI UN CHEMIN D'ÉCHEC DISTINCT
   * ------------------------------------
   * Laisser l'exception remonter produisait le message passe-partout « une
   * erreur technique m'a empêché de traiter votre message », qui ne dit ni
   * quoi faire, ni que le problème venait de l'audio. Et laisser un texte vide
   * poursuivre vers le modèle est pire : il aurait inventé une intention.
   */
  async _echecVocal({ msg, runId, staff, started, evenement, raison, detail = null, texte }) {
    this.journalEtape?.({ event: evenement, run: runId, raison, ...(detail ? { detail } : {}) });
    try {
      await this.provider.sendText(msg.fromJid, texte);
    } catch {
      /* le journal porte déjà l'échec */
    }
    this.audit.record({
      runId,
      sender: msg.senderMsisdn,
      identity: staff?.id ?? null,
      role: staff?.role ?? null,
      channel: msg.kind,
      intent: null,
      result: "FAILED",
      error: `${evenement}: ${raison}`,
      durationMs: Date.now() - started,
    });
    // Aucune action métier n'a eu lieu : la revendication est relâchée pour
    // qu'une seconde tentative de l'utilisateur soit réellement traitée.
    if (!this._actionsEngagees.has(runId)) this.idempotency.oublier?.(msg.id);
    return { status: Status.FAILED, runId, error: raison, etape: evenement };
  }

  async _traiter(raw, msg, runId, started) {
    // 1. Idempotence — un même message n'est traité qu'une fois (brief §11)
    if (msg.id == null) {
      // Sans identifiant, la protection contre les doublons ne peut rien : on
      // le dit, plutôt que de laisser croire qu'elle veille.
      this.journalEtape?.({ event: "message_id_missing", run: runId });
    } else if (this.idempotency.seen(msg.id)) {
      this.journalEtape?.({ event: "message_duplicate_detected", run: runId });
      return { status: Status.DUPLICATE, runId };
    }
    this.idempotency.remember(msg.id);
    this.journalEtape?.({ event: "message_id_claimed", run: runId });

    // 2. Identité — un numéro non lié est refusé (brief §3.1)
    //
    // Le JID n'est pas toujours un numéro. Depuis la migration LID de WhatsApp,
    // `msg.from` peut être un identifiant interne dont la partie numérique ne
    // désigne aucun abonné. On résout donc le vrai numéro AVANT de chercher
    // dans la liste blanche, et on refuse proprement si on n'y arrive pas.
    const resolution = await resoudreNumeroDepuisJid({
      jid: msg.fromJid,
      resoudreLid: this.provider?.resoudreLid?.bind(this.provider),
    });

    let staff = null;
    let raison = null;
    if (!resolution.ok) {
      raison = resolution.raison;
    } else {
      const jidTel = jidUtilisateur(resolution.numero);
      staff = this.identity.resolve(jidTel);
      if (!staff) {
        // Distinguer « inconnu » de « suspendu » et de « révoqué » : ce sont
        // trois situations qui appellent trois gestes d'administration
        // différents, et les confondre fait chercher au mauvais endroit.
        const etat = this.identity.etatDe?.(jidTel)?.statut;
        raison =
          etat === "suspendu"
            ? RAISONS.IDENTITY_SUSPENDED
            : etat === "revoque"
              ? RAISONS.IDENTITY_REVOKED
              : RAISONS.UNKNOWN_NUMBER;
      }
    }

    // Journal d'identification : de quoi diagnostiquer un refus sans qu'aucun
    // numéro complet n'apparaisse. L'empreinte permet de comparer « le numéro
    // qui a écrit » aux numéros du magasin sans en divulguer un seul.
    this.journalIdentite?.({
      type: "identity_resolution",
      run: runId,
      jidType: analyserJid(msg.fromJid).serveur ?? "invalide",
      viaLid: resolution.ok ? resolution.viaLid : null,
      numeroMasque: resolution.ok ? masquer(resolution.numero) : null,
      empreinte: resolution.ok ? empreinte(resolution.numero, this.selEmpreinte ?? "") : null,
      normalisation: resolution.ok ? "success" : "failed",
      associationPersistante: staff ? "active" : (raison ?? "absente"),
      role: staff?.role ?? null,
      decision: staff ? "ALLOW" : "DENY",
      raison,
    });

    if (!staff) {
      await this.provider.sendText(msg.fromJid, "Numéro non autorisé.");
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: null, role: null, channel: msg.kind,
        message: msg.text, intent: null, result: "REFUSED_UNKNOWN", raison,
        durationMs: Date.now() - started,
      });
      this._metriques.refusIdentite += 1;
      return { status: Status.REJECTED_UNKNOWN, runId, raison };
    }

    // Le transport apprend ICI le rôle du destinataire.
    //
    // Il ne peut pas le trouver seul : depuis la migration LID, le JID qui
    // écrit n'est pas un numéro, et le magasin d'identités est indexé par
    // numéro. Sans cette ligne, le périmètre de la réponse vocale conclurait
    // « rôle inconnu » pour TOUT LE MONDE, donc silence pour tout le monde.
    this.provider.contexteReponse?.(msg.fromJid, { role: staff.role });

    // 2 bis. Commande de diagnostic — deterministe, avant toute dependance.
    //
    // Elle existe pour une raison precise : quand l'agent se tait, il faut
    // pouvoir separer le transport de l'intelligence artificielle et du
    // backend. Cette commande prouve la chaine reception → identite → envoi,
    // sans LLM, sans reseau scolaire, sans ecriture.
    if (COMMANDE_TEST.test(msg.text ?? "")) {
      const etat = (await this.diagnostic?.()) ?? {};
      const texte =
        `Agent WhatsApp connecte. Identite reconnue : ${staff.role}. ` +
        `Service IA : ${etat.ia ?? "inconnu"}. Backend scolaire : ${etat.backend ?? "inconnu"}.`;
      await this.provider.sendText(msg.fromJid, texte);
      this.journalEtape?.({ event: "commande_diagnostic", run: runId, role: staff.role });
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: "diagnostic", result: "SUCCESS", durationMs: Date.now() - started,
      });
      return { status: Status.COMPLETED, runId, diagnostic: true };
    }

    // 3. Transcription vocale si nécessaire (brief §3.3)
    //
    // CHAQUE ÉTAPE EST TRACÉE ET CHAQUE ÉCHEC EST NOMMÉ.
    //
    // Pendant des semaines, une note vocale produisait `handler_failed: "r"` et
    // rien d'autre : ni l'étape, ni la cause. Le défaut était dans le
    // téléchargement (voir `providers/identifiant-message.js`), mais la trace
    // ne permettait pas de le savoir. Un échec vocal doit désormais dire
    // lequel des quatre moments a échoué — média, intégrité, transcription,
    // contenu — et le dire aussi à l'expéditeur, dans sa langue.
    let text = msg.text;
    let transcription = null;
    let langueEntendue = null;
    if (msg.kind === "audio") {
      if (typeof this.transcribe !== "function") {
        return this._echecVocal({
          msg, runId, staff, started,
          evenement: "voice_stt_indisponible",
          raison: "aucun moteur de transcription configure",
          texte: "Je ne sais pas encore écouter les messages vocaux. Écrivez-moi votre demande, je la traiterai.",
        });
      }

      this.journalEtape?.({ event: "voice_incoming_received", run: runId });
      let media = null;
      try {
        media = await this.provider.getMedia(raw);
      } catch (e) {
        return this._echecVocal({
          msg, runId, staff, started,
          evenement: "voice_media_failed",
          raison: resumerErreur(e),
          detail: decrireErreur(e),
          texte: "Je n'ai pas pu récupérer votre note vocale. Renvoyez-la, ou écrivez-moi votre demande.",
        });
      }
      if (!media?.data?.length) {
        // `null` a un sens précis chez le transport : média expiré, en cours de
        // réenvoi, ou introuvable. Ce n'est pas une panne, et le dire ainsi
        // évite une relance inutile.
        return this._echecVocal({
          msg, runId, staff, started,
          evenement: "voice_media_indisponible",
          raison: "media absent, expire ou vide",
          texte: "Votre note vocale n'est plus disponible sur les serveurs de WhatsApp. Renvoyez-la, je l'écouterai.",
        });
      }
      this.journalEtape?.({
        event: "voice_media_downloaded",
        run: runId,
        octets: media.data.length,
        mimetype: media.mimetype ?? null,
        dureeS: media.dureeS ?? null,
      });

      this.journalEtape?.({ event: "voice_stt_started", run: runId });
      const debutStt = Date.now();
      let resultat;
      try {
        resultat = await this.transcribe(media);
      } catch (e) {
        return this._echecVocal({
          msg, runId, staff, started,
          evenement: "voice_stt_failed",
          raison: resumerErreur(e),
          detail: decrireErreur(e),
          texte: "Je n'ai pas réussi à transcrire votre note vocale. Réessayez dans un instant, ou écrivez-moi.",
        });
      }

      // Le moteur peut rendre un texte nu (anciens appels, tests) ou un objet
      // décrivant aussi la langue entendue : les deux sont acceptés.
      transcription = typeof resultat === "string" ? resultat : (resultat?.texte ?? "");
      langueEntendue = typeof resultat === "object" ? (resultat?.langue ?? null) : null;
      text = transcription ?? "";

      if (!String(text).trim()) {
        // Une transcription vide ne doit JAMAIS poursuivre vers le modèle : il
        // inventerait une intention à partir de rien.
        return this._echecVocal({
          msg, runId, staff, started,
          evenement: "voice_stt_vide",
          raison: "transcription vide",
          texte: "Je n'ai rien entendu d'exploitable dans votre note vocale. Reprenez-la un peu plus près du micro.",
        });
      }

      this.journalEtape?.({
        event: "voice_stt_completed",
        run: runId,
        caracteres: String(text).length,
        langue: langueEntendue,
        dureeMs: Date.now() - debutStt,
      });

      // UNE TRANSCRIPTION HALLUCINEE N'EST PAS VIDE : ELLE EST PLAUSIBLE.
      //
      // Le 7 novembre, notre propre note bilingue est revenue avec « de la
      // communication » repete cinq fois : la moitie arabe avait ete lue comme
      // du francais. Un tel texte franchit sans peine le garde-fou de la
      // transcription vide, atteint le modele, et peut devenir une intention —
      // donc une action scolaire posee sur du bruit.
      //
      // On ne poursuit donc pas. Et on le dit a l'expediteur, qui sait, lui,
      // ce qu'il a prononce.
      const qualite = evaluerTranscription(text, { langueAttendue: langueEntendue, langueLue: langueEntendue });
      if (!qualite.fiable) {
        return this._echecVocal({
          msg, runId, staff, started,
          evenement: "voice_stt_peu_fiable",
          raison: qualite.griefs.join(" ; "),
          detail: { repetition: qualite.repetition, diversite: qualite.diversite },
          texte:
            "Je n'ai pas compris votre note vocale de façon sûre : la transcription part en " +
            "répétitions. Si vous avez mêlé deux langues dans le même enregistrement, " +
            "refaites-la dans une seule langue — ou écrivez-moi votre demande.",
        });
      }
      // La langue entendue oriente la réponse vocale : répondre en français à
      // une question posée en arabe serait pire que de ne pas répondre.
      if (langueEntendue) this.provider.langueSouhaitee?.(msg.fromJid, langueEntendue);
    }

    // 4. Réponse à une confirmation en attente ?
    const waiting = this.pending.get(msg.fromJid);
    if (waiting) {
      if (YES.test(text.trim())) {
        this.pending.delete(msg.fromJid);
        return this._execute(waiting.tool, waiting.params, { staff, msg, runId: waiting.runId, transcription, started, confirmed: true });
      }
      if (NO.test(text.trim())) {
        this.pending.delete(msg.fromJid);
        await this.provider.sendText(msg.fromJid, "Opération annulée.");
        this.audit.record({
          runId: waiting.runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role,
          channel: msg.kind, intent: waiting.tool.name, result: "CANCELLED", durationMs: Date.now() - started,
        });
        return { status: Status.CANCELLED, runId: waiting.runId };
      }
      // Ni oui ni non : on retombe dans la compréhension normale (nouvelle demande).
    }

    // 5. Compréhension (NLU ; réel : LLM)
    this.journalEtape?.({ event: "llm_request_started", run: runId });
    const debutNlu = Date.now();
    const brut = await this.interpret(text, { staff, tools: this.tools });
    const plan = normaliserPlan(brut, this.tools);
    this.journalEtape?.({
      event: "intent_detected",
      run: runId,
      intention: plan.type,
      outil: plan.nomOutil ?? null,
      rejet: plan.rejet ?? null,
      detail: plan.rejet ? plan.detail : null,
      dureeMs: Date.now() - debutNlu,
    });

    // 5a. Conversation — aucune donnée n'est touchée, aucune permission en jeu.
    if (plan.type === INTENTIONS.CONVERSATION) {
      await this.provider.sendText(msg.fromJid, plan.texte);
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: "conversation", result: "SUCCESS", durationMs: Date.now() - started,
      });
      this._metriques.conversations += 1;
      return { status: Status.COMPLETED, runId, conversation: true };
    }

    // 5a bis. Mission — plusieurs consultations, puis une synthese chiffree.
    if (plan.type === INTENTIONS.MISSION) {
      return this._conduireMission({ plan, staff, msg, runId, started });
    }

    // 5b. Clarification.
    if (plan.type === INTENTIONS.CLARIFIER) {
      await this.provider.sendText(msg.fromJid, plan.question);
      return { status: Status.WAITING_INPUT, runId };
    }

    // 5c. Contrat rompu. On NOMME ce qui s'est passé : « Action inconnue. »
    // ne permettait aucun diagnostic, et laissait croire à un refus métier.
    if (plan.type !== INTENTIONS.OUTIL) {
      await this.provider.sendText(msg.fromJid, this._messageDeRejet(plan));
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: null, result: "PLAN_INVALIDE", error: `${plan.rejet}:${plan.detail ?? ""}`,
        durationMs: Date.now() - started,
      });
      return { status: Status.WAITING_INPUT, runId, rejet: plan.rejet };
    }

    const tool = plan.tool;
    plan.params = plan.params ?? {};

    // 6. Validation des paramètres (mêmes règles que guergne) — aucune écriture si invalide
    const errs = tool.validate(plan.params ?? {});
    if (Object.keys(errs).length > 0) {
      await this.provider.sendText(msg.fromJid, "Précisez : " + Object.values(errs).join(" "));
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: tool.name, params: plan.params, result: "INVALID", durationMs: Date.now() - started,
      });
      return { status: Status.WAITING_INPUT, runId, errors: errs };
    }

    // 7. Pré-filtre de permission (le backend guergne reste l'autorité réelle)
    if (!this.permissions.allows(staff, tool.permission)) {
      await this.provider.sendText(msg.fromJid, "Vous n'avez pas les droits pour cette opération.");
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: tool.name, params: plan.params, permission: `DENIED:${tool.permission}`,
        result: "DENIED", durationMs: Date.now() - started,
      });
      return { status: Status.FAILED, reason: "permission", runId };
    }

    // 8. Confirmation forte pour une opération sensible ou en lot (brief §10)
    // 7 bis. Politique d'execution — autorisation PERMANENTE plutot que
    // confirmation repetee.
    //
    // Une confirmation donnee machinalement soixante fois par jour ne protege
    // plus rien : elle entraine au reflexe, et le jour ou la demande est
    // anormale, elle est approuvee comme les autres. L'etablissement decide
    // une fois ce que l'agent fait seul ; l'agent n'interrompt que ce qui sort
    // de ce cadre.
    //
    // Une politique ne donne JAMAIS une permission : le pre-filtre RBAC vient
    // de passer, et le garde du backend aura le dernier mot. Elle ne peut
    // qu'enlever une friction.
    const verdict = this.politiques?.decider({ outil: tool, params: plan.params, staff }) ?? {
      decision: DECISIONS.CONFIRMATION,
      motif: MOTIFS.AUCUNE_POLITIQUE,
    };
    this.journalEtape?.({
      event: "politique_evaluee",
      run: runId,
      outil: tool.name,
      decision: verdict.decision,
      politique: verdict.politique ?? null,
      version: verdict.version ?? null,
      motif: verdict.motif ?? null,
      detail: verdict.detail ?? null,
    });

    const automatique = verdict.decision === DECISIONS.AUTOMATIQUE;
    if (automatique) {
      this._metriques.automatiques += 1;
      this.politiques?.enregistrerExecution?.({ politique: verdict.politique, staff });
    }

    const exigeConfirmation = !automatique && (tool.sensitivity === SENSITIVE || tool.requiresConfirmation);
    if (exigeConfirmation && !plan.confirmed) {
      this._metriques.confirmationsDemandees += 1;
      this.pending.set(msg.fromJid, { tool, params: plan.params ?? {}, runId });
      await this.provider.sendText(
        msg.fromJid,
        `${tool.summarize(plan.params ?? {})}\nRépondez *oui* pour confirmer, *non* pour annuler.`,
      );
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: tool.name, params: plan.params, result: "WAITING_APPROVAL", durationMs: Date.now() - started,
      });
      return { status: Status.WAITING_APPROVAL, runId };
    }

    // 9. Exécution
    return this._execute(tool, plan.params ?? {}, { staff, msg, runId, transcription, started, confirmed: !!plan.confirmed, verdict });
  }

  /**
   * Ce que lit l'utilisateur quand le modele a rompu le contrat.
   *
   * Chaque cas dit ce qui s'est passe et ce qu'il peut faire. Un message
   * unique et opaque — « Action inconnue. » — ne renseignait ni l'un ni
   * l'autre.
   */
  _messageDeRejet(plan) {
    switch (plan.rejet) {
      case "OUTIL_INCONNU":
        return "Je ne sais pas faire cette operation. Demandez-moi plutot une consultation d'assiduite, de retards, d'incidents ou de sanctions.";
      case "DONNEES_INVENTEES":
        // Le cas le plus important : mieux vaut une question qu'un chiffre faux.
        return "Je ne peux pas repondre de memoire a une question sur l'etablissement. Precisez la classe et la periode, et j'irai consulter les donnees reelles.";
      case "CHAMP_MANQUANT":
      case "INTENTION_INCONNUE":
      case "PLAN_ABSENT":
      default:
        return "Je n'ai pas compris votre demande. Reformulez-la, par exemple : « les absences de la 6eme B cette semaine ».";
    }
  }

  /**
   * Conduit une mission : plusieurs consultations, puis une synthese.
   *
   * Chaque etape repasse par la chaine complete — RBAC, politique, garde du
   * backend. Une mission n'est pas un laissez-passer : c'est une suite
   * d'appels dont chacun est controle comme s'il etait seul.
   *
   * Une etape qui echoue n'arrete pas la mission : on poursuit les autres, et
   * le bilan dit ce qui manque. Rendre un bilan muet sur ce qu'il n'a pas pu
   * lire laisserait croire que le reste est complet.
   */
  async _conduireMission({ plan, staff, msg, runId, started }) {
    const verif = validerMission(plan, this.tools);
    if (!verif.ok) {
      this.journalEtape?.({ event: "mission_refusee", run: runId, raison: verif.raison });
      await this.provider.sendText(
        msg.fromJid,
        "Je n'ai pas pu preparer ce travail. Demandez-moi plutot une consultation precise, par exemple « les absences de la 6eme B cette semaine ».",
      );
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: "mission", result: "PLAN_INVALIDE", error: verif.raison, durationMs: Date.now() - started,
      });
      return { status: Status.WAITING_INPUT, runId, rejet: "MISSION_INVALIDE" };
    }

    this.journalEtape?.({ event: "mission_demarree", run: runId, but: verif.but, etapes: verif.etapes.length });
    const resultats = [];

    for (const [i, etape] of verif.etapes.entries()) {
      const rang = i + 1;
      const base = { libelle: etape.libelle, outil: etape.nomOutil };

      if (!this.permissions.allows(staff, etape.tool.permission)) {
        // Une etape refusee n'arrete pas la mission : les autres restent utiles.
        this._metriques.refusPermission += 1;
        resultats.push({ ...base, statut: ETAPE.REFUSEE, detail: `droits insuffisants (${etape.tool.permission})` });
        this.journalEtape?.({ event: "mission_etape", run: runId, rang, statut: ETAPE.REFUSEE, outil: etape.nomOutil });
        continue;
      }

      const verdict = this.politiques?.decider({ outil: etape.tool, params: etape.params, staff }) ?? null;
      if (verdict?.decision === "AUTOMATIQUE") {
        this._metriques.automatiques += 1;
        this.politiques?.enregistrerExecution?.({ politique: verdict.politique, staff });
      }

      const r = await this._appelerAvecReprise({ etape, staff, runId, rang });
      resultats.push({ ...base, ...r });
      this.journalEtape?.({
        event: "mission_etape", run: runId, rang, statut: r.statut, outil: etape.nomOutil,
        lignes: r.agregat?.total ?? null, reprises: r.reprises ?? 0,
      });
    }

    const bilan = rendreBilan({ but: verif.but, resultats });
    await this.provider.sendText(msg.fromJid, bilan);
    this._metriques.rapportsGeneres += 1;

    // Un bilan rendu en texte se lit une fois puis se perd dans la
    // conversation. On joint donc un vrai fichier, qui s'imprime et se garde.
    const fichier = await this._joindreRapport({ but: verif.but, resultats, msg, runId });

    const reussies = resultats.filter((r) => r.statut === ETAPE.REUSSIE).length;
    this.audit.record({
      runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
      intent: "mission", params: { but: verif.but, etapes: verif.etapes.map((e) => e.nomOutil) },
      result: reussies === resultats.length ? "SUCCESS" : reussies ? "PARTIAL" : "FAILURE",
      durationMs: Date.now() - started,
    });
    this.journalEtape?.({ event: "mission_terminee", run: runId, reussies, total: resultats.length });

    // Les responsables sont informes du rapport, pas sollicites pour l'autoriser.
    await this._diffuserRapport({ but: verif.but, bilan, staff, runId, fichier });

    return {
      status: reussies ? Status.COMPLETED : Status.FAILED,
      runId,
      mission: { but: verif.but, reussies, total: resultats.length },
    };
  }

  /**
   * Appelle une consultation, avec une seconde tentative si la panne est
   * passagere.
   *
   * La reprise ne vaut que pour les LECTURES : rejouer une ecriture dont le
   * resultat est incertain creerait un doublon dans le dossier d'un eleve.
   * Et un refus de permission n'est jamais reessaye — ce serait insister
   * contre une decision de securite.
   */
  async _appelerAvecReprise({ etape, staff, runId, rang }) {
    let reprises = 0;
    for (let tentative = 1; tentative <= 2; tentative += 1) {
      try {
        const fn = this.guergne[etape.tool.action];
        if (typeof fn !== "function") throw new Error(`action guergne absente : ${etape.tool.action}`);
        const r = await fn.call(this.guergne, etape.params, { actorId: staff.id });
        if (r?.ok === false) {
          if (tentative === 1 && estTransitoire(r.message)) {
            reprises += 1;
            continue;
          }
          this._metriques.operationsEchouees += 1;
          return { statut: ETAPE.ECHOUEE, detail: String(r.message ?? "refus").slice(0, 100), reprises };
        }
        if (reprises) this._metriques.repriseApresEchec += 1;
        // Les etapes de mission ne passent pas par `_execute` : sans ce
        // comptage, un bilan de quatre consultations en affichait zero.
        this._metriques.consultations += 1;
        this._metriques.operationsReussies += 1;
        return { statut: ETAPE.REUSSIE, agregat: agreger(r?.data), reprises };
      } catch (e) {
        const message = String(e?.message ?? e);
        if (tentative === 1 && estTransitoire(message)) {
          reprises += 1;
          this.journalEtape?.({ event: "mission_reprise", run: runId, rang, raison: message.slice(0, 80) });
          continue;
        }
        this._metriques.operationsEchouees += 1;
        return { statut: ETAPE.ECHOUEE, detail: message.slice(0, 100), reprises };
      }
    }
    return { statut: ETAPE.ECHOUEE, detail: "echec apres reprise", reprises };
  }

  /**
   * Genere et envoie le rapport en piece jointe.
   *
   * L'echec n'est jamais fatal : le bilan textuel vient d'etre envoye, et le
   * perdre pour un probleme de format serait absurde. On le dit, et on
   * continue.
   */
  async _joindreRapport({ but, resultats, msg, runId }) {
    if (typeof this.provider.sendMedia !== "function") return null;
    try {
      const modele = documentDeMission({ but, resultats, periode: this.periodeRapport ?? null });
      const fichier = await genererDocument(modele);
      await this.provider.sendMedia(msg.fromJid, {
        data: fichier.data,
        mimetype: fichier.mimetype,
        filename: fichier.nomFichier,
        caption: but,
      });
      this.journalEtape?.({
        event: "document_genere",
        run: runId,
        format: fichier.format,
        octets: fichier.octets,
        nom: fichier.nomFichier,
      });
      this._metriques.documentsGeneres += 1;
      return fichier;
    } catch (e) {
      this.journalEtape?.({ event: "document_echoue", run: runId, erreur: String(e?.message ?? e).slice(0, 140) });
      return null;
    }
  }

  /**
   * Confie une notification a la file.
   *
   * La file dedoublonne, reessaie et persiste. Sans elle, une coupure d'une
   * seconde faisait disparaitre une alerte sans que personne ne le sache :
   * l'operation, elle, avait reussi.
   *
   * L'echec n'est JAMAIS propage a l'appelant — l'operation notifiee a deja eu
   * lieu, et la perdre pour un probleme d'envoi serait absurde.
   */
  async _mettreEnFile({ jid, texte, media = null, run, sujet }) {
    const cle = cleNotification({ run, sujet, jid });
    if (!this.notifications) {
      // Sans file configuree (tests, demonstrations), on envoie directement.
      try {
        await this.provider.sendText(jid, texte);
        if (media && typeof this.provider.sendMedia === "function") await this.provider.sendMedia(jid, media);
        this._metriques.notificationsEnvoyees += 1;
      } catch (e) {
        this.journalEtape?.({ event: "notification_echouee", run, erreur: String(e?.message ?? e).slice(0, 120) });
      }
      return;
    }
    try {
      const r = await this.notifications.envoyerMaintenant({ jid, texte, media, cle, run });
      if (r.envoyee) this._metriques.notificationsEnvoyees += 1;
      else if (r.raison === "doublon") this._metriques.notificationsDedoublonnees += 1;
      else this._metriques.notificationsEnAttente += 1;
    } catch (e) {
      this.journalEtape?.({ event: "notification_echouee", run, erreur: String(e?.message ?? e).slice(0, 120) });
    }
  }

  /** Transmet un rapport aux responsables, sans rien leur demander. */
  async _diffuserRapport({ but, bilan, staff, runId, fichier = null }) {
    const roles = this.rolesRapport ?? ["SUPER_ADMIN", "DIRECTION"];
    const destinataires = (await this.destinatairesNotification?.(roles)) ?? [];
    for (const jid of destinataires) {
      // L'auteur de la demande vient de recevoir le bilan : le lui envoyer
      // deux fois serait du bruit.
      if (jid === `${staff.msisdn}@c.us`) continue;
      // Le MÊME fichier, pas un second calcul : deux rapports qui
      // différeraient d'une ligne seraient impossibles à rapprocher.
      const media = fichier
        ? { data: fichier.data, mimetype: fichier.mimetype, filename: fichier.nomFichier, caption: but }
        : null;
      await this._mettreEnFile({
        jid,
        texte: `${but} (prepare automatiquement)\n\n${bilan}`,
        media,
        run: runId,
        sujet: "rapport",
      });
    }
  }

  /**
   * Informe les responsables d'une operation executee automatiquement.
   *
   * Trois garde-fous :
   *   - la politique decide QUAND (jamais / echec / toujours) : noyer les
   *     responsables sous les accuses de reception reviendrait a ce qu'ils ne
   *     lisent plus rien ;
   *   - on ne notifie que les operations AUTOMATIQUES : une operation qu'un
   *     humain vient de confirmer n'a pas besoin de lui etre annoncee ;
   *   - le message ne porte aucune donnee d'eleve, seulement l'operation,
   *     l'auteur et le resultat. Une notification part sur WhatsApp, pas dans
   *     le portail.
   */
  async _informerResponsables({ verdict, tool, staff, ok, runId, erreur, resultat }) {
    const quand = verdict?.notifier?.quand;
    if (!verdict?.politique || !quand || quand === NOTIFIER.JAMAIS) return;
    if (quand === NOTIFIER.ECHEC && ok) return;

    const roles = verdict.notifier.destinataires ?? [];
    const destinataires = (await this.destinatairesNotification?.(roles)) ?? [];
    if (destinataires.length === 0) return;

    const texte =
      `${ok ? "Operation effectuee" : "ECHEC d'operation"} — ${tool.name}\n` +
      `Par : ${staff.role}\n` +
      `Politique : ${verdict.politique} (v${verdict.version})\n` +
      (ok ? "" : `Motif : ${String(erreur?.message ?? resultat?.message ?? "inconnu").slice(0, 120)}\n`) +
      `Reference : ${runId}`;

    for (const jid of destinataires) {
      await this._mettreEnFile({ jid, texte, run: runId, sujet: `operation:${tool.name}` });
    }
  }

  async _execute(tool, params, { staff, msg, runId, transcription, started, confirmed, verdict = null }) {
    // État avant (si le client sait le lire)
    let before = null;
    if (this.guergne.snapshot) {
      try { before = await this.guergne.snapshot(tool, params); } catch { before = null; }
    }

    let result = null;
    let error = null;
    try {
      const fn = this.guergne[tool.action];
      if (typeof fn !== "function") throw new Error(`action guergne absente : ${tool.action}`);
      // A partir d'ici, l'effet metier est incertain : meme si l'appel echoue,
      // l'ecriture a pu aboutir cote plateforme. La revendication ne sera donc
      // plus relachee — rejouer creerait un doublon dans le dossier d'un eleve.
      this._actionsEngagees.add(runId);
      result = await fn.call(this.guergne, params, { actorId: staff.id });
    } catch (e) {
      error = e;
    }

    // Vérification : une réussite n'est affirmée que si le backend l'a confirmée (Règle 9)
    const ok = !error && !!result && result.ok !== false;
    this._metriques[ok ? "operationsReussies" : "operationsEchouees"] += 1;
    this._metriques[tool.sensitivity === "read" ? "consultations" : "ecritures"] += 1;

    // Les responsables sont INFORMES, pas sollicites : la notification rend
    // compte d'un travail deja fait, elle ne demande rien. C'est la difference
    // entre une supervision et un goulot d'etranglement.
    await this._informerResponsables({ verdict, tool, staff, ok, runId, erreur: error, resultat: result });
    let after = null;
    if (ok && this.guergne.snapshot) {
      try { after = await this.guergne.snapshot(tool, params); } catch { after = null; }
    }

    this.audit.record({
      runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
      message: msg.text, transcription, intent: tool.name, params, permission: `OK:${tool.permission}`,
      confirmation: confirmed ? { by: staff.id, at: new Date().toISOString() } : null,
      before, after, result: ok ? "SUCCESS" : "FAILURE",
      error: error ? String(error.message ?? error) : result && result.ok === false ? result.message : null,
      durationMs: Date.now() - started,
    });

    if (ok) {
      // Les écritures portent leur propre message ; les lectures renvoient
      // `data` et rien d'autre. Sans mise en forme, l'utilisateur recevait un
      // accusé vide — « ✅ Opération effectuée. » — et la donnée qu'il avait
      // demandée était perdue en route. Le rendu appartient au registre, qui
      // connaît la forme des lignes.
      // Deux enveloppes se superposent : la route repond
      // `{ok:true, data:<Resultat>}`, et c'est le `Resultat` du domaine qui
      // porte le message utile — « 1 absence enregistre(s). Les tuteurs seront
      // notifies. » En ne lisant que `result.message`, l'agent repondait un
      // accuse generique et escamotait justement l'avertissement sur la
      // notification aux tuteurs.
      let texte = result.message ?? (Array.isArray(result.data) ? undefined : result.data?.message);
      if (!texte && typeof tool.rendre === "function") {
        // Un rendu qui échoue ne doit pas transformer une lecture réussie en
        // échec : on retombe sur l'accusé générique.
        try {
          texte = tool.rendre(result.data, params);
        } catch {
          texte = null;
        }
      }
      await this.provider.sendText(msg.fromJid, texte || "✅ Opération effectuée.");
      return { status: Status.COMPLETED, runId, result };
    }
    await this.provider.sendText(msg.fromJid, result && result.message ? result.message : "❌ L'opération a échoué.");
    return { status: Status.FAILED, runId, error: error ? String(error.message ?? error) : result?.message ?? null };
  }
}
