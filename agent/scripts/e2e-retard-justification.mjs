/**
 * Éprouve les deux écritures qui n'avaient JAMAIS été exécutées de bout en bout :
 * `assiduite.enregistrer_retard` et `assiduite.justifier_absences`.
 *
 * Le reste du catalogue d'écriture (appel, suppression) a sa démonstration dans
 * `e2e-ecriture.mjs`. Ces deux-là étaient écrits, testés unitairement, exposés
 * au modèle — et jamais exécutés une seule fois contre la vraie base. « Écrit »
 * n'est pas « éprouvé ».
 *
 * SÉCURITÉ — CE SCRIPT REFUSE DE S'EXÉCUTER SUR LA PRODUCTION
 * -----------------------------------------------------------
 * Même garde que `e2e-ecriture.mjs` : un déclencheur alimente la file de
 * notification à chaque insertion, et les 549 élèves ont tous un tuteur.
 *
 * Il nettoie TOUT ce qu'il écrit, et le vérifie. Le retard est retiré par SQL
 * direct sur la branche de test, faute de route de suppression — le garde
 * d'hôte s'applique aussi à cette connexion.
 *
 *   cd web && npm run dev
 *   node agent/scripts/e2e-retard-justification.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { AuditLog } from "../src/audit.js";
import { Agent } from "../src/engine.js";
import { GuergneHttpClient } from "../src/guergne-client.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { MatricePermissions } from "../src/permissions-matrix.js";
import { FakeProvider } from "../src/provider.js";
import { Referentiel } from "../src/referentiel.js";
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

// --- Garde-fou -------------------------------------------------------------
const urlTest = lire("web/.env.development.local", "DATABASE_URL");
const hoteTest = hote(lire("web/.env.test.local", "DATABASE_URL_TEST"));
const hoteServeur = hote(urlTest);
const hoteProd = hote(lire("web/.env.local", "DATABASE_URL"));
if (!hoteTest || !hoteServeur || hoteServeur !== hoteTest || hoteServeur === hoteProd) {
  console.error("ARRET : le serveur ne pointe pas sur la branche de test.");
  console.error(`  attendu : ${hoteTest ?? "(inconnu)"}   trouve : ${hoteServeur ?? "(absent)"}`);
  process.exit(1);
}
console.log(`[garde] base ciblee : ${hoteTest} (branche de test, distincte de la production)`);

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

/** Plan figé + résolution RÉELLE des noms : c'est elle qu'on veut éprouver. */
let plan = null;
const agent = new Agent({
  provider,
  identity: new IdentityStore([{ jid: JID, id: ACTEUR, nom: "Compte de service", role: "SUPER_ADMIN" }]),
  idempotency: new IdempotencyStore(),
  audit,
  tools: outils,
  permissions: new MatricePermissions(),
  guergne,
  interpret: async () => {
    if (!plan?.tool) return plan;
    const conv = await resoudreNomsEleves({
      outil: outils.get(plan.tool),
      params: plan.params ?? {},
      guergne,
      acteurId: ACTEUR,
    });
    if (conv.statut === "clarifier") return { clarify: conv.question };
    return { ...plan, params: conv.params };
  },
});

let n = 0;
let echecs = 0;
async function dire(etiquette, nouveauPlan, texte = etiquette) {
  plan = nouveauPlan;
  console.log(`\n--- ${etiquette}`);
  const r = await agent.handle({ id: `erj-${Date.now()}-${n++}`, from: JID, body: texte });
  const e = audit.last();
  console.log(`    statut=${r.status} outil=${e?.intent ?? "-"} perm=${e?.permission ?? "-"} resultat=${e?.result ?? "-"}`);
  const rep = provider.lastTextTo(JID);
  if (rep) console.log(`    reponse : ${rep.split("\n").slice(0, 2).join(" | ").slice(0, 160)}`);
  if (e?.error) console.log(`    erreur  : ${e.error}`);
  return { r, e };
}
const verifier = (c, libelle, detail = "") => {
  console.log(`    ${c ? "OK   " : "ECHEC"} ${libelle}${detail ? ` — ${detail}` : ""}`);
  if (!c) echecs += 1;
};

// --- Contexte réel ---------------------------------------------------------
const listes = await referentiel.pour(ACTEUR);
const classe = listes.classes.find((c) => (c.effectif ?? 0) > 0);
const periode = listes.periodes[0];
if (!classe || !periode) {
  console.error("Referentiel incomplet.");
  process.exit(1);
}
const effectif = (await guergne.listerElevesClasse({ classeId: classe.id }, { actorId: ACTEUR })).data ?? [];
const eleve = effectif[0];
if (!eleve) {
  console.error("Classe sans effectif lisible.");
  process.exit(1);
}
const JOUR = new Date().toISOString().slice(0, 10);
// Nom volontairement abîmé, à la façon d'une transcription vocale.
const nomDicte = `${String(eleve.prenom ?? "").slice(0, -1)} ${eleve.nom}`;
console.log(`\n[contexte] classe=${classe.libelle} periode=${periode.libelle} jour=${JOUR}`);
console.log(`[contexte] eleve reel = ${eleve.prenom} ${eleve.nom}  |  nom DICTE = ${nomDicte}`);

