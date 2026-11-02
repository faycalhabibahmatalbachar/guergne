/**
 * Preuve ciblée : « les absences de la 6ème A », de la phrase à la donnée.
 *
 * C'est la demande exacte qui recevait « Backend scolaire non configuré ».
 * Ce script rejoue le parcours complet — NLU réel, politiques de production,
 * garde du backend, base réelle — et vérifie à chaque étape, au lieu de se
 * contenter d'une réponse qui a l'air juste.
 *
 * La classe est désignée par son libellé, comme le ferait un humain. Son
 * identifiant réel (`fb5fa8be-…`) sert uniquement de contrôle : si le modèle
 * en choisit un autre, le test échoue. Sans ce contrôle, une réponse plausible
 * sur la mauvaise classe passerait inaperçue.
 *
 * LECTURE SEULE.
 *
 *   cd web && npm run dev
 *   node agent/scripts/e2e-6eme-a.mjs
 */
import { existsSync, readFileSync } from "node:fs";
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
const lire = (f, k) => {
  const p = resolve(racine, f);
  if (!existsSync(p)) return undefined;
  return (readFileSync(p, "utf8").match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
};
const hote = (v) => {
  try {
    return new URL(String(v)).hostname;
  } catch {
    return null;
  }
};

/** Identifiant réel de la 6ème A, vérifié dans Neon. Sert de contrôle. */
const CLASSE_6A = "fb5fa8be-7d33-4616-8816-f6875ca9ec39";

const hoteTest = hote(lire("web/.env.test.local", "DATABASE_URL_TEST"));
const hoteServeur = hote(lire("web/.env.development.local", "DATABASE_URL"));
if (!hoteTest || hoteServeur !== hoteTest) {
  console.error("ARRET : le serveur de developpement ne pointe pas sur la branche de test.");
  process.exit(1);
}
console.log(`[garde] base ciblee : ${hoteTest} — LECTURE SEULE`);

const SERVICE_TOKEN = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
const ACTEUR = process.env.ACTEUR_ID ?? "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
const JID = "23500000000@c.us";
if (!SERVICE_TOKEN) {
  console.error("ARRET : AGENT_SERVICE_TOKEN introuvable.");
  process.exit(1);
}

const conf = configurerDepuisEnv({
  GROQ_API_KEY: process.env.GROQ_API_KEY || lire("ai_apikey.env", "grok_api"),
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || lire("ai_apikey.env", "mistral_ai"),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || lire("ai_apikey.env", "openrouterai_api"),
});
const ia = new MoteurIA({ cles: conf.cles, modeles: conf.modeles, ordre: conf.ordre });
const guergne = new GuergneHttpClient({ baseUrl: "http://localhost:3000", serviceToken: SERVICE_TOKEN });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
const referentiel = new Referentiel({ guergne });
const audit = new AuditLog();
const provider = new FakeProvider();

let echecs = 0;
const verifier = (c, libelle, detail = "") => {
  console.log(`  ${c ? "OK   " : "ECHEC"} ${libelle}${detail ? ` — ${detail}` : ""}`);
  if (!c) echecs += 1;
};

let dernierPlan = null;
const agent = new Agent({
  provider,
  identity: new IdentityStore([{ jid: JID, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN", msisdn: "23500000000" }]),
  idempotency: new IdempotencyStore(),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  politiques: new MoteurPolitiques({ politiques: POLITIQUES_DEFAUT }),
  guergne,
  destinatairesNotification: async () => [],
  journalEtape: (e) => {
    if (["intent_detected", "politique_evaluee"].includes(e.event)) console.log(`    [${e.event}] ${JSON.stringify(e)}`);
  },
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

// --- 1. La classe existe-t-elle vraiment, et sous ce libelle ? -------------
console.log("\n=== 1. Le referentiel connait-il la 6eme A ? ===");
const listes = await referentiel.pour(ACTEUR);
const classe = listes.classes.find((c) => c.id === CLASSE_6A);
verifier(Boolean(classe), "la classe est dans le referentiel de l'acteur", classe?.libelle);
verifier(classe?.libelle?.toLowerCase().includes("6") ?? false, "son libelle est bien celui d'une 6eme", classe?.libelle);

// --- 2. La donnee existe-t-elle ? ------------------------------------------
console.log("\n=== 2. Y a-t-il des absences dans cette classe ? ===");
const direct = await guergne.listerAbsences({ classeId: CLASSE_6A, limite: 200 }, { actorId: ACTEUR });
verifier(direct.ok !== false, "l'API repond", direct.message ?? "");
// `listerAbsences` rend desormais `{ lignes, total }` : la lecture doit
// suivre, sinon le controle porterait sur un objet et non sur des lignes.
const lignes = lignesDe(direct.data) ?? [];
const totalReel = totalDe(direct.data);
verifier(lignes.length > 0, "des absences existent", `${lignes.length} ligne(s)`);
verifier(
  lignes.every((l) => (l.classe ?? "").toLowerCase().includes("6")),
  "toutes les lignes appartiennent a une 6eme",
  [...new Set(lignes.map((l) => l.classe))].join(", "),
);

// --- 3. Le parcours complet, depuis la phrase ------------------------------
console.log("\n=== 3. « Montre les absences de la 6eme A » ===");
const r = await agent.handle({ id: `6a-${Date.now()}`, from: JID, body: "Montre les absences de la 6eme A." });
const e = audit.last();
console.log(`    statut=${r.status} outil=${e?.intent ?? "-"} perm=${e?.permission ?? "-"} resultat=${e?.result ?? "-"}`);

verifier(e?.result === "SUCCESS", "le backend a servi la demande", e?.error ?? "");
verifier(e?.permission === "OK:assiduite:lire", "la permission reelle a ete verifiee", e?.permission);

// Le controle qui compte : le modele a-t-il choisi LA BONNE classe ?
const classeChoisie = dernierPlan?.params?.classeId ?? dernierPlan?.params?.classe ?? null;
verifier(classeChoisie === CLASSE_6A, "le modele a choisi l'identifiant reel de la 6eme A", String(classeChoisie));

const reponse = provider.lastTextTo(JID) ?? "";
verifier(reponse.length > 0, "une reponse est partie");
verifier(!/Backend scolaire non configur/i.test(reponse), "ce n'est PAS « Backend scolaire non configure »");
verifier(/Absences/.test(reponse), "la reponse porte bien des absences");

console.log("\n    --- REPONSE RENDUE ---");
for (const l of reponse.split("\n").slice(0, 6)) console.log(`    ${l}`);

console.log(`\n=== ${echecs === 0 ? "TOUS LES CONTROLES PASSENT" : `${echecs} CONTROLE(S) EN ECHEC`} ===`);
console.log("portee : branche Neon de test. La production attend AGENT_SERVICE_TOKEN sur Vercel.");
process.exitCode = echecs ? 1 : 0;
