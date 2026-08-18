import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

/**
 * Client de base de données.
 *
 * Pilote retenu : `neon-serverless` (WebSocket) plutôt que `neon-http`.
 * Raison : `neon-http` ne supporte PAS les transactions, or elles sont
 * indispensables ici — verrouillage d'une période de notes, encaissement d'un
 * paiement avec mise à jour de l'échéancier, changement de statut d'un élève
 * avec écriture au journal d'audit. Ces opérations doivent être atomiques.
 *
 * On se connecte via l'URL « pooler » : en environnement serverless, chaque
 * requête peut ouvrir sa propre connexion, et le pooler Neon évite d'épuiser
 * la limite de connexions Postgres.
 */

// En environnement Node (hors Edge), le pilote a besoin d'une implémentation
// WebSocket explicite.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const urlBase = process.env.DATABASE_URL;
if (!urlBase) {
  throw new Error(
    "DATABASE_URL est absente. Copier `.env.example` vers `.env.local` et renseigner la connexion Neon.",
  );
}

/**
 * Le pool est mis en cache sur `globalThis` : en développement, le
 * rechargement à chaud de Next.js réévalue les modules à chaque modification,
 * ce qui créerait un nouveau pool à chaque fois et saturerait la base.
 */
const global_ = globalThis as unknown as { __poolLgr?: Pool };

const pool = global_.__poolLgr ?? new Pool({ connectionString: urlBase });

if (process.env.NODE_ENV !== "production") {
  global_.__poolLgr = pool;
}

export const db = drizzle(pool, { schema, casing: "snake_case" });

export { schema };
export type Db = typeof db;
