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

const YES = /^(oui|confirme|confirmer|ok|valide|valider)\b/i;
const NO = /^(non|annule|annuler|cancel|stop)\b/i;

export class Agent {
  constructor(deps) {
    Object.assign(this, deps);
    this.pending = new Map(); // jid -> { tool, params, runId }
  }

  async handle(raw) {
    const runId = uid("run");
    const started = Date.now();
    const msg = normalizeIncoming(raw);

    // 1. Idempotence — un même message n'est traité qu'une fois (brief §11)
    if (this.idempotency.seen(msg.id)) return { status: Status.DUPLICATE, runId };
    this.idempotency.remember(msg.id);

    // 2. Identité — un numéro non lié est refusé (brief §3.1)
    const staff = this.identity.resolve(msg.fromJid);
    if (!staff) {
      await this.provider.sendText(msg.fromJid, "Numéro non autorisé.");
      this.audit.record({
        runId, sender: msg.senderMsisdn, identity: null, role: null, channel: msg.kind,
        message: msg.text, intent: null, result: "REFUSED_UNKNOWN", durationMs: Date.now() - started,
      });
      return { status: Status.REJECTED_UNKNOWN, runId };
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
    const plan = await this.interpret(text, { staff, tools: this.tools });
    if (!plan || plan.clarify) {
      await this.provider.sendText(msg.fromJid, plan?.clarify ?? "Je n'ai pas compris la demande.");
      return { status: Status.WAITING_INPUT, runId };
    }
    const tool = this.tools.get(plan.tool);
    if (!tool) {
      await this.provider.sendText(msg.fromJid, "Action inconnue.");
      return { status: Status.WAITING_INPUT, runId };
    }

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
      await this.provider.sendText(msg.fromJid, result.message ?? "✅ Opération effectuée.");
      return { status: Status.COMPLETED, runId, result };
    }
    await this.provider.sendText(msg.fromJid, result && result.message ? result.message : "❌ L'opération a échoué.");
    return { status: Status.FAILED, runId, error: error ? String(error.message ?? error) : result?.message ?? null };
  }
}
