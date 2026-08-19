/**
 * Formatage monétaire, partagé entre serveur et navigateur.
 *
 * Ce module ne doit importer NI la base de données NI `server-only` : il est
 * chargé par des composants client. Les requêtes vivent dans
 * `@/server/domain/finances`, qui reste strictement côté serveur.
 */

/**
 * Format monétaire du Tchad : entier, séparateur de milliers, sans décimale.
 *
 * Le franc CFA n'a pas de subdivision utilisée. Afficher « 150 000,00 F »
 * serait à la fois faux et illisible pour un comptable d'établissement.
 */
export function formaterFcfa(montant: number | string | null): string {
  const n = Number(montant ?? 0);
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)} F`;
}