const compterRetards = async () =>
  ((await guergne.listerRetards({ classeId: classe.id, limite: 200 }, { actorId: ACTEUR })).data ?? []).filter(
    (l) => String(l.dateRetard).slice(0, 10) === JOUR && l.eleveId === eleve.eleveId,
  );
const lireAbsences = async () =>
  (await guergne.listerAbsences({ classeId: classe.id, depuis: JOUR, jusqua: JOUR, limite: 200 }, { actorId: ACTEUR }))
    .data ?? [];

const retardsAvant = (await compterRetards()).length;
const absencesAvant = (await lireAbsences()).length;
console.log(`[contexte] ce jour, pour cet eleve : ${retardsAvant} retard(s), ${absencesAvant} absence(s) en classe`);

// --- 1. Retard --------------------------------------------------------------
await dire("ENREGISTRER UN RETARD (nom dicte, abime)", {
  tool: "assiduite.enregistrer_retard",
  params: {
    classeId: classe.id,
    periodeId: periode.id,
    eleve: nomDicte,
    dateRetard: JOUR,
    dureeMinutes: 15,
    motif: "test automatise de bout en bout",
  },
});

const retards = await compterRetards();
verifier(retards.length === retardsAvant + 1, "le retard a atteint la base", `${retardsAvant} -> ${retards.length}`);
const retard = retards[0];
if (retard) {
  verifier(retard.eleveId === eleve.eleveId, "le nom abime a ete resolu sur le BON eleve");
  verifier(Number(retard.dureeMinutes) === 15, "la duree est celle demandee", `${retard.dureeMinutes} min`);
}

// --- 2. Justification -------------------------------------------------------
await dire("ENREGISTRER UNE ABSENCE A JUSTIFIER", {
  tool: "assiduite.enregistrer_appel",
  params: {
    classeId: classe.id,
    periodeId: periode.id,
    eleves: nomDicte,
    dateAbsence: JOUR,
    nbHeures: 2,
  },
});

const posees = (await lireAbsences()).filter((l) => l.eleveId === eleve.eleveId);
const absence = posees[0];
verifier(Boolean(absence), "l'absence a atteint la base");
if (absence) {
  verifier(absence.statut === "NON_JUSTIFIEE", "elle part non justifiee", absence.statut);

  await dire("JUSTIFIER L'ABSENCE", {
    tool: "assiduite.justifier_absences",
    params: { absenceIds: [absence.id], statut: "JUSTIFIEE", motif: "certificat medical (test)" },
  });
  // Une modification en lot exige une confirmation : c'est volontaire.
  if (provider.lastTextTo(JID)?.includes("oui")) await dire("CONFIRMER", null, "oui");

  const apres = (await lireAbsences()).find((l) => l.id === absence.id);
  verifier(apres?.statut === "JUSTIFIEE", "l'absence est passee a JUSTIFIEE", apres?.statut);

  // --- 3. Nettoyage --------------------------------------------------------
  await dire("SUPPRIMER L'ABSENCE DE TEST", {
    tool: "assiduite.supprimer_absence",
    params: { absenceId: absence.id, motif: "nettoyage du test automatise" },
  });
  await dire("CONFIRMER LA SUPPRESSION", null, "oui");
}

// Le retard n'a pas de route de suppression : on le retire par SQL direct, sur
// la branche de test uniquement — le garde d'hote ci-dessus l'a deja prouvee.
if (retard) {
  const client = new pg.Client({ connectionString: urlTest });
  await client.connect();
  const { rowCount } = await client.query("delete from retards where id = $1", [retard.id]);
  await client.end();
  console.log(`\n[nettoyage] retard de test supprime par SQL direct (${rowCount} ligne)`);
}

const retardsApres = (await compterRetards()).length;
const absencesApres = (await lireAbsences()).length;
console.log(`[nettoyage] etat final : ${retardsApres} retard(s), ${absencesApres} absence(s)`);
verifier(retardsApres === retardsAvant, "aucun retard residuel", `${retardsAvant} -> ${retardsApres}`);
verifier(absencesApres === absencesAvant, "aucune absence residuelle", `${absencesAvant} -> ${absencesApres}`);

console.log(`\n=== ${echecs === 0 ? "TOUS LES CONTROLES PASSENT" : `${echecs} CONTROLE(S) EN ECHEC`} ===`);
process.exitCode = echecs ? 1 : 0;
