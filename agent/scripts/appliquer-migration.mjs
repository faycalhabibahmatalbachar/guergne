/**
 * Applique UNE migration précise, et elle seule.
 *
 * POURQUOI CE SCRIPT EXISTE À CÔTÉ DE `web/scripts/migrate.mjs`
 * -------------------------------------------------------------
 * `migrate.mjs` joue toutes les migrations en attente, dans l'ordre. C'est le
 * bon comportement pour une mise à jour de schéma. Mais le relevé du
 * 2026-11-08 a montré que la base en avait **cinq** en attente :
 *
 *     0033_audit_provenance_v2.sql
 *     0037_notes_tracabilite.sql
 *     0038_absences_unicite_et_calendrier.sql
 *     0039_recherche_eleves_sans_accents.sql
 *     0040_annee_scolaire_2026_2027.sql
 *
 * Or 0038 crée un index UNIQUE sur `absences`, et son propre en-tête annonce
 * 61 groupes de doublons en production. Elle échouera donc, ou retirera des
 * lignes — dans les deux cas c'est une décision à prendre à part, pas un effet
 * de bord de l'ouverture d'une année scolaire. Et comme `migrate.mjs` s'arrête
 * à la première erreur, 0040 ne serait même pas atteinte.
 *
 * Ce script applique donc exactement une migration nommée, avec la même
 * mécanique que `migrate.mjs` : connexion DIRECTE, une transaction, inscription
 * au registre `_migrations`, annulation intégrale en cas d'échec.
 *
 *   node scripts/appliquer-migration.mjs 0040_annee_scolaire_2026_2027.sql
 *   node scripts/appliquer-migration.mjs 0040_annee_scolaire_2026_2027.sql --essai
 *
 * `--essai` joue la migration puis ANNULE tout : de quoi vérifier qu'elle
 * passe, sans rien écrire.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const depot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(depot, "db", "migrations");

const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const jaune = (s) => console.log(`\x1b[1;33m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

const argv = process.argv.slice(2);
const essai = argv.includes("--essai");
// La VALEUR de `--env` n'est pas le nom de la migration. Sans cette exclusion,
// `--env web/.env.test.local 0041.sql` jouerait « web/.env.test.local » comme
// migration — l'ordre des arguments ne doit pas changer le sens de la commande.
const iEnv = argv.indexOf("--env");
const iValeurEnv = iEnv >= 0 ? iEnv + 1 : -1; // sans `--env`, n'exclure AUCUN indice
const fichier = argv.find((a, i) => !a.startsWith("--") && i !== iValeurEnv);

if (!fichier) {
  rouge("usage : node scripts/appliquer-migration.mjs <fichier.sql> [--essai]");
  rouge("        [--test | --dev | --production | --env <fichier>]   defaut : --test");
  process.exit(2);
}

/**
 * QUELLE BASE ? LA QUESTION SE POSE, DONC ELLE SE DEMANDE.
 *
 * Ce script lisait `web/.env.local` EN DUR — c'est-à-dire la production. Une
 * migration de recette jouée par distraction sur les vrais eleves ne se
 * rattrape pas. Le fichier d'environnement est donc desormais un parametre,
 * et le defaut est la base de TEST.
 *
 *   --test         web/.env.test.local        (defaut)
 *   --dev          web/.env.development.local
 *   --production   web/.env.local             explicite, et seulement ainsi
 *   --env <chemin> n'importe quel autre fichier
 */
function fichierEnv() {
  const i = process.argv.indexOf("--env");
  if (i > 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.argv.includes("--production")) return "web/.env.local";
  if (process.argv.includes("--dev")) return "web/.env.development.local";
  // `--test` est le defaut ; l'accepter explicitement permet de l'ecrire dans
  // une procedure, ou de le lire dans un historique de commandes.
  return "web/.env.test.local";
}

/** La connexion directe : le pooler Neon en mode transaction ne supporte pas tout le DDL. */
function connexion() {
  const relatif = fichierEnv();
  const chemin = join(depot, ...relatif.split("/"));
  if (!existsSync(chemin)) {
    rouge(`${chemin} est absent : impossible de joindre la base.`);
    process.exit(2);
  }
  const texte = readFileSync(chemin, "utf8");
  const lire = (nom) => {
    for (const ligne of texte.split(/\r?\n/)) {
      const m = ligne.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, "");
    }
    return null;
  };
  const url =
    lire("DATABASE_URL_TEST") ?? lire("DATABASE_URL_UNPOOLED") ?? lire("DATABASE_URL_DIRECT") ?? lire("DATABASE_URL");
  if (!url) {
    rouge(`Aucune URL de base dans ${relatif}`);
    process.exit(2);
  }
  // Dire laquelle, a voix haute, avant d'ecrire : un releve attribue a la
  // mauvaise base vaut moins que pas de releve du tout.
  let hote = "(hote illisible)";
  try {
    hote = new URL(url).hostname;
  } catch {
    /* une URL illisible echouera a la connexion, avec son propre message */
  }
  gris(`  environnement : ${relatif}`);
  gris(`  hote Neon     : ${hote}`);
  return url;
}

async function principal() {
  const chemin = join(MIGRATIONS, fichier);
  if (!existsSync(chemin)) {
    rouge(`Migration introuvable : ${chemin}`);
    process.exit(2);
  }
  const sql = readFileSync(chemin, "utf8");

  const c = new pg.Client({ connectionString: connexion(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  // Les `RAISE NOTICE` des garde-fous sont la seule voix de la migration : sans
  // cette ligne, ses vérifications réussiraient en silence.
  c.on("notice", (m) => gris(`  ${m.message}`));

  try {
    await c.query(`CREATE TABLE IF NOT EXISTS _migrations (
      nom          TEXT PRIMARY KEY,
      applique_le  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { rows } = await c.query("SELECT 1 FROM _migrations WHERE nom = $1", [fichier]);
    if (rows.length > 0 && !essai) {
      jaune(`  ${fichier} est deja enregistree : rien a faire.`);
      return;
    }

    await c.query("BEGIN");
    try {
      await c.query(sql);
      if (essai) {
        await c.query("ROLLBACK");
        vert(`  ESSAI concluant : ${fichier} passe. Rien n'a ete ecrit.`);
        return;
      }
      await c.query("INSERT INTO _migrations (nom) VALUES ($1) ON CONFLICT DO NOTHING", [fichier]);
      await c.query("COMMIT");
      vert(`  APPLIQUEE : ${fichier}`);
    } catch (e) {
      await c.query("ROLLBACK");
      rouge(`  ECHEC — rien n'a ete ecrit : ${String(e?.message ?? e).slice(0, 300)}`);
      process.exitCode = 1;
    }
  } finally {
    await c.end();
  }
}

principal().catch((e) => {
  rouge(`Echec : ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
});
