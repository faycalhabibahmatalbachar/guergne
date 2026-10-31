/**
 * Mapping JID WhatsApp -> compte interne guergne (modèle de la table `links`
 * de moov-ai). Un numéro non lié est refusé (brief §3.1). Implémentation
 * mémoire ; une implémentation adossée à la base la remplacera sans changer
 * l'interface (resolve/link).
 */
export class IdentityStore {
  constructor(seed = []) {
    this._byJid = new Map();
    for (const s of seed) this.link(s.jid, s);
  }
  link(jid, staff) {
    this._byJid.set(jid, {
      id: staff.id,
      nom: staff.nom,
      role: staff.role,
      msisdn: staff.msisdn ?? String(jid).split("@")[0],
    });
  }
  resolve(jid) {
    return this._byJid.get(jid) ?? null;
  }
  unlink(jid) {
    this._byJid.delete(jid);
  }
}
