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
import { creerAttente, evaluerReponse } from "./confirmation.js";
import { DECISIONS, MOTIFS, NOTIFIER } from "./politiques.js";
import { RAISONS, analyserJid, empreinte, jidUtilisateur, resoudreNumeroDepuisJid } from "./jid.js";
import { INTENTIONS, normaliserPlan } from "./plan.js";
import { analyserCommandeMemoire } from "./memory-policy.js";
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
  async _sendText(msg, texte, { remember = false, intention = null, tool = null } = {}) {
    await this.provider.sendText(msg.fromJid, texte);
    if (this.memory?.enabled && msg?.memoryContext?.conversationId) {
      try {
        await this.memory.appendMessage({
          session: msg.memoryContext,
          text: texte,
          direction: "outbound",
          messageType: "text",
          retainContent: remember,
          intent: intention,
          tool,
        });
      } catch (error) {
        this.journalEtape?.({ event: "memory_reply_save_failed", code: error?.code ?? "unknown" });
      }
    }
  }

  async _clearMemoryState(session) {
    if (!this.memory?.enabled || !session?.conversationId) return;
    try {
      await this.memory.clearState(session);
    } catch (error) {
      this.journalEtape?.({ event: "memory_state_clear_failed", code: error?.code ?? "unknown" });
    }
  }

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
        await this._sendText(msg, "Une erreur technique m'a empêché de traiter votre message. Réessayez dans un instant.");
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
      await this._sendText(msg, "Numéro non autorisé.");
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
      await this._sendText(msg, texte);
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

    let memoryContext = null;
    if (this.memory?.enabled) {
      try {
        memoryContext = await this.memory.prepare({
          actorId: staff.id,
          // Le JID canonique du numéro déjà autorisé, jamais un LID volatil.
          jid: jidUtilisateur(resolution.numero),
          providerMessageId: msg.id,
          text,
          messageType: msg.kind,
        });
        msg.memoryContext = memoryContext;
        this.journalEtape?.({
          event: "memory_context_loaded",
          run: runId,
          historyMessages: memoryContext.history?.length ?? 0,
          pending: memoryContext.pending?.intention ?? null,
        });
      } catch (error) {
        this.journalEtape?.({ event: "memory_unavailable", run: runId, code: error?.code ?? "unknown" });
        msg.memoryContext = null;
      }
    }

    // Commandes explicites de mémoire. Elles sont traitées après authentification
    // et avant le NLU ; aucune donnée scolaire n'est envoyée au modèle pour cela.
    const commandeMemoire = analyserCommandeMemoire(text);
    if (commandeMemoire) {
      if (!this.memory?.enabled) {
        await this._sendText(msg, "La mémoire conversationnelle n'est pas activée.");
        return { status: Status.COMPLETED, runId, memory: "disabled" };
      }
      if (commandeMemoire.type === "remember") {
        await this.memory.saveFact({
          actorId: staff.id,
          category: commandeMemoire.category,
          key: commandeMemoire.key,
          value: commandeMemoire.value,
          source: "user_explicit",
          importance: 4,
        });
        await this._sendText(msg,
          "C'est noté. Je retiendrai votre préférence : " + commandeMemoire.value +
          ". Vous pouvez dire « Mémoire » pour la consulter ou « Oublie ma mémoire » pour l'effacer.");
        return { status: Status.COMPLETED, runId, memory: "saved" };
      }
      if (commandeMemoire.type === "show") {
        const facts = await this.memory.listFacts(staff.id);
        const texte = facts.length
          ? "Voici les préférences que j'ai mémorisées :\n" +
            facts.map((f) => "• " + f.key + " : " + f.value).join("\n")
          : "Je n'ai encore aucune préférence durable enregistrée.";
        await this._sendText(msg, texte);
        return { status: Status.COMPLETED, runId, memory: "listed", count: facts.length };
      }
      if (commandeMemoire.type === "forget") {
        this.pending.delete(msg.fromJid);
        const deleted = await this.memory.forgetActor(staff.id);
        msg.memoryContext = null;
        await this.provider.sendText(
          msg.fromJid,
          "Votre mémoire conversationnelle a été effacée : préférences, résumés, historique et demandes en attente.",
        );
        this.journalEtape?.({ event: "memory_forgotten", run: runId, ...deleted });
        return { status: Status.COMPLETED, runId, memory: "forgotten", deleted };
      }
      if (commandeMemoire.type === "unsupported_remember") {
        await this._sendText(msg,
          "Pour protéger les informations des élèves, je mémorise uniquement trois préférences : " +
          "la langue, le style de réponse et le format des rapports. Exemple : « Retiens que je préfère les réponses courtes ». " +
          "Aucun nom, dossier ou renseignement scolaire n'est conservé comme préférence.");
        return { status: Status.WAITING_INPUT, runId, memory: "unsupported" };
      }
    }

    // 4. Réponse à une confirmation en attente ?
    //
    // L'attente est à usage unique et RETIRÉE dès qu'on la lit : quelle que
    // soit l'issue, un second message ne la retrouvera pas. Voir
    // `confirmation.js` pour les trois failles que cela ferme.
    //
    // Après un redémarrage, elle peut être relue depuis la mémoire Neon. Elle
    // n'est alors reprise que si elle porte l'empreinte, l'expiration et
    // l'utilisateur d'une attente durcie : `evaluerReponse` recalcule
    // l'empreinte et applique le délai, exactement comme pour une attente en
    // mémoire vive. Une ancienne forme, sans ces garanties, est ignorée.
    const pendingMemory = memoryContext?.pending;
    const persistee =
      pendingMemory?.intention === "approval" && pendingMemory.empreinte && Number.isFinite(pendingMemory.expireA)
        ? (() => {
            const t = this.tools.get(pendingMemory.tool);
            return t
              ? Object.freeze({
                  tool: t,
                  params: pendingMemory.params ?? {},
                  runId: pendingMemory.runId ?? runId,
                  staffId: pendingMemory.staffId,
                  empreinte: pendingMemory.empreinte,
                  expireA: pendingMemory.expireA,
                })
              : null;
          })()
        : null;
    const waiting = this.pending.get(msg.fromJid) ?? persistee;
    if (waiting) {
      this.pending.delete(msg.fromJid);
      const issue = evaluerReponse(waiting, { texte: text, staffId: staff.id });
      this.journalEtape?.({ event: "confirmation_evaluee", run: waiting.runId, outil: waiting.tool.name, issue, empreinte: waiting.empreinte });
      // Quelle que soit l'issue, l'attente persistée tombe avec l'attente vive.
      if (pendingMemory?.intention === "approval") await this._clearMemoryState(memoryContext);
      if (issue === "confirmer") {
        // Les droits sont revérifiés au moment du oui : ils ont pu changer
        // depuis le récapitulatif, a fortiori après un redémarrage.
        if (!this.permissions.allows(staff, waiting.tool.permission)) {
          await this._sendText(msg, "Vous n'avez plus les droits pour cette opération.");
          this.audit.record({
            runId: waiting.runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role,
            channel: msg.kind, intent: waiting.tool.name, result: "DENIED",
            permission: "DENIED:" + waiting.tool.permission, durationMs: Date.now() - started,
          });
          return { status: Status.FAILED, reason: "permission", runId: waiting.runId };
        }
        return this._execute(waiting.tool, waiting.params, { staff, msg, runId: waiting.runId, transcription, started, confirmed: true });
      }
      if (issue === "annuler" || issue === "expiree" || issue === "autre_utilisateur") {
        const texteIssue = {
          annuler: "Opération annulée.",
          expiree: "La demande de confirmation a expiré : rien n'a été modifié. Reformulez la demande si elle tient toujours.",
          autre_utilisateur: "Cette confirmation ne correspond pas à la demande en cours : rien n'a été modifié.",
        }[issue];
        await this._sendText(msg, texteIssue);
        this.audit.record({
          runId: waiting.runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role,
          channel: msg.kind, intent: waiting.tool.name,
          result: issue === "annuler" ? "CANCELLED" : issue === "expiree" ? "EXPIRED" : "REJECTED_CONFIRMATION",
          durationMs: Date.now() - started,
        });
        return { status: Status.CANCELLED, runId: waiting.runId, raison: issue };
      }
      // « abandonnee » : ni oui ni non NETS. L'attente est tombée — un « oui »
      // ultérieur ne la ressuscitera pas — et le message est compris comme une
      // nouvelle demande. On le consigne : une écriture qui n'a pas eu lieu
      // doit laisser une trace aussi.
      this.audit.record({
        runId: waiting.runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role,
        channel: msg.kind, intent: waiting.tool.name, result: "SUPERSEDED", durationMs: Date.now() - started,
      });
    }

    // 5. Compréhension (NLU ; réel : LLM)
    this.journalEtape?.({ event: "llm_request_started", run: runId });
    const debutNlu = Date.now();
    const brut = await this.interpret(text, {
      staff,
      tools: this.tools,
      memory: {
        history: memoryContext?.history ?? [],
        pending: memoryContext?.pending ?? null,
        summaries: memoryContext?.summaries ?? [],
        facts: memoryContext?.facts ?? [],
        lastTask: memoryContext?.lastTask ?? null,
      },
    });
    const plan = normaliserPlan(brut, this.tools);
    if (memoryContext && typeof this.memory?.annotateInbound === "function") {
      try {
        await this.memory.annotateInbound({
          session: memoryContext,
          providerMessageId: msg.id,
          text,
          intention: plan.type,
          tool: plan.nomOutil ?? null,
          retainContent: plan.type === INTENTIONS.CONVERSATION,
        });
      } catch (error) {
        this.journalEtape?.({ event: "memory_message_classification_failed", code: error?.code ?? "unknown" });
      }
    }
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
      await this._sendText(msg, plan.texte, { remember: true, intention: "conversation" });
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
      if (plan.tool && memoryContext) {
        await this.memory.saveState(memoryContext, {
          intention: "clarification",
          tool: plan.nomOutil,
          params: plan.params ?? {},
          missingFields: plan.missingFields ?? [],
        });
      }
      await this._sendText(msg, plan.question);
      return { status: Status.WAITING_INPUT, runId };
    }

    // 5c. Contrat rompu. On NOMME ce qui s'est passé : « Action inconnue. »
    // ne permettait aucun diagnostic, et laissait croire à un refus métier.
    if (plan.type !== INTENTIONS.OUTIL) {
      await this._sendText(msg, this._messageDeRejet(plan));
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
      if (memoryContext) {
        await this.memory.saveState(memoryContext, {
          intention: "clarification",
          tool: tool.name,
          params: plan.params ?? {},
          missingFields: Object.keys(errs),
        });
      }
      await this._sendText(msg, "Précisez : " + Object.values(errs).join(" "));
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: tool.name, params: plan.params, result: "INVALID", durationMs: Date.now() - started,
      });
      return { status: Status.WAITING_INPUT, runId, errors: errs };
    }

    // 7. Pré-filtre de permission (le backend guergne reste l'autorité réelle)
    if (!this.permissions.allows(staff, tool.permission)) {
      await this._clearMemoryState(memoryContext);
      await this._sendText(msg, "Vous n'avez pas les droits pour cette opération.");
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
        intent: tool.name, params: plan.params, permission: `DENIED:${tool.permission}`,
        result: "DENIED", durationMs: Date.now() - started,
      });
      return { status: Status.FAILED, reason: "permission", runId };
    }

    // 7 ter. PRÉPARATION : LES NOMS DEVIENNENT DES IDENTIFIANTS RÉELS.
    //
    // Personne ne dicte un UUID sur WhatsApp. Un outil qui sait `preparer`
    // résout « Mahamat », « 6e A » ou « sixième » contre les données RELUES au
    // backend, dans le périmètre de l'acteur, et complète ses paramètres —
    // l'inscription active, par exemple. Il s'arrête net sur une ambiguïté ou
    // une entité introuvable : choisir à la place de l'utilisateur serait pire
    // que de lui reposer la question.
    //
    // Le récapitulatif soumis à confirmation vient d'ici : il nomme ce que le
    // backend connaît, et non ce que le modèle a écrit. Un libellé fourni par
    // le modèle peut ne pas correspondre à l'identifiant qu'il a recopié — on
    // confirmerait « 6ème A » en écrivant dans la 6ème B.
    let preparation = null;
    if (typeof tool.preparer === "function") {
      try {
        preparation = await tool.preparer(plan.params ?? {}, { guergne: this.guergne, ctx: { actorId: staff.id } });
      } catch (e) {
        preparation = { ok: false, message: `Impossible de préparer la demande : ${resumerErreur(e)}` };
      }
      if (!preparation || preparation.ok === false) {
        await this.provider.sendText(msg.fromJid, preparation?.message ?? "La demande ne peut pas être préparée.");
        this.audit.record({
          runId, sender: msg.senderMsisdn, identity: staff.id, role: staff.role, channel: msg.kind,
          intent: tool.name, params: plan.params, result: "REJECTED_BEFORE_EXECUTION", durationMs: Date.now() - started,
        });
        return { status: Status.WAITING_INPUT, reason: "preparation", runId };
      }
      if (preparation.params) plan.params = preparation.params;
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

    // Une politique ne rend jamais automatique une écriture à confirmation
    // obligatoire : elle serait comptée comme exécutée seule sans l'avoir été.
    const automatique = verdict.decision === DECISIONS.AUTOMATIQUE && tool.confirmationObligatoire !== true;
    if (automatique) {
      this._metriques.automatiques += 1;
      this.politiques?.enregistrerExecution?.({ politique: verdict.politique, staff });
    }

    // Certaines écritures ne se dispensent JAMAIS de confirmation : créer un
    // dossier d'élève, changer sa classe, archiver. Une politique peut ôter la
    // friction d'un appel quotidien ; elle ne peut pas ôter celle-là.
    const exigeConfirmation =
      tool.confirmationObligatoire === true || (!automatique && (tool.sensitivity === SENSITIVE || tool.requiresConfirmation));
    // `plan.confirmed` vient du modèle : il ne peut pas valoir confirmation
    // pour une écriture à confirmation obligatoire. Seul un « oui » humain, net
    // et dans le délai, l'autorise.
    const dejaConfirme = plan.confirmed && tool.confirmationObligatoire !== true;
    if (exigeConfirmation && !dejaConfirme) {
      this._metriques.confirmationsDemandees += 1;
      const attente = creerAttente({ tool, params: plan.params ?? {}, runId, staffId: staff.id });
      this.pending.set(msg.fromJid, attente);
      // Persistée pour survivre à un redémarrage — mais AVEC ce qui la rend
      // sûre : l'empreinte des paramètres figés, l'expiration et l'utilisateur.
      // Une attente relue sans eux est ignorée (voir l'étape 4).
      if (memoryContext) {
        await this.memory.saveState(memoryContext, {
          intention: "approval",
          tool: tool.name,
          params: attente.params,
          empreinte: attente.empreinte,
          expireA: attente.expireA,
          staffId: attente.staffId,
          runId,
          missingFields: [],
        });
      }
      // Le récapitulatif de `preparer` décrit ce que le BACKEND connaît ; à
      // défaut, le résumé de l'outil, bâti sur les seuls paramètres.
      const recapitulatif = preparation?.texte ?? tool.summarize(plan.params ?? {});
      await this._sendText(msg, `${recapitulatif}
Répondez *oui* pour confirmer, *non* pour annuler.`);
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
      await this._sendText(
        msg,
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
    await this._sendText(msg, bilan);
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
    let ok = !error && !!result && result.ok !== false;

    // RELIRE AVANT D'AFFIRMER.
    //
    // Un « ok » du backend dit que l'appel s'est bien passé. Il ne dit pas que
    // le dossier est dans l'état demandé. Une écriture qui sait se `verifier`
    // relit donc ce qui a été enregistré ; l'agent ne dit « fait » qu'après.
    let verification = null;
    if (ok && typeof tool.verifier === "function") {
      try {
        verification = await tool.verifier({ result, params, guergne: this.guergne, ctx: { actorId: staff.id } });
      } catch (e) {
        verification = { ok: false, raison: `relecture impossible : ${resumerErreur(e)}` };
      }
      this.journalEtape?.({ event: "ecriture_verifiee", run: runId, outil: tool.name, verifiee: verification?.ok === true, raison: verification?.raison ?? null });
    }
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
      // « UNVERIFIED » : le serveur a dit oui, la relecture ne l'a pas confirmé.
      // Ce n'est ni une réussite à annoncer, ni un échec à rejouer.
      before, after, result: ok ? (verification && verification.ok !== true ? "UNVERIFIED" : "SUCCESS") : "FAILURE",
      verification: verification ? { ok: verification.ok === true, raison: verification.raison ?? null } : null,
      error: error ? String(error.message ?? error) : result && result.ok === false ? result.message : null,
      durationMs: Date.now() - started,
    });

    if (ok && verification && verification.ok !== true) {
      // Le serveur a répondu « fait », la relecture ne le confirme pas. On ne
      // l'affirme donc pas — et on ne relance RIEN : l'écriture a pu aboutir,
      // la rejouer créerait un doublon. On le dit, avec ce qui a été constaté.
      await this.provider.sendText(
        msg.fromJid,
        `⚠️ Le serveur a accepté l'opération, mais je n'ai pas pu la vérifier en relisant le dossier : ${verification.raison ?? "état inattendu"}. Ne la considérez pas comme acquise avant un contrôle dans l'application.`,
      );
      return { status: Status.FAILED, runId, result, raison: "non_verifiee" };
    }

    if (ok) {
      // Une lecture réussie devient le périmètre de référence des demandes
      // de suivi. Seuls l'outil et les filtres autorisés sont persistés ;
      // aucun résultat ni contenu d'élève n'est mémorisé.
      if (tool.sensitivity === "read" && this.memory?.enabled && msg?.memoryContext?.conversationId) {
        try {
          await this.memory.saveLastTask(msg.memoryContext, { tool: tool.name, params });
          this.journalEtape?.({ event: "memory_last_task_saved", run: runId, tool: tool.name });
        } catch (memoryError) {
          this.journalEtape?.({ event: "memory_last_task_save_failed", code: memoryError?.code ?? "unknown" });
        }
      }
      // Une relecture réussie a le dernier mot : elle décrit ce qui EST
      // enregistré, et non ce que l'appel a promis.
      if (verification?.ok === true && verification.texte) {
        await this.provider.sendText(msg.fromJid, verification.texte);
        return { status: Status.COMPLETED, runId, result, verifiee: true };
      }
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
      await this._sendText(msg, texte || "✅ Opération effectuée.");
      await this._clearMemoryState(msg.memoryContext);
      return { status: Status.COMPLETED, runId, result };
    }
    await this._sendText(msg, result && result.message ? result.message : "❌ L'opération a échoué.");
    await this._clearMemoryState(msg.memoryContext);
    return { status: Status.FAILED, runId, error: error ? String(error.message ?? error) : result?.message ?? null };
  }
}
