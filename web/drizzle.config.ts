import { defineConfig } from "drizzle-kit";

/**
 * Le schéma fait foi côté SQL (`db/migrations/*.sql`), pas côté TypeScript.
 *
 * Ce choix est délibéré : les déclencheurs, index partiels, contraintes
 * `NULLS NOT DISTINCT` et vues du projet ne sont pas tous exprimables dans le
 * DSL de Drizzle. On écrit donc le SQL à la main, puis on régénère les types
 * TypeScript par introspection (`npm run db:pull`).
 *
 * Les migrations sont appliquées par `scripts/migrate.mjs` sur la connexion
 * DIRECTE — le pooler Neon en mode transaction ne supporte pas tout le DDL.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/generated",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
