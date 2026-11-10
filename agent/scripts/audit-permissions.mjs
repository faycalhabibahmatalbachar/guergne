/**
 * Audit LECTURE SEULE de la matrice des permissions.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * La matrice vit en base, table `permissions`, et non dans le code. Toute
 * affirmation sur « ce que peut la DIRECTION » qui ne vient pas d'une requête
 * est une supposition. Celui-ci interroge, compte et compare.
 *
 * IL NOMME LA BASE QU'IL LIT, D'ABORD
 * -----------------------------------
 * Deux branches Neon coexistent, et `appliquer-migration.mjs` lisait
 * `web/.env.local` — la PRODUCTION — en dur. Un audit qui ne dit pas sur quelle
 * base il porte ne vaut rien, et une écriture qui se trompe de base vaut pire.
 * Ce script identifie donc la branche par trois signes indépendants : le nom
 * d'hôte Neon, l'année scolaire courante, et la présence de la migration 0040.
 * Il n'affiche JAMAIS l'URL complète ni un mot de passe.
 *
 * Par défaut il lit `web/.env.test.local` (base de test). Lire la production
 * exige `--production`, explicitement.
 *
 *   node agent/scripts/audit-permissions.mjs
 *   node agent/scripts/audit-permissions.mjs --env web/.env.development.local
 *   node agent/scripts/audit-permissions.mjs --production      # lecture seule
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const depot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const gras = (t) => `\x1b[1m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const jaune = (t) => `\x1b[33m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

/** Les quatre droits que la DIRECTION ne doit PAS recevoir. Décision du propriétaire, 2026-11-10. */
export const RESERVES_SUPER_ADMIN = [
  "permission:gerer", // modifier la matrice = s'attribuer n'importe quel droit
  "systeme:administrer", // administration technique de la plateforme
  "sauvegarde:executer", // sauvegardes et restaurations de la base
  "utilisateur:modifier", // comptes et rôles : changer un rôle contourne la matrice
];

function fichierEnv() {
  const i = process.argv.indexOf("--env");
  if (i > 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.argv.includes("--production")) return "web/.env.local";
  return "web/.env.test.local";
}

function urlBase(relatif) {
  const chemin = join(depot, relatif);
  if (!existsSync(chemin)) {
    console.error(rouge(`${relatif} est absent : impossible de joindre la base.`));
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
  // Connexion DIRECTE de préférence : le pooler en mode transaction limite le DDL.
  const url =
    lire("DATABASE_URL_TEST") ??
    lire("DATABASE_URL_UNPOOLED") ??
    lire("DATABASE_URL_DIRECT") ??
    lire("DATABASE_URL");
  if (!url) {
    console.error(rouge(`Aucune URL de base dans ${relatif}`));
    process.exit(2);
  }
  return url;
}

/** Nom d'hôte seul : ni utilisateur, ni mot de passe, ni base. */
export function hoteDe(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(hôte illisible)";
  }
}

/**
 * Identifie la branche par des signes INDÉPENDANTS, pour qu'une erreur de
 * fichier d'environnement se voie immédiatement.
 */
async function identifier(c, url) {
  const hote = hoteDe(url);
  const annee = await c
    .query("SELECT libelle FROM annees_scolaires WHERE est_courante = TRUE LIMIT 1")
    .then((r) => r.rows[0]?.libelle ?? "(aucune)")
    .catch((e) => `(illisible : ${e.message})`);
  const m0040 = await c
    .query("SELECT 1 FROM _migrations WHERE nom LIKE '0040%' LIMIT 1")
    .then((r) => r.rowCount > 0)
    .catch(() => null);
  return { hote, annee, m0040 };
}

const relatif = fichierEnv();
const url = urlBase(relatif);
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const id = await identifier(c, url);
console.log(gras("=== BASE LUE ==="));
console.log(`  fichier d'environnement : ${relatif}`);
console.log(`  hôte Neon               : ${id.hote}`);
console.log(`  année courante          : ${id.annee}`);
console.log(`  migration 0040          : ${id.m0040 === null ? "registre illisible" : id.m0040 ? "appliquée" : "absente"}`);
// Les deux branches se distinguent par l'année et 0040 ; le dire ici évite
// qu'un relevé soit attribué à la mauvaise base trois jours plus tard.
const presumee =
  id.annee.includes("2026") && id.m0040 ? "production présumée (br-red-waterfall)" : "développement / test (br-calm-art)";
console.log(`  ${gras("branche déduite")}        : ${presumee}`);
console.log();

