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
import { RAISONS, analyserJid, empreinte, jidUtilisateur, resoudreNumeroDepuisJid } from "./jid.js";
import { INTENTIONS, normaliserPlan } from "./plan.js";
// `masquer` est la mise en forme canonique du projet : la redefinir ici ferait
// diverger deux facons de masquer un numero.
import { masquer } from "./identity-store.js";

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
    try {
      return await this._traiter(raw, msg, runId, started);
    } catch (e) {
      const erreur = String(e?.message ?? e);
      this.journalEtape?.({ event: "handler_failed", run: runId, erreur: erreur.slice(0, 200) });

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
    }
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
      return { status: Status.REJECTED_UNKNOWN, runId, raison };
    }

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
    let text = msg.text;
    let transcription = null;
    if (msg.kind === "audio" && typeof this.transcribe === "function") {
      transcription = await this.transcribe(await this.provider.getMedia(raw));
      text = transcription ?? "";
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
      return { status: Status.COMPLETED, runId, conversation: true };
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
    if ((tool.sensitivity === SENSITIVE || tool.requiresConfirmation) && !plan.confirmed) {
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
    return this._execute(tool, plan.params ?? {}, { staff, msg, runId, transcription, started, confirmed: !!plan.confirmed });
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

  async _execute(tool, params, { staff, msg, runId, transcription, started, confirmed }) {
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
