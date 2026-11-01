/**
 * Éprouve CHAQUE outil de lecture du catalogue contre l'API réelle.
 *
 * POURQUOI
 * --------
 * `controleSaisies` est resté au catalogue alors qu'aucune route ne le servait :
 * chaque appel serait parti en 404, après que l'agent l'eut proposé à
 * l'utilisateur. Un test unitaire ne pouvait pas le voir — il n'interroge pas la
 * route. Ce script le fait : il appelle les outils un par un, avec le vrai
 * moteur, le vrai garde et la vraie base.
 *
 * Le plan est figé : on éprouve le catalogue et le backend, pas la
 * compréhension (celle-ci a son propre script, `verif-nlu.mjs`).
 *
 * Lecture seule. Aucune écriture, aucune notification.
 *
 *   cd web && npm run dev
 *   node agent/scripts/e2e-catalogue.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AuditLog } from "../src/audit.js";
import { Agent } from "../src/engine.js";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
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

const guergne = new GuergneHttpClient({ baseUrl: "http://localhost:3000", serviceToken: SERVICE_TOKEN });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
const referentiel = new Referentiel({ guergne });
const audit = new AuditLog();
const provider = new FakeProvider();

// Le référentiel fournit de vrais identifiants : les outils qui en exigent
// seraient sinon éprouvés avec des UUID inventés, donc jamais vraiment éprouvés.
const listes = await referentiel.pour(ACTEUR);
const classe = listes.classes.find((c) => (c.effectif ?? 0) > 0) ?? listes.classes[0];
const periode = listes.periodes[0];
console.log(`[contexte] classe=${classe?.libelle ?? "aucune"} periode=${periode?.libelle ?? "aucune"}`);

let plan = null;
const agent = new Agent({
  provider,
  identity: new IdentityStore([{ jid: JID, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN" }]),
  idempotency: new IdempotencyStore(),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  guergne,
  interpret: async () => plan,
});

const LECTURES = outils.all().filter((t) => t.sensitivity === "read");
const PARAMS = {
  "assiduite.consulter_absences": { limite: 3 },
  "assiduite.alertes": {},
  "assiduite.consulter_retards": { limite: 3 },
  "assiduite.tableau_de_bord": {},
  "assiduite.conduite_classe": { classeId: classe?.id, periodeId: periode?.id },
  "discipline.consulter_incidents": { limite: 3 },
  "discipline.consulter_sanctions": { limite: 3 },
};

let echecs = 0;
let n = 0;
console.log(`\n=== ${LECTURES.length} outil(s) de lecture ===`);
for (const outil of LECTURES) {
  const params = PARAMS[outil.name];
  if (!params) {
    console.log(`  ${outil.name.padEnd(32)} IGNORE — aucun jeu de parametres prevu`);
    echecs += 1;
    continue;
  }
  plan = { tool: outil.name, params };
  await agent.handle({ id: `cat-${Date.now()}-${n++}`, from: JID, body: outil.name });
  const e = audit.last();
  const reponse = provider.lastTextTo(JID) ?? "";
  const ok = e?.result === "SUCCESS";
  // Une reponse generique signifie que l'agent est alle chercher la donnee
  // puis l'a jetee : c'est un echec, meme si l'appel a reussi.
  const rendu = ok && !/Op[ée]ration effectu[ée]e/.test(reponse);
  console.log(
    `  ${outil.name.padEnd(32)} ${ok ? "OK   " : "ECHEC"} perm=${String(e?.permission ?? "-").padEnd(24)} ` +
      `${rendu ? "rendu" : "RENDU GENERIQUE"}`,
  );
  console.log(`      ${reponse.split("\n").slice(0, 2).join(" | ").slice(0, 150)}`);
  if (e?.error) console.log(`      erreur : ${e.error}`);
  if (!ok || !rendu) echecs += 1;
}

console.log(
  `\n${LECTURES.length - echecs}/${LECTURES.length} outil(s) de lecture servis par l'API reelle et rendus lisiblement.`,
);
process.exitCode = echecs ? 1 : 0;
