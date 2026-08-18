#!/usr/bin/env node
/**
 * Applique les migrations SQL de `db/migrations/` à la base Neon.
 *
 * - Les fichiers sont joués dans l'ordre alphabétique (d'où la numérotation).
 * - Chaque migration s'exécute dans SA PROPRE transaction : en cas d'échec,
 *   elle est intégralement annulée et le script s'arrête. Aucune migration
 *   n'est jamais appliquée à moitié.
 * - La table `_migrations` mémorise ce qui a déjà été joué : le script est
 *   donc rejouable sans risque.
 * - On utilise la connexion DIRECTE (`DATABASE_URL_DIRECT`) : le pooler Neon
 *   en mode transaction ne supporte pas tout le DDL.
 *
 * Usage : npm run db:migrate
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.resolve(ICI, "../../db/migrations");

// Charge .env.local sans dépendance externe
const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_DIRECT (ou DATABASE_URL) est absente.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    nom          TEXT PRIMARY KEY,
    applique_le  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

const deja = new Set(
  (await client.query("SELECT nom FROM _migrations")).rows.map((r) => r.nom),
);

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
let appliquees = 0;

for (const fichier of fichiers) {
  if (deja.has(fichier)) continue;

  const sql = readFileSync(path.join(DOSSIER, fichier), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations (nom) VALUES ($1)", [fichier]);
    await client.query("COMMIT");
    console.log(`  appliquée  ${fichier}`);
    appliquees++;
  } catch (erreur) {
    await client.query("ROLLBACK");
    console.error(`\n  ÉCHEC  ${fichier}`);
    console.error(`  ${erreur.message}`);
    if (erreur.position) {
      const p = Number.parseInt(erreur.position, 10);
      const extrait = sql.slice(Math.max(0, p - 150), p + 150).replace(/\s+/g, " ");
      console.error(`  → ...${extrait}...`);
    }
    await client.end();
    process.exit(1);
  }
}

console.log(
  appliquees === 0
    ? "Base à jour, aucune migration à appliquer."
    : `${appliquees} migration(s) appliquée(s), base à jour.`,
);

await client.end();
