/**
 * Recette NÉGATIVE : prouver que la plateforme REFUSE.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Les recettes existantes prouvent que l'agent lit ce qu'il a le droit de
 * lire. C'est la moitié de la question. Une porte qui s'ouvre pour les bons
 * ne vaut rien si elle s'ouvre aussi pour les autres, et aucun test de
 * réussite ne peut le révéler : il faut provoquer les refus et vérifier
 * qu'ils tombent.
 *
 * LE REFUS LE PLUS IMPORTANT EST LE QUATRIÈME
 * --------------------------------------------
 * Un acteur inconnu est facile à refuser. Le cas qui compte est un acteur
 * RÉEL, ACTIF et AUTHENTIFIÉ qui demande une opération hors de son rôle : il
 * franchit le jeton de service, il franchit la résolution d'identité, et seul
 * le `guard` l'arrête. Nous le provoquons avec le compte DIRECTION réel sur
 * `chargerEmploiDuTemps`, parce que la matrice de production accorde
 * `emploi_du_temps:lire` à SUPER_ADMIN et pas à DIRECTION — ce n'est pas une
 * hypothèse, c'est lu dans la table `permissions`.
 *
 * Le contrôle positif est indispensable : sans lui, un backend en panne
 * refuserait tout et nous prendrions cette panne pour une sécurité.
 *
 * TOUT EST EN LECTURE SEULE
 * --------------------------
 * La seule sonde d'écriture est `justifierEnLot` avec une liste VIDE. Si le
 * verrou d'écriture était ouvert — ce que la sonde cherche précisément à
 * démentir — l'opération porterait sur zéro absence et ne modifierait rien.
 * Aucune autre écriture n'est tentée, et aucun dossier d'élève n'est touché.
 *
 *   node agent/scripts/recette-refus.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f, k) =>
  (readFileSync(resolve(racine, f), "utf8").match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

const BASE = process.env.SCHOOL_API_BASE_URL ?? "https://lycee-guergne-renaissance.vercel.app";
const JETON = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
if (!JETON) {
  console.error("ARRET : AGENT_SERVICE_TOKEN introuvable.");
  process.exit(1);
}

/** Comptes réels, lus dans la base. Des identifiants, jamais des numéros. */
const SUPER_ADMIN = "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
const DIRECTION = "f86b8625-1ff1-4811-ae29-1b5cffd7fba9";

async function appeler(action, { jeton = JETON, acteur, corps = {} } = {}) {
  const entetes = { "content-type": "application/json" };
  if (jeton) entetes.authorization = `Bearer ${jeton}`;
  if (acteur) entetes["x-acteur-id"] = acteur;
  try {
    const r = await fetch(`${BASE}/api/agent/${action}`, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(30_000),
    });
    let json = null;
    try {
      json = await r.json();
    } catch {
      /* une page d'erreur HTML n'est pas du JSON : le statut suffit. */
    }
    return { status: r.status, json };
  } catch (e) {
    return { status: 0, json: null, erreur: e.message };
  }
}

let echecs = 0;
const controler = (libelle, attendu, obtenu, detail = "") => {
  const ok = Array.isArray(attendu) ? attendu.includes(obtenu.status) : obtenu.status === attendu;
  const veut = Array.isArray(attendu) ? attendu.join(" ou ") : attendu;
  console.log(
    `  ${ok ? "OK   " : "ECHEC"} ${libelle}` +
      `\n          attendu ${veut}, obtenu ${obtenu.status || obtenu.erreur}` +
      (detail ? ` — ${detail}` : "") +
      (obtenu.json?.message ? `\n          « ${obtenu.json.message} »` : ""),
  );
  if (!ok) echecs += 1;
  return ok;
};

console.log(`cible : ${BASE}`);
console.log("portee : LECTURE SEULE. Aucune donnee scolaire n'est modifiee.\n");