const { rows } = await c.query("SELECT role, action, portee FROM permissions ORDER BY role, action");
const parRole = new Map();
for (const r of rows) {
  if (!parRole.has(r.role)) parRole.set(r.role, new Map());
  parRole.get(r.role).set(r.action, r.portee);
}

console.log(gras("=== DROITS PAR RÔLE ==="));
for (const [role, m] of [...parRole].sort((a, b) => b[1].size - a[1].size)) {
  const portees = new Map();
  for (const p of m.values()) portees.set(p, (portees.get(p) ?? 0) + 1);
  const detail = [...portees].map(([p, n]) => `${p}=${n}`).join(" ");
  console.log(`  ${role.padEnd(14)} ${String(m.size).padStart(3)} droit(s)   ${gris(detail)}`);
}
console.log();

const sa = parRole.get("SUPER_ADMIN") ?? new Map();
const dir = parRole.get("DIRECTION") ?? new Map();
const manquants = [...sa.keys()].filter((a) => !dir.has(a)).sort();
const metier = manquants.filter((a) => !RESERVES_SUPER_ADMIN.includes(a));
const reserves = manquants.filter((a) => RESERVES_SUPER_ADMIN.includes(a));

console.log(gras("=== ÉCART SUPER_ADMIN → DIRECTION ==="));
console.log(`  SUPER_ADMIN : ${sa.size}    DIRECTION : ${dir.size}    écart : ${manquants.length}`);
console.log();
console.log(`  ${vert(`À ACCORDER — ${metier.length} droit(s) métier`)}`);
for (const ligne of decouper(metier, 4)) console.log(`    ${ligne}`);
console.log();
console.log(`  ${jaune(`À RÉSERVER — ${reserves.length} droit(s) technique(s)`)}`);
for (const a of reserves) console.log(`    ${a}`);

// Un droit que la DIRECTION possède alors que le SUPER_ADMIN non : anomalie.
const enTrop = [...dir.keys()].filter((a) => !sa.has(a)).sort();
if (enTrop.length) {
  console.log();
  console.log(rouge(`  ANOMALIE — ${enTrop.length} droit(s) chez DIRECTION et pas chez SUPER_ADMIN :`));
  for (const a of enTrop) console.log(`    ${a}`);
}

// La portée compte autant que le droit : un droit « PROPRES_CLASSES » accordé à
// la direction la limiterait à ses propres classes, ce que la décision interdit.
const porteesLimitees = [...dir].filter(([, p]) => p !== "AUCUNE");
console.log();
console.log(gras("=== PÉRIMÈTRE DE LA DIRECTION ==="));
if (!porteesLimitees.length) {
  console.log(`  ${vert("aucune portée restrictive")} — les ${dir.size} droits portent sur tout l'établissement.`);
} else {
  console.log(rouge(`  ${porteesLimitees.length} droit(s) à portée restreinte :`));
  for (const [a, p] of porteesLimitees) console.log(`    ${a.padEnd(28)} ${p}`);
}

// Un droit nommé en base mais inconnu du code, ou l'inverse : les deux
// vocabulaires doivent coïncider, sinon un contrôle ne s'applique à rien.
const enBase = new Set(rows.map((r) => r.action));
const fichierActions = join(depot, "web/src/server/guard/permissions.ts");
if (existsSync(fichierActions)) {
  const src = readFileSync(fichierActions, "utf8");
  const bloc = src.slice(src.indexOf("export const ACTIONS"), src.indexOf("] as const"));
  const dansLeCode = new Set([...bloc.matchAll(/"([a-z_]+:[a-z_]+)"/g)].map((m) => m[1]));
  const orphelinsBase = [...enBase].filter((a) => !dansLeCode.has(a)).sort();
  const orphelinsCode = [...dansLeCode].filter((a) => !enBase.has(a)).sort();
  console.log();
  console.log(gras("=== COHÉRENCE BASE / CODE ==="));
  console.log(`  actions en base : ${enBase.size}    actions dans le code : ${dansLeCode.size}`);
  if (orphelinsBase.length) console.log(rouge(`  en base, absentes du code : ${orphelinsBase.join(", ")}`));
  if (orphelinsCode.length) console.log(jaune(`  dans le code, jamais accordées : ${orphelinsCode.join(", ")}`));
  if (!orphelinsBase.length && !orphelinsCode.length) console.log(`  ${vert("les deux vocabulaires coïncident")}`);
}

await c.end();

function decouper(liste, parLigne) {
  const largeur = Math.max(0, ...liste.map((x) => x.length)) + 2;
  const out = [];
  for (let i = 0; i < liste.length; i += parLigne) {
    out.push(liste.slice(i, i + parLigne).map((x) => x.padEnd(largeur)).join("").trimEnd());
  }
  return out;
}
