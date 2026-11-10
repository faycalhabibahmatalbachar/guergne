/**
 * Lire le code d'une erreur PostgreSQL, où que Drizzle l'ait rangé.
 *
 * LE DÉFAUT QUE CE MODULE CORRIGE
 * --------------------------------
 * Les actions détectaient une violation d'unicité ainsi :
 *
 *     message.includes("duplicate key") || message.includes("23505")
 *
 * Mais Drizzle enveloppe l'erreur du pilote dans une `DrizzleQueryError` dont
 * le message est « Failed query: <requête> params: <valeurs> ». Le code
 * PostgreSQL vit dans `cause.code`, jamais dans le message. La branche
 * « doublon » ne s'exécutait donc JAMAIS : créer une classe dont le code
 * existait déjà répondait « La création de la classe a échoué. » au lieu de
 * « Cet élément existe déjà. » Constaté par la recette réelle du 2026-11-10.
 *
 * On remonte donc la chaîne des causes, sans jamais renvoyer le message brut
 * (il porte la requête et ses paramètres).
 */

/** Le code SQLSTATE (5 caractères) porté par l'erreur ou l'une de ses causes. */
export function codePostgres(erreur: unknown): string | null {
  let courant: unknown = erreur;
  for (let profondeur = 0; courant && profondeur < 4; profondeur += 1) {
    const code = (courant as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    courant = (courant as { cause?: unknown }).cause;
  }
  return null;
}

/** Violation d'une contrainte d'unicité (SQLSTATE 23505). */
export function estViolationUnicite(erreur: unknown): boolean {
  if (codePostgres(erreur) === "23505") return true;
  // Repli : un pilote qui ne remplirait pas `code` mais garderait le texte.
  const message = erreur instanceof Error ? erreur.message : "";
  return message.includes("duplicate key");
}
