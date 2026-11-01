/**
 * Mission complète de bout en bout, en configuration de PRODUCTION.
 *
 * Rien n'est simulé hormis le transport WhatsApp : le modèle planifie
 * réellement, les politiques décident réellement, l'API répond réellement, et
 * les chiffres du bilan sont calculés à partir des lignes effectivement lues.
 *
 * C'est la démonstration du §7 de la directive : une demande, plusieurs
 * consultations, une synthèse, et aucune confirmation intermédiaire.
 *
 * LECTURE SEULE. Une mission ne contient que des consultations — le moteur
 * refuse un plan qui tenterait d'y glisser une écriture.
 *
 *   cd web && npm run dev
 *   node agent/scripts/e2e-mission.mjs
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

const hoteTest = hote(lire("web/.env.test.local", "DATABASE_URL_TEST"));
const hoteServeur = hote(lire("web/.env.development.local", "DATABASE_URL"));
if (!hoteTest || hoteServeur !== hoteTest) {
  console.error("ARRET : le serveur de developpement ne pointe pas sur la branche de test.");
  process.exit(1);
}
console.log(`[garde] base ciblee : ${hoteTest} (branche de test) — LECTURE SEULE`);

const SERVICE_TOKEN = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
const ACTEUR = process.env.ACTEUR_ID ?? "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
const JID = "23500000000@c.us";
if (!SERVICE_TOKEN) {
  console.error("ARRET : AGENT_SERVICE_TOKEN introuvable.");
  process.exit(1);
}

const cles = {
  GROQ_API_KEY: process.env.GROQ_API_KEY || lire("ai_apikey.env", "grok_api"),
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || lire("ai_apikey.env", "mistral_ai"),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || lire("ai_apikey.env", "openrouterai_api"),
};
const conf = configurerDepuisEnv(cles);
const ia = new MoteurIA({ cles: conf.cles, modeles: conf.modeles, ordre: conf.ordre });
const guergne = new GuergneHttpClient({ baseUrl: "http://localhost:3000", serviceToken: SERVICE_TOKEN });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
const referentiel = new Referentiel({ guergne });
const audit = new AuditLog();
const provider = new FakeProvider();

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
    if (["mission_demarree", "mission_etape", "mission_terminee", "mission_reprise", "politique_evaluee"].includes(e.event)) {
      console.log(`    [${e.event}] ${JSON.stringify(e).slice(0, 170)}`);
    }
  },
  // NLU RÉEL : c'est le modèle qui décide des étapes.
  interpret: async (texte, ctx = {}) => {
    const listes = await referentiel.pour(ctx.staff?.id ?? ACTEUR);
    const r = await ia.completerJson([
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: Referentiel.enTexte(listes) },
      { role: "system", content: `La date du jour est ${new Date().toISOString().slice(0, 10)}.` },
      { role: "user", content: texte },
    ]);
    console.log(`    [nlu] ${r.fournisseur}/${r.modele} en ${r.dureeMs} ms`);
    return r.objet;
  },
});

let n = 0;
async function dire(texte) {
  console.log(`\n--- DEMANDE : « ${texte} »`);
  const r = await agent.handle({ id: `mis-${Date.now()}-${n++}`, from: JID, body: texte });
  console.log(`    statut=${r.status}${r.mission ? ` etapes=${r.mission.reussies}/${r.mission.total}` : ""}`);
  const rep = provider.lastTextTo(JID);
  if (rep) {
    console.log("    --- BILAN RENDU ---");
    for (const l of rep.split("\n")) console.log(`    ${l}`);
  }
  return r;
}

await dire("Prepare le bilan d'assiduite et de discipline, et indique les classes les plus concernees.");
await dire("Compare les absences et les retards par classe.");

console.log("\n=== INDICATEURS D'AUTONOMIE ===");
const m = agent.metriques;
for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(24)} ${v}`);
console.log(
  `\n  Aucune confirmation demandee : ${m.confirmationsDemandees === 0 ? "OUI" : "NON (" + m.confirmationsDemandees + ")"}`,
);
process.exitCode = m.rapportsGeneres >= 2 ? 0 : 1;
