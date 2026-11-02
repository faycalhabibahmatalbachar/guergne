/**
 * Démonstration bout-en-bout (ÉCRITURE) : message → NLU Groq → résolution des
 * noms → moteur d'agent → API guergne → base Neon isolée → relecture → nettoyage.
 *
 * C'est le chemin du LOT 3. Rien n'est simulé hormis le transport WhatsApp :
 * le LLM, l'API, le garde et la base sont réels.
 *
 * SÉCURITÉ — CE SCRIPT REFUSE DE S'EXÉCUTER SUR LA PRODUCTION
 * ------------------------------------------------------------
 * Les 549 élèves ont tous un tuteur, et un déclencheur alimente la file de
 * notification à chaque absence insérée. Une écriture de démonstration sur la
 * base de production enverrait donc de vrais messages à de vrais parents.
 * Le script vérifie donc, AVANT toute écriture, que le serveur pointe sur la
 * branche Neon de test, et s'arrête sinon. Voir `NEON_TEST_ENVIRONMENT.md`.
 *
 * Il nettoie ce qu'il écrit, et le vérifie.
 *
 *   cd web && npm run dev          # serveur sur la branche de test
 *   node agent/scripts/e2e-ecriture.mjs
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
import { lignesDe } from "../src/rendu.js";
import { resoudreNomsEleves } from "../src/resolution-eleves.js";
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

// --- Garde-fou : la base visée doit être la branche de test ----------------
const hoteTest = hote(lire("web/.env.test.local", "DATABASE_URL_TEST"));
const hoteServeur = hote(lire("web/.env.development.local", "DATABASE_URL"));
const hoteProd = hote(lire("web/.env.local", "DATABASE_URL"));

if (!hoteTest) {
  console.error("ARRET : web/.env.test.local introuvable — impossible de savoir quelle base est la base de test.");
  process.exit(1);
}
if (!hoteServeur) {
  console.error("ARRET : web/.env.development.local absent.");
  console.error("Le serveur pointerait donc sur la PRODUCTION, ou l'ecriture");
  console.error("declencherait de vraies notifications aux tuteurs.");
  console.error("Voir docs/AI_SCHOOL_AGENT/NEON_TEST_ENVIRONMENT.md §4.");
  process.exit(1);
}
if (hoteServeur !== hoteTest) {
  console.error("ARRET : le serveur ne pointe pas sur la branche de test.");
  console.error(`  attendu : ${hoteTest}`);
  console.error(`  trouve  : ${hoteServeur}`);
  process.exit(1);
}
if (hoteServeur === hoteProd) {
  console.error("ARRET : la surcharge pointe sur la base de PRODUCTION.");
  process.exit(1);
}
console.log(`[garde] base ciblee : ${hoteTest} (branche de test, distincte de la production)`);

const SERVICE_TOKEN = lire("web/.env.local", "AGENT_SERVICE_TOKEN");
const GROQ_KEY = lire("ai_apikey.env", "grok_api");
const ACTEUR = process.env.ACTEUR_ID ?? "e49a3dea-76b3-4607-9ccb-2b5fcf3ac0ad";
const JID = "23566000001@c.us";

if (!SERVICE_TOKEN || !GROQ_KEY) {
  console.error("Secrets manquants (AGENT_SERVICE_TOKEN / grok_api).");
  process.exit(1);
}

const guergne = new GuergneHttpClient({ baseUrl: "http://localhost:3000", serviceToken: SERVICE_TOKEN });
const referentiel = new Referentiel({ guergne });
const outils = new ToolRegistry(ASSIDUITE_TOOLS);
const provider = new FakeProvider();
const audit = new AuditLog();

/** NLU réel, puis conversion déterministe des noms en identifiants. */
function interpreter(registre) {
  return async (texte, ctx = {}) => {
    const listes = await referentiel.pour(ctx.staff?.id ?? ACTEUR);
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        messages: [
          { role: "system", content: registre.invitePourNlu() },
          { role: "system", content: Referentiel.enTexte(listes) },
          { role: "system", content: `La date du jour est ${new Date().toISOString().slice(0, 10)}.` },
          { role: "user", content: texte },
        ],
      }),
    });
    const d = await r.json();
    const m = (d.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    if (!m) return { clarify: "Je n'ai pas compris." };

    let plan;
    try {
      plan = JSON.parse(m[0]);
    } catch {
      return { clarify: "Je n'ai pas compris." };
    }
    if (plan.clarify || !plan.tool) return plan;

    const conv = await resoudreNomsEleves({
      outil: registre.get(plan.tool),
      params: plan.params ?? {},
      guergne,
      acteurId: ctx.staff?.id ?? ACTEUR,
    });
    if (conv.statut === "clarifier") return { clarify: conv.question };
    return { ...plan, params: conv.params };
  };
}

