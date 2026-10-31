/**
 * Journal d'audit : une entrée par action de l'agent, forme alignée sur le
 * brief §6 (qui, quoi reçu, intention, outil, paramètres expurgés, permission,
 * confirmation, état avant/après, résultat, erreur, durée). `redact` retire les
 * secrets des paramètres AVANT journalisation (Règle 7 : ne jamais logguer un secret).
 */
export class AuditLog {
  constructor(sink = null) {
    this._entries = [];
    this._sink = sink;
  }
  record(entry) {
    const e = { at: new Date().toISOString(), ...entry, params: redact(entry.params) };
    this._entries.push(e);
    if (this._sink) this._sink(e);
    return e;
  }
  all() {
    return this._entries.slice();
  }
  /** Dernière entrée (utilitaire de test/supervision). */
  last() {
    return this._entries[this._entries.length - 1] ?? null;
  }
}

const SECRET_KEYS = /(token|secret|password|pin|otp|authorization|apikey|api_key)/i;

export function redact(params) {
  if (!params || typeof params !== "object") return params;
  const out = Array.isArray(params) ? [] : {};
  for (const [k, v] of Object.entries(params)) {
    if (SECRET_KEYS.test(k)) out[k] = "[redacted]";
    else if (v && typeof v === "object") out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}
