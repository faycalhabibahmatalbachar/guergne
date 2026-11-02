/**
 * Recette de PRODUCTION : « les absences de la 6ème A », de la phrase à la donnée.
 *
 * C'est la demande exacte qui recevait « Backend scolaire non configuré ». Ce
 * script rejoue le parcours complet contre la production — NLU réel, politiques
 * de production, garde du backend déployé, base de production — et vérifie à
 * chaque étape au lieu de se contenter d'une réponse qui a l'air juste.
 *
 * UN 200 N'EST PAS UNE RÉUSSITE MÉTIER
 * -------------------------------------
 * Chaque contrôle porte sur le CONTENU, pas sur le statut. Un 200 qui rend
 * zéro ligne, un 200 qui rend les absences d'une autre classe, un 200 dont le
 * nombre est la limite de pagination et non la réalité : ce sont trois échecs
 * qui ressemblent à des succès. Ils sont tous les trois contrôlés ici.
 *
 * LE PIÈGE EST RÉEL
 * ------------------
 * La production contient une classe « 6E » **et** une classe « 6ème A ». Le
 * modèle doit choisir la seconde. Sans contrôle sur l'identifiant, une réponse
 * plausible portant sur la mauvaise classe passerait inaperçue — et c'est
 * exactement l'erreur qu'un chef d'établissement ne pourrait pas détecter.
 *
 * LECTURE SEULE. Aucune écriture n'est tentée, aucun dossier n'est touché.
 *
 *   node agent/scripts/recette-production-6eme-a.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AuditLog } from "../src/audit.js";
import { Agent } from "../src/engine.js";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { MoteurIA, configurerDepuisEnv } from "../src/ia.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
import { MoteurPolitiques, POLITIQUES_DEFAUT } from "../src/politiques.js";
import { FakeProvider } from "../src/provider.js";
import { Referentiel } from "../src/referentiel.js";
import { lignesDe, totalDe } from "../src/rendu.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f, k) =>
  (readFileSync(resolve(racine, f), "utf8").match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

/** Identifiants réels, lus dans la base de production. */
const CLASSE_6A = "fb5fa8be-7d33-4616-8816-f6875ca9ec39";
const CLASSE_6E = "a7b7ba36-e271-4c27-a943-bf22d6859f98"; // le piège
const ACTEUR = "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
const JID = "23500000000@c.us";

const BASE = process.env.SCHOOL_API_BASE_URL ?? "https://lycee-guergne-renaissance.vercel.app";
const JETON = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
if (!JETON) {
  console.error("ARRET : AGENT_SERVICE_TOKEN introuvable.");
  process.exit(1);
}
console.log(`cible  : ${BASE}  (PRODUCTION)`);
console.log("portee : LECTURE SEULE\n");

const conf = configurerDepuisEnv({
  GROQ_API_KEY: process.env.GROQ_API_KEY || lire("ai_apikey.env", "grok_api"),
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || lire("ai_apikey.env", "mistral_ai"),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || lire("ai_apikey.env", "openrouterai_api"),
});
const ia = new MoteurIA({ cles: conf.cles, modeles: conf.modeles, ordre: conf.ordre });
const guergne = new GuergneHttpClient({ baseUrl: BASE, serviceToken: JETON });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
const referentiel = new Referentiel({ guergne });
const audit = new AuditLog();
const provider = new FakeProvider();

let echecs = 0;
const verifier = (c, libelle, detail = "") => {
  console.log(`  ${c ? "OK   " : "ECHEC"} ${libelle}${detail ? ` — ${detail}` : ""}`);
  if (!c) echecs += 1;
  return c;
};

let dernierPlan = null;
const agent = new Agent({
  provider,
  identity: new IdentityStore([
    { jid: JID, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN", msisdn: "23500000000" },
  ]),
  idempotency: new IdempotencyStore(),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  politiques: new MoteurPolitiques({ politiques: POLITIQUES_DEFAUT }),
  guergne,
  destinatairesNotification: async () => [],
  interpret: async (texte, ctx = {}) => {
    const listes = await referentiel.pour(ctx.staff?.id ?? ACTEUR);
    const r = await ia.completerJson([
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: Referentiel.enTexte(listes) },
      { role: "system", content: `La date du jour est ${new Date().toISOString().slice(0, 10)}.` },
      { role: "user", content: texte },
    ]);
    console.log(`    [nlu] ${r.fournisseur}/${r.modele} en ${r.dureeMs} ms`);
    dernierPlan = r.objet;
    return r.objet;
  },
});

// --- 1. Le référentiel de production ---------------------------------------
console.log("=== 1. Le referentiel de PRODUCTION connait-il la 6eme A ? ===");
const listes = await referentiel.pour(ACTEUR);
const classe = listes.classes.find((c) => c.id === CLASSE_6A);
verifier(Boolean(classe), "la 6eme A est dans le referentiel de l'acteur", classe?.libelle);
verifier(
  listes.classes.some((c) => c.id === CLASSE_6E),
  "la classe « 6E » y est AUSSI — le piege est bien present",
  "sans elle, le controle sur l'identifiant ne prouverait rien",
);

