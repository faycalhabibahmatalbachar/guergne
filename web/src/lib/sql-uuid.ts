import { sql } from "drizzle-orm";

/**
 * Séquence SQL de paramètres UUID typés destinée à une clause IN (...).
 *
 * Le driver Neon / pg ne sérialise pas un tableau JavaScript comme un
 * littéral PostgreSQL uuid[]. Utiliser ANY(${ids}::uuid[]) avec un tableau
 * JS provoque l’erreur PostgreSQL 22P02 « malformed array literal ».
 * Ici chaque UUID devient un paramètre séparé, sans concaténation SQL libre.
 * Appeler cette fonction seulement pour une liste non vide et validée.
 */
export function parametresUuid(ids: readonly string[]) {
  return sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
}
