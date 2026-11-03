/**
 * Recette de COHÉRENCE : le Web et WhatsApp retrouvent-ils le même dossier ?
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * « Recherche l'élève Djimet ABAKAR » rendait zéro résultat sur WhatsApp alors
 * que l'administration Web affichait l'élève. La tentation était de conclure à
 * deux bases, deux branches Neon ou deux implémentations.
 *
 * C'était faux. `listerEleves` est appelé par l'écran Web
 * (`dashboard/eleves/page.tsx`) ET par l'outil de l'agent
 * (`server/agent/operations.ts`) : le service canonique est déjà partagé. Le
 * défaut était unique — un seul motif ILIKE non découpé, incapable de trouver
 * un nom complet réparti sur deux colonnes — et il frappait les deux
 * interfaces. Le Web paraissait fonctionner parce qu'on y cherche un mot seul.
 *
 * CE QUE CE SCRIPT COMPARE
 * -------------------------
 * Pour chaque terme : ce que rend l'API de production (le chemin exact de
 * WhatsApp) et ce que rend la base interrogée avec la logique canonique
 * attendue. Il compare les ENSEMBLES DE MATRICULES, pas deux codes HTTP 200.
 *
 * Une divergence signifie l'une de deux choses, et le script le dit :
 *   - le correctif n'est pas déployé (production en retard sur le dépôt) ;
 *   - ou la logique a divergé pour de bon, ce qui est le défaut d'origine.
 *
 * LECTURE SEULE de bout en bout. Aucun élève n'est créé, modifié ni supprimé.
 *
 *   node agent/scripts/recette-coherence-eleves.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "../../web/node_modules/@neondatabase/serverless/index.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f, k) =>
  (readFileSync(resolve(racine, f), "utf8").match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

const BASE = process.env.SCHOOL_API_BASE_URL ?? "https://lycee-guergne-renaissance.vercel.app";
const JETON = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
const URL_BASE = lire("web/.env.local", "DATABASE_URL");
const ACTEUR = process.env.ACTEUR_ID ?? "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
if (!JETON || !URL_BASE) {
  console.error("ARRET : AGENT_SERVICE_TOKEN ou DATABASE_URL introuvable dans web/.env.local.");
  process.exit(1);
}

const sql = neon(URL_BASE);
console.log(`API  : ${BASE}`);
console.log(`base : ${new URL(URL_BASE).hostname}`);
console.log("portee : LECTURE SEULE\n");

/** Le découpage canonique : mots normalisés, sans accents, sans ponctuation. */
function motsRecherche(terme) {
  return String(terme ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 5);
}

/** Ce que la logique canonique DOIT trouver, demandé directement à la base. */
async function attendu(terme) {
  const mots = motsRecherche(terme);
  if (mots.length === 0) return [];
  const clauses = mots
    .map(
      (_, i) =>
        `(unaccent(e.nom) ILIKE unaccent($${i + 1}) OR unaccent(e.prenom) ILIKE unaccent($${i + 1}) OR e.matricule ILIKE $${i + 1})`,
    )
    .join(" AND ");
  const r = await sql.query(
    `SELECT e.matricule FROM eleves e WHERE ${clauses} ORDER BY e.matricule`,
    mots.map((m) => `%${m}%`),
  );
  return r.map((x) => x.matricule);
}

/** Ce que l'API de production rend — le chemin exact de WhatsApp. */
async function obtenu(terme) {
  const r = await fetch(`${BASE}/api/agent/rechercherEleves`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${JETON}`, "x-acteur-id": ACTEUR },
    body: JSON.stringify({ recherche: terme, parPage: 100 }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = await r.json().catch(() => null);
  const d = j?.data ?? {};
  const lignes = Array.isArray(d) ? d : (d.lignes ?? []);
  return { status: r.status, matricules: lignes.map((x) => x.matricule).sort(), total: d.total ?? null };
}

const TERMES = [
  "Djimet ABAKAR",
  "ABAKAR Djimet",
  "djimet abakar",
  "Djimet",
  "ABAKAR",
  "LGR-2025-1050",
  "Bénédicte",
  "Benedicte",
];

let divergences = 0;
for (const terme of TERMES) {
  const att = (await attendu(terme)).sort();
  const obt = await obtenu(terme);
  // On compare des ensembles : l'ordre d'affichage n'est pas une regle metier,
  // l'identite des dossiers trouves en est une.
  const memeEnsemble = att.length === obt.matricules.length && att.every((m, i) => m === obt.matricules[i]);
  const marque = memeEnsemble ? "OK   " : "ECART";
  if (!memeEnsemble) divergences += 1;
  console.log(
    `${marque} « ${terme.padEnd(16)} »  base=${String(att.length).padStart(3)}  API=${String(obt.matricules.length).padStart(3)}` +
      `  total annonce=${obt.total ?? "?"}  (HTTP ${obt.status})`,
  );
  if (!memeEnsemble) {
    const manquants = att.filter((m) => !obt.matricules.includes(m));
    const surnombre = obt.matricules.filter((m) => !att.includes(m));
    if (manquants.length) console.log(`         l'API ne trouve pas : ${manquants.slice(0, 4).join(", ")}${manquants.length > 4 ? " ..." : ""}`);
    if (surnombre.length) console.log(`         l'API trouve en trop : ${surnombre.slice(0, 4).join(", ")}${surnombre.length > 4 ? " ..." : ""}`);
  }
}

console.log("");
if (divergences === 0) {
  console.log("=== COHERENCE ETABLIE : l'API de production et la logique canonique s'accordent ===");
} else {
  console.log(`=== ${divergences} ECART(S) ===`);
  console.log("Deux lectures possibles, et il faut les distinguer :");
  console.log("  1. le correctif de recherche n'est pas deploye — la production est en retard");
  console.log("     sur le depot, et c'est l'etat connu tant que `main` n'a pas recu la branche ;");
  console.log("  2. ou la logique a reellement diverge, ce qui est le defaut d'origine.");
  console.log("Verifier d'abord l'ecart entre `main` et la branche avant de chercher plus loin.");
}
process.exitCode = divergences ? 1 : 0;
