#!/usr/bin/env node
/**
 * Applique une photo de démonstration à tous les élèves et tuteurs semés.
 *
 * Objectif : voir l'application telle qu'elle sera une fois les vraies photos
 * versées — listes illustrées, fiches complètes, cartes scolaires.
 *
 * La déduplication par empreinte SHA-256 joue à plein : une seule ligne dans
 * `fichiers` couvre les 548 élèves. Sans elle, la même image serait stockée
 * 548 fois, soit 16 Mo pour rien sur un quota de 500 Mo.
 *
 * Ces photos ne sont posées que sur les enregistrements `donnees_semees` :
 * un élève réellement inscrit par le secrétariat garde sa propre photo, ou
 * aucune. `npm run db:purger` les emporte avec le reste.
 *
 * Usage :
 *   node scripts/photos-demonstration.mjs --eleves <chemin> --tuteurs <chemin>
 *   node scripts/photos-demonstration.mjs --retirer
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));

const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith("--")) {
    const cle = process.argv[i].slice(2);
    const valeur = process.argv[i + 1]?.startsWith("--") ? true : process.argv[i + 1];
    args[cle] = valeur ?? true;
  }
}

const url =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
await client.connect();

if (args.retirer) {
  const r1 = await client.query(`UPDATE eleves SET photo_id = NULL WHERE donnees_semees`);
  const r2 = await client.query(`UPDATE enseignants SET photo_id = NULL WHERE donnees_semees`);
  await client.query(`SELECT purger_fichiers_orphelins()`);
  console.log(`Photos retirées : ${r1.rowCount} élèves, ${r2.rowCount} enseignants.`);
  await client.end();
  process.exit(0);
}

/** Devine le type MIME d'après les octets de tête, jamais d'après l'extension. */
function typeMime(contenu) {
  if (contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff) return "image/jpeg";
  if (contenu[0] === 0x89 && contenu.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (contenu.toString("ascii", 0, 4) === "RIFF" && contenu.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

const TAILLE_MAX = 200 * 1024;

/** Enregistre le fichier, ou réutilise celui déjà présent avec la même empreinte. */
async function stocker(chemin, usage) {
  if (!existsSync(chemin)) throw new Error(`Fichier introuvable : ${chemin}`);

  const contenu = readFileSync(chemin);
  const mime = typeMime(contenu);
  if (!mime) throw new Error(`${chemin} : format non reconnu (JPEG, PNG ou WebP attendu).`);
  if (contenu.length > TAILLE_MAX) {
    throw new Error(
      `${chemin} : ${Math.round(contenu.length / 1024)} ko, au-delà de la limite de ${TAILLE_MAX / 1024} ko.`,
    );
  }

  const empreinte = createHash("sha256").update(contenu).digest("hex");

  const existant = await client.query(`SELECT id FROM fichiers WHERE empreinte = $1 LIMIT 1`, [
    empreinte,
  ]);
  if (existant.rows[0]) {
    console.log(`  ${path.basename(chemin)} déjà en base — réutilisé.`);
    return existant.rows[0].id;
  }

  const insere = await client.query(
    `INSERT INTO fichiers (usage, nom_origine, mime_type, taille_octets, contenu, empreinte)
     VALUES ($1::usage_fichier, $2, $3, $4, $5, $6) RETURNING id`,
    [usage, path.basename(chemin), mime, contenu.length, contenu, empreinte],
  );

  console.log(`  ${path.basename(chemin)} stocké (${Math.round(contenu.length / 1024)} ko, ${mime}).`);
  return insere.rows[0].id;
}

try {
  const cheminEleves = args.eleves ?? "C:/Users/hp/Desktop/me.jpeg";
  const cheminTuteurs = args.tuteurs ?? "C:/Users/hp/Downloads/me.jpeg";

  console.log("Stockage des images…");
  const photoEleve = await stocker(cheminEleves, "PHOTO_ELEVE");
  const photoEnseignant = await stocker(cheminTuteurs, "PHOTO_ENSEIGNANT");

  console.log("\nRattachement…");
  const eleves = await client.query(
    `UPDATE eleves SET photo_id = $1 WHERE donnees_semees AND photo_id IS NULL`,
    [photoEleve],
  );
  const enseignants = await client.query(
    `UPDATE enseignants SET photo_id = $1 WHERE donnees_semees AND photo_id IS NULL`,
    [photoEnseignant],
  );

  console.log(`  ${eleves.rowCount} élèves`);
  console.log(`  ${enseignants.rowCount} enseignants`);

  const bilan = await client.query(`
    SELECT count(*)::int AS fichiers,
           COALESCE(SUM(taille_octets), 0)::int AS octets
      FROM fichiers
  `);
  const { fichiers, octets } = bilan.rows[0];
  console.log(
    `\n${fichiers} fichier(s) en base pour ${Math.round(octets / 1024)} ko au total — ` +
      "la déduplication évite de stocker la même image des centaines de fois.",
  );
} catch (erreur) {
  console.error(`\nÉchec : ${erreur.message}`);
  process.exitCode = 1;
}

await client.end();
