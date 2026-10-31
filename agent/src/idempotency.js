/**
 * Déduplication par identifiant de message : un même vocal/texte reçu deux fois
 * ne produit qu'une seule exécution (brief §11). Implémentation mémoire ; une
 * version persistante (base/Redis) la remplacera sans changer l'interface.
 */
export class IdempotencyStore {
  constructor() {
    this._seen = new Set();
  }
  seen(id) {
    return id != null && this._seen.has(id);
  }
  remember(id) {
    if (id != null) this._seen.add(id);
  }
}