// --- 2. La donnée, et son volume réel --------------------------------------
console.log("\n=== 2. Combien d'absences, reellement ? ===");
const bornes = [100, 300, 1000];
const mesures = [];
for (const limite of bornes) {
  const r = await guergne.listerAbsences({ classeId: CLASSE_6A, limite }, { actorId: ACTEUR });
  const l = lignesDe(r.data) ?? [];
  mesures.push({ limite, lignes: l.length, total: totalDe(r.data) });
  console.log(`    limite=${String(limite).padEnd(4)} -> ${l.length} ligne(s), total annonce : ${totalDe(r.data) ?? "(aucun)"}`);
}
const plafond = Math.max(...mesures.map((m) => m.lignes));
verifier(plafond > 0, "des absences existent en production", `${plafond} au plus haut`);
// Si le nombre cesse de croitre, c'est la realite ; s'il suit la limite, c'est
// la pagination qu'on lit, et la reponse mentirait en l'annoncant comme un total.
const sature = mesures.at(-1).lignes === mesures.at(-1).limite;
verifier(!sature, "le nombre n'est PAS colle a la limite : c'est bien le volume reel", `${plafond}`);

const totalAnnonce = mesures.at(-1).total;
if (totalAnnonce === null) {
  console.log("    NOTE : la production n'annonce pas encore de total — `compterAbsences`");
  console.log("           n'est pas deploye (branche non poussee). Le rendu affichera donc");
  console.log("           les lignes SANS « sur N ». Ce n'est pas un defaut de l'agent.");
} else {
  verifier(totalAnnonce === plafond, "le total annonce coincide avec les lignes obtenues", `${totalAnnonce}`);
}

// --- 3. Les lignes appartiennent-elles à la BONNE classe ? -----------------
console.log("\n=== 3. Les lignes sont-elles celles de la 6eme A ? ===");
const r6a = await guergne.listerAbsences({ classeId: CLASSE_6A, limite: 1000 }, { actorId: ACTEUR });
const lignes6a = lignesDe(r6a.data) ?? [];
const libelles = [...new Set(lignes6a.map((l) => l.classe))];
verifier(libelles.length === 1, "toutes les lignes portent UN SEUL libelle de classe", libelles.join(", "));
verifier(
  libelles.every((l) => /6\s*[eè]/i.test(String(l)) && !/^6E$/i.test(String(l).trim())),
  "ce libelle est celui de la 6eme A, pas celui de « 6E »",
  libelles.join(", "),
);

// --- 4. Le parcours complet, depuis la phrase ------------------------------
console.log("\n=== 4. « Montre les absences de la 6eme A » (chaine complete) ===");
const rep = await agent.handle({ id: `prod-6a-${Date.now()}`, from: JID, body: "Montre les absences de la 6eme A." });
const e = audit.last();
console.log(`    statut=${rep.status} outil=${e?.intent ?? "-"} perm=${e?.permission ?? "-"} resultat=${e?.result ?? "-"}`);

verifier(e?.result === "SUCCESS", "le backend de PRODUCTION a servi la demande", e?.error ?? "");
verifier(e?.permission === "OK:assiduite:lire", "la permission reelle a ete verifiee", e?.permission);

const choisie = dernierPlan?.params?.classeId ?? dernierPlan?.params?.classe ?? null;
verifier(choisie === CLASSE_6A, "le modele a choisi la 6eme A, et non « 6E »", String(choisie));

const texte = provider.lastTextTo(JID) ?? "";
verifier(texte.length > 0, "une reponse est partie");
verifier(!/Backend scolaire non configur/i.test(texte), "ce n'est PLUS « Backend scolaire non configure »");
verifier(/[Aa]bsence/.test(texte), "la reponse porte bien des absences");
// Un rendu qui laisse fuiter un artefact technique est un echec metier, meme en 200.
verifier(!/undefined|NaN|\[object Object\]/.test(texte), "aucun artefact technique dans la reponse");

// LE CONTROLE QUI COMPTE, et que l'on oublie.
//
// Tout ce qui precede peut passer alors que la reponse ment. Si l'agent
// affiche « 100 resultats » quand il y en a 211, un chef d'etablissement
// decide sur un chiffre faux, et RIEN dans la reponse ne l'en avertit. Un
// statut SUCCESS ne dit rien de cela : il faut lire le texte.
const annonce = Number((texte.match(/—\s*(\d+)\s*r[eé]sultats?/i) ?? [])[1] ?? NaN);
const divulgue = /affich[eé]es?\s+sur\s+(\d+)/i.test(texte);
if (Number.isFinite(annonce) && annonce < plafond && !divulgue) {
  verifier(
    false,
    `la reponse annonce ${annonce} alors qu'il y en a ${plafond}, sans le dire`,
    "le total reel exige `compterAbsences`, qui n'est pas encore deploye",
  );
} else {
  verifier(true, "le nombre annonce est honnete", divulgue ? "la troncature est divulguee" : `${annonce}`);
}

console.log("\n    --- REPONSE RENDUE A L'UTILISATEUR ---");
for (const l of texte.split("\n").slice(0, 8)) console.log(`    ${l}`);

console.log(`\n=== ${echecs === 0 ? "RECETTE DE PRODUCTION : TOUS LES CONTROLES PASSENT" : `${echecs} CONTROLE(S) EN ECHEC`} ===`);
process.exitCode = echecs ? 1 : 0;