// --- 0. Contrôle POSITIF ----------------------------------------------------
// Sans lui, un backend en panne refuserait tout et passerait pour un backend sûr.
console.log("=== 0. Controle POSITIF : ce qui doit marcher marche ===");
const positif = await appeler("listerAlertes", { acteur: SUPER_ADMIN });
const vivant = controler("SUPER_ADMIN lit les alertes", 200, positif, "sinon les refus ne prouvent rien");
if (!vivant) {
  console.log("\nARRET : le backend ne sert pas meme une lecture autorisee.");
  console.log("Les refus qui suivraient ne seraient pas des refus mais une panne.");
  process.exit(1);
}

// --- 1. Sans jeton de service ----------------------------------------------
console.log("\n=== 1. Le service doit s'authentifier ===");
controler("aucun jeton", 401, await appeler("listerAlertes", { jeton: null, acteur: SUPER_ADMIN }));
controler(
  "jeton errone de MEME longueur",
  401,
  await appeler("listerAlertes", { jeton: "x".repeat(JETON.length), acteur: SUPER_ADMIN }),
  "la comparaison a temps constant est exercee",
);

// --- 2. Sans acteur ---------------------------------------------------------
// Le jeton de service ne confère AUCUN droit métier : seul, il ne doit rien ouvrir.
console.log("\n=== 2. Le jeton de service seul n'ouvre rien ===");
controler("jeton valide, aucun x-acteur-id", 400, await appeler("listerAlertes", {}));
controler("acteur non conforme a un UUID", 400, await appeler("listerAlertes", { acteur: "admin" }));

// --- 3. Acteur inexistant ---------------------------------------------------
console.log("\n=== 3. Un acteur inconnu est refuse, pas ignore ===");
controler(
  "UUID bien forme mais inexistant",
  403,
  await appeler("listerAlertes", { acteur: "00000000-0000-4000-8000-000000000000" }),
  "le guard refuse au lieu de laisser passer",
);

// --- 4. LE test : un acteur réel, hors de son périmètre ---------------------
console.log("\n=== 4. Un acteur REEL hors de son perimetre est refuse ===");
console.log("    (la matrice de production donne emploi_du_temps:lire a SUPER_ADMIN, pas a DIRECTION)");
const horsPerimetre = await appeler("chargerEmploiDuTemps", { acteur: DIRECTION });
controler("DIRECTION demande l'emploi du temps", 403, horsPerimetre, "refus par le role, pas par le jeton");
const dansPerimetre = await appeler("listerAlertes", { acteur: DIRECTION });
controler(
  "le MEME acteur lit les alertes (assiduite:lire)",
  200,
  dansPerimetre,
  "le refus visait l'operation, pas le compte",
);

// --- 5. Hors catalogue ------------------------------------------------------
// Le modèle choisit un nom dans une liste blanche : aucun SQL arbitraire.
console.log("\n=== 5. Hors catalogue, rien n'existe ===");
controler("operation inventee", 404, await appeler("supprimerToutesLesAbsences", { acteur: SUPER_ADMIN }));
controler("tentative de traversee de chemin", [400, 404], await appeler("..%2F..%2Fadmin", { acteur: SUPER_ADMIN }));

// --- 6. Le verrou d'écriture ------------------------------------------------
// Liste VIDE : même verrou ouvert, l'operation porterait sur zero absence.
console.log("\n=== 6. Les ecritures sont ETEINTES en production ===");
const ecriture = await appeler("justifierEnLot", { acteur: SUPER_ADMIN, corps: { absenceIds: [] } });
const eteint = controler("justifierEnLot sur une liste VIDE", 403, ecriture);
if (eteint && ecriture.json?.code !== "ECRITURES_DESACTIVEES") {
  console.log(`          ATTENTION : refuse, mais code « ${ecriture.json?.code} » au lieu de ECRITURES_DESACTIVEES.`);
  console.log("          Un refus par les droits masquerait un verrou d'ecriture ouvert.");
  echecs += 1;
} else if (eteint) {
  console.log("          code ECRITURES_DESACTIVEES : c'est bien le verrou, pas un hasard de droits.");
}

console.log(
  `\n=== ${echecs === 0 ? "TOUS LES REFUS TOMBENT COMME PREVU" : `${echecs} CONTROLE(S) EN ECHEC`} ===`,
);
process.exitCode = echecs ? 1 : 0;
