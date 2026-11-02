/**
 * Harnais de test : construit un Agent entièrement câblé avec des doublures en
 * mémoire. Aucun accès réseau, WhatsApp, STT ou base — le cœur de l'agent est
 * testable hors ligne (c'est l'objet de l'abstraction du transport et des
 * dépendances injectées).
 */
import { Agent } from "../src/engine.js";
import { FakeProvider } from "../src/provider.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { AuditLog } from "../src/audit.js";
import { FakePermissionChecker } from "../src/guard.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";

export const JID_SURVEILLANT = "23566000001@c.us";
export const JID_INCONNU = "23599999999@c.us";

/** Simulateur du client guergne : enregistre les appels, renvoie un résultat. */
export class GuergneSim {
  constructor({ fail = null } = {}) {
    this.calls = [];
    this._fail = fail; // nom d'action à faire échouer, ou null
  }
  _run(action, params, ctx) {
    this.calls.push({ action, params, ctx });
    if (this._fail === action) return { ok: false, message: "Échec simulé côté guergne." };
    return { ok: true, message: `OK ${action}` };
  }
  listerAbsences(p, c) { return this._run("listerAbsences", p, c); }
  listerAlertes(p, c) { return this._run("listerAlertes", p, c); }
  controleSaisies(p, c) { return this._run("controleSaisies", p, c); }
  enregistrerAppel(p, c) { return this._run("enregistrerAppel", p, c); }
  enregistrerRetard(p, c) { return this._run("enregistrerRetard", p, c); }
  justifierEnLot(p, c) { return this._run("justifierEnLot", p, c); }
  supprimerAbsence(p, c) { return this._run("supprimerAbsence", p, c); }
  snapshot(tool, params) { return { tool: tool.name, params }; }
  countOf(action) { return this.calls.filter((c) => c.action === action).length; }
}

const DEFAULT_GRANTS = {
  surveillant: new Set(["assiduite:lire", "assiduite:saisir", "retard:saisir", "assiduite:justifier"]),
  secretaire: new Set(["assiduite:lire"]),
  directeur: new Set([
    "assiduite:lire", "assiduite:saisir", "retard:saisir", "assiduite:justifier", "eleve:exclure",
  ]),
};

export function makeAgent({ interpret, transcribe, grants = DEFAULT_GRANTS, guergne } = {}) {
  const provider = new FakeProvider();
  const identity = new IdentityStore([
    { jid: JID_SURVEILLANT, id: "staff-1", nom: "Awa Surveillante", role: "surveillant" },
  ]);
  const audit = new AuditLog();
  const sim = guergne ?? new GuergneSim();
  const agent = new Agent({
    provider,
    identity,
    idempotency: new IdempotencyStore(),
    audit,
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker(grants),
    guergne: sim,
    interpret: interpret ?? (async () => ({ clarify: "?" })),
    transcribe,
  });
  return { agent, provider, identity, audit, guergne: sim };
}

/** Construit un message entrant brut tel que le FakeProvider en recevrait un. */
export function incoming({ from = JID_SURVEILLANT, text = "", id = "m-" + Math.random().toString(36).slice(2), kind, media } = {}) {
  return { id, from, body: text, kind, media };
}