const agent = new Agent({
  provider,
  identity: new IdentityStore([{ jid: JID, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN" }]),
  idempotency: new IdempotencyStore(),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  guergne,
  interpret: interpreter(outils),
});

let n = 0;
async function dire(texte) {
  console.log(`\n--- MESSAGE : ${texte}`);
  const r = await agent.handle({ id: `e2e-w-${Date.now()}-${n++}`, from: JID, body: texte });
  const e = audit.last();
  console.log(`    statut=${r.status} outil=${e?.intent ?? "-"} perm=${e?.permission ?? "-"} resultat=${e?.result ?? "-"}`);
  const rep = provider.lastTextTo(JID);
  if (rep) console.log(`    reponse : ${rep.split("\n").slice(0, 3).join(" | ").slice(0, 200)}`);
  if (e?.error) console.log(`    erreur  : ${e.error}`);
  return r;
}

// --- Contexte réel : une classe, une période, un élève de cette classe -----
const listes = await referentiel.pour(ACTEUR);
const classe = listes.classes.find((c) => (c.effectif ?? 0) > 0);
const periode = listes.periodes[0];
if (!classe || !periode) {
  console.error("Referentiel incomplet : aucune classe peuplee ou aucune periode.");
  process.exit(1);
}
const effectif = await guergne.listerElevesClasse({ classeId: classe.id }, { actorId: ACTEUR });
const eleve = effectif.data?.[0];
if (!eleve) {
  console.error("Classe sans effectif lisible.");
  process.exit(1);
}

// Nom volontairement abîmé, à la façon d'une transcription vocale : on retire
// la derniere lettre du prenom. C'est exactement le cas « Mahamat » -> « Mahama ».
const prenomAbime = String(eleve.prenom ?? "").slice(0, -1);
const nomDicte = `${prenomAbime} ${eleve.nom}`;

const JOUR = new Date().toISOString().slice(0, 10);
console.log(`\n[contexte] classe=${classe.libelle} periode=${periode.libelle} jour=${JOUR}`);
console.log(`[contexte] eleve reel = ${eleve.prenom} ${eleve.nom}`);
console.log(`[contexte] nom DICTE  = ${nomDicte}  (prenom tronque volontairement)`);

const avant = await guergne.listerAbsences({ classeId: classe.id, depuis: JOUR, jusqua: JOUR, limite: 200 }, { actorId: ACTEUR });
console.log(`[contexte] absences deja presentes ce jour dans cette classe : ${(lignesDe(avant.data) ?? []).length ?? "?"}`);

// --- 1. Écriture : le nom abîmé doit être résolu ---------------------------
await dire(
  `Enregistre une absence de 2 heures pour ${nomDicte} en ${classe.libelle} ` +
    `le ${JOUR} au titre du ${periode.libelle}.`,
);

// --- 2. Relecture : l'écriture a-t-elle vraiment atteint la base ? --------
const apres = await guergne.listerAbsences({ classeId: classe.id, depuis: JOUR, jusqua: JOUR, limite: 200 }, { actorId: ACTEUR });
const lignes = lignesDe(apres.data) ?? [];
console.log(`\n[verif] absences ce jour dans cette classe : ${lignes.length} (avant : ${(lignesDe(avant.data) ?? []).length ?? "?"})`);
const posee = lignes.find((l) => l.eleveId === eleve.eleveId);
if (!posee) {
  console.error("[verif] ECHEC : aucune absence trouvee pour cet eleve. Rien a nettoyer.");
  process.exit(1);
}
console.log(`[verif] OK : ${posee.prenom} ${posee.nom} — ${posee.dateAbsence}, ${posee.nbHeures} h, ${posee.statut}`);
console.log(`[verif] l'eleve resolu est bien celui attendu : ${posee.eleveId === eleve.eleveId}`);

// --- 3. Nettoyage : suppression, qui exige une confirmation --------------
await dire(`Supprime l'absence ${posee.id}, motif : test automatise de bout en bout.`);
await dire("oui");

const final = await guergne.listerAbsences({ classeId: classe.id, depuis: JOUR, jusqua: JOUR, limite: 200 }, { actorId: ACTEUR });
const reste = (lignesDe(final.data) ?? []).some((l) => l.id === posee.id);
console.log(`\n[nettoyage] l'absence de test est ${reste ? "TOUJOURS PRESENTE — a retirer a la main" : "supprimee"}`);
console.log(`[nettoyage] absences ce jour : ${(lignesDe(final.data) ?? []).length ?? "?"} (etat initial : ${(lignesDe(avant.data) ?? []).length ?? "?"})`);
process.exit(reste ? 1 : 0);
