/**
 * Sensibilité d'un outil (brief §10) : lecture / écriture ordinaire / sensible.
 * Les outils sensibles (et les écritures en lot) exigent une confirmation forte.
 */
export const READ = "read";
export const WRITE = "write";
export const SENSITIVE = "sensitive";

/**
 * Vérificateur de permissions. En production, il DÉLÈGUE au backend guergne, où
 * le `guard` est l'autorité réelle (AUTH -> RÔLE depuis la matrice en base ->
 * PÉRIMÈTRE). Ce contrôle côté agent n'est qu'un pré-filtre pour éviter un
 * aller-retour inutile et donner un message clair ; il ne REMPLACE jamais le
 * contrôle backend (Règle : aucune permission fondée uniquement sur l'agent).
 *
 * Implémentation fake (par rôle) pour les tests.
 */
export class FakePermissionChecker {
  /** @param grants { [role]: Set<permission> } */
  constructor(grants = {}) {
    this._grants = grants;
  }
  allows(staff, permission) {
    const set = this._grants[staff.role];
    return !!set && set.has(permission);
  }
}
