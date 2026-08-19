import { customType } from "drizzle-orm/pg-core";

/**
 * Type `bytea` de PostgreSQL.
 *
 * L'introspection de Drizzle ne sait pas le traduire et produit
 * `unknown("contenu")`, qui ne compile pas. On le définit donc à la main ;
 * `scripts/corriger-schema.mjs` réinjecte cette définition après chaque
 * régénération, pour que la correction ne soit jamais perdue.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
