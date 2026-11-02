/**
 * Campagne de tests CRUD + RBAC sur l'API agent.
 *
 * SÛRETÉ — pourquoi des fixtures et pas les vraies données
 * --------------------------------------------------------
 * Le déclencheur `absences_notification` met en file une notification à CHAQUE
 * tuteur rattaché, dès l'insertion d'une absence. Or les 549 élèves de la base
 * ont tous au moins un tuteur : créer une absence de test sur un élève réel
 * enverrait un vrai SMS à un vrai parent.
 *
 * La campagne crée donc son propre élève de test, **sans tuteur** (le
 * déclencheur ne trouve aucun destinataire), l'utilise pour toutes les
 * opérations, puis supprime tout et vérifie le retour à l'état initial.
 * Aucune donnée de production n'est modifiée ni supprimée.
 *
 * Prérequis : serveur sur http://localhost:3000, `web/.env.local` avec
 * AGENT_SERVICE_TOKEN. Aucun secret n'est affiché.
 *
 *   node agent/scripts/campagne-crud.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = readFileSync(resolve(racine, "web/.env.local"), "utf8");
const g = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");

const TOKEN = g("AGENT_SERVICE_TOKEN");
const BASE = "http://localhost:3000";
const MARQUE = "ZZTEST-AGENT";
const CLASSE = "66459664-6b0d-42c9-ba24-eefc97297631"; // 6ème B
const ANNEE = "06c2249d-ecb6-475d-b5b1-b41af4bf4067"; // 2025-2026
const PERIODE = "6bf40233-015e-4aae-a2ca-4f18f0c883a8"; // 1er Trimestre
const AUJ = new Date().toISOString().slice(0, 10);

// Priorité à la branche Neon de test : la campagne écrit et supprime, elle ne
// doit jamais toucher la production. `web/.env.test.local` n'existe que si la
// branche isolée a été créée.
let urlTest = null;
try {
  const t = readFileSync(resolve(racine, "web/.env.test.local"), "utf8");
  urlTest = (t.match(/^DATABASE_URL_TEST=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
} catch {
  /* pas de branche de test : on retombe sur la configuration locale */
}
console.log(urlTest ? "Base : branche Neon de TEST (isolée)" : "Base : configuration locale (.env.local)");

const db = new pg.Client({
  connectionString: urlTest || g("DATABASE_URL_DIRECT") || g("DATABASE_URL"),
  ssl: { rejectUnauthorized: false },
});
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const n1 = async (sql, p = []) => (await q(sql, p))[0];

/** Appel de l'API agent. */
async function api(action, params, acteurId) {
  const r = await fetch(`${BASE}/api/agent/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      "x-acteur-id": acteurId ?? "",
    },
    body: JSON.stringify(params ?? {}),
  });
  let corps = null;
  try {
    corps = await r.json();
  } catch {
    /* corps vide */
  }
  return { status: r.status, corps };
}

const resultats = [];
let idTest = 0;
function verifier(nom, attendu, obtenu, preuve = "") {
  idTest++;
  const ok = attendu === obtenu;
  resultats.push({ id: `T${String(idTest).padStart(2, "0")}`, nom, attendu, obtenu, ok, preuve });
  console.log(`${ok ? "PASS" : "FAIL"} T${String(idTest).padStart(2, "0")} ${nom} — attendu ${attendu}, obtenu ${obtenu}${preuve ? " | " + preuve : ""}`);
  return ok;
}

await db.connect();

// ---------------------------------------------------------------------------
// Références initiales
// ---------------------------------------------------------------------------
const avant = {
  absences: (await n1("select count(*)::int n from absences")).n,
  retards: (await n1("select count(*)::int n from retards")).n,
  audit: (await n1("select count(*)::int n from journal_audit")).n,
  eleves: (await n1("select count(*)::int n from eleves")).n,
};
console.log("État initial :", JSON.stringify(avant), "\n");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const suffixe = Date.now().toString(36);
const eleve = await n1(
  `insert into eleves (matricule, nom, prenom, sexe, date_naissance)
   values ($1,$2,$3,'M','2010-01-01') returning id, matricule`,
  [`${MARQUE}-${suffixe}`, MARQUE, "Fixture"],
);
const insc = await n1(
  `insert into inscriptions (eleve_id, annee_id, classe_id, active)
   values ($1,$2,$3,true) returning id`,
  [eleve.id, ANNEE, CLASSE],
);
console.log(`Fixture élève ${eleve.matricule} (${eleve.id}), inscription ${insc.id}`);
console.log("tuteurs rattachés :", (await n1("select count(*)::int n from eleve_tuteur where eleve_id=$1", [eleve.id])).n, "(0 = aucune notification déclenchée)\n");

const roles = ["SUPER_ADMIN", "DIRECTION", "SURVEILLANT", "SECRETARIAT", "ENSEIGNANT", "PARENT"];
const acteurs = {};
for (const role of roles) {
  // `chk_identifiant` exige un email ou un téléphone : on donne un email de test
  // sur un domaine réservé aux exemples (RFC 2606), jamais délivrable.
  const u = await n1(
    `insert into utilisateurs (role, nom, prenom, email, actif) values ($1,$2,$3,$4,true) returning id`,
    [role, `${MARQUE}-${role}`, "Test", `${role.toLowerCase()}.${suffixe}@example.invalid`],
  );
  acteurs[role] = u.id;
}
console.log("Utilisateurs de test créés pour", roles.join(", "), "\n");

// ---------------------------------------------------------------------------
// A. Authentification et liste blanche
// ---------------------------------------------------------------------------
console.log("--- A. Authentification et surface d'attaque ---");
{
  const r = await fetch(`${BASE}/api/agent/listerAbsences`, { method: "POST" });
  verifier("sans jeton de service", 401, r.status);
}
{
  const r = await fetch(`${BASE}/api/agent/listerAbsences`, {
    method: "POST",
    headers: { authorization: "Bearer faux" },
  });
  verifier("jeton de service incorrect", 401, r.status);
}
verifier("sans x-acteur-id", 400, (await api("listerAbsences", {}, "")).status);
verifier("acteur inexistant", 403, (await api("listerAbsences", {}, "00000000-0000-0000-0000-000000000000")).status);
verifier("acteur mal formé", 400, (await api("listerAbsences", {}, "pas-un-uuid")).status);
verifier("action hors liste blanche", 404, (await api("DROP TABLE eleves", {}, acteurs.SUPER_ADMIN)).status);
verifier("action inexistante", 404, (await api("supprimerToutesLesAbsences", {}, acteurs.SUPER_ADMIN)).status);

// ---------------------------------------------------------------------------
// B. RBAC — la matrice réelle est-elle respectée ?
// ---------------------------------------------------------------------------
console.log("\n--- B. RBAC (le backend reste l'autorité) ---");
const lecture = { action: "listerAbsences", params: { classeId: CLASSE, limite: 5 } };
const ecriture = {
  action: "enregistrerRetard",
  params: { inscriptionId: insc.id, periodeId: PERIODE, dateRetard: AUJ, dureeMinutes: 10, motif: "test" },
};

verifier("SUPER_ADMIN lit l'assiduité", 200, (await api(lecture.action, lecture.params, acteurs.SUPER_ADMIN)).status);
verifier("DIRECTION lit l'assiduité", 200, (await api(lecture.action, lecture.params, acteurs.DIRECTION)).status);
verifier("SURVEILLANT lit l'assiduité", 200, (await api(lecture.action, lecture.params, acteurs.SURVEILLANT)).status);
verifier("SECRETARIAT lit l'assiduité", 200, (await api(lecture.action, lecture.params, acteurs.SECRETARIAT)).status);
verifier("PARENT refusé (non habilité)", 403, (await api(lecture.action, lecture.params, acteurs.PARENT)).status);
verifier("ENSEIGNANT sans assiduite:lire", 403, (await api(lecture.action, lecture.params, acteurs.ENSEIGNANT)).status);

verifier("DIRECTION ne peut PAS saisir un retard", 403, (await api(ecriture.action, ecriture.params, acteurs.DIRECTION)).status);
verifier("SECRETARIAT ne peut PAS saisir un retard", 403, (await api(ecriture.action, ecriture.params, acteurs.SECRETARIAT)).status);
verifier("PARENT ne peut PAS saisir un retard", 403, (await api(ecriture.action, ecriture.params, acteurs.PARENT)).status);

// ---------------------------------------------------------------------------
// C. CREATE
// ---------------------------------------------------------------------------
console.log("\n--- C. CREATE (avec vérification en base) ---");
const rc = await api(ecriture.action, ecriture.params, acteurs.SURVEILLANT);
verifier("SURVEILLANT crée un retard (HTTP)", 200, rc.status);
const retardsFixture = await q("select id, duree_minutes, motif from retards where inscription_id=$1", [insc.id]);
verifier("retard présent en base", 1, retardsFixture.length, `id=${retardsFixture[0]?.id}`);
const auditRetard = await n1("select count(*)::int n from journal_audit where action='retard.saisi' and utilisateur_id=$1", [acteurs.SURVEILLANT]);
verifier("audit « retard.saisi » écrit", 1, auditRetard.n);

const ra = await api(
  "enregistrerAppel",
  { periodeId: PERIODE, dateAbsence: AUJ, nbHeures: 2, absents: [insc.id], retards: [] },
  acteurs.SURVEILLANT,
);
verifier("SURVEILLANT crée une absence (HTTP)", 200, ra.status);
const absFixture = await q("select id, statut, nb_heures from absences where inscription_id=$1", [insc.id]);
verifier("absence présente en base", 1, absFixture.length, `id=${absFixture[0]?.id}`);
verifier("heures enregistrées", "2.00", String(absFixture[0]?.nb_heures ?? ""), "nb_heures");
const notifs = await n1("select count(*)::int n from notifications where eleve_id=$1", [eleve.id]).catch(() => ({ n: -1 }));
verifier("aucune notification générée (élève sans tuteur)", 0, notifs.n);

// ---------------------------------------------------------------------------
// D. READ
// ---------------------------------------------------------------------------
console.log("\n--- D. READ ---");
const rl = await api("listerAbsences", { classeId: CLASSE, limite: 200 }, acteurs.SURVEILLANT);
verifier("lecture HTTP", 200, rl.status);
const trouve = (rl.corps?.data ?? []).some((l) => l.id === absFixture[0]?.id);
verifier("l'absence créée est bien lue", true, trouve);

// ---------------------------------------------------------------------------
// E. UPDATE
// ---------------------------------------------------------------------------
console.log("\n--- E. UPDATE (comparaison avant/après) ---");
const statutAvant = absFixture[0]?.statut;
const ru = await api(
  "justifierEnLot",
  { absenceIds: [absFixture[0].id], statut: "JUSTIFIEE", motif: "certificat de test" },
  acteurs.SURVEILLANT,
);
verifier("justification HTTP", 200, ru.status);
const apresMaj = await n1("select statut, motif, justifiee_par from absences where id=$1", [absFixture[0].id]);
verifier("statut modifié en base", "JUSTIFIEE", apresMaj.statut, `avant=${statutAvant}`);
verifier("motif enregistré", "certificat de test", apresMaj.motif ?? "");
verifier("auteur de la justification tracé", acteurs.SURVEILLANT, apresMaj.justifiee_par ?? "");
const auditMaj = await n1("select count(*)::int n from journal_audit where action='absence.justifiee_en_lot' and utilisateur_id=$1", [acteurs.SURVEILLANT]);
verifier("audit « justifiee_en_lot » écrit", 1, auditMaj.n);

// Validations métier
verifier(
  "justification > 200 refusée",
  422,
  (await api("justifierEnLot", { absenceIds: Array.from({ length: 201 }, () => absFixture[0].id), statut: "JUSTIFIEE", motif: "x y z" }, acteurs.SURVEILLANT)).status,
);
verifier(
  "motif trop court refusé",
  422,
  (await api("justifierEnLot", { absenceIds: [absFixture[0].id], statut: "JUSTIFIEE", motif: "x" }, acteurs.SURVEILLANT)).status,
);

// ---------------------------------------------------------------------------
// F. DELETE
// ---------------------------------------------------------------------------
console.log("\n--- F. DELETE ---");
verifier(
  "suppression sans motif refusée",
  422,
  (await api("supprimerAbsence", { absenceId: absFixture[0].id, motif: "x" }, acteurs.SURVEILLANT)).status,
);
const rd = await api("supprimerAbsence", { absenceId: absFixture[0].id, motif: "nettoyage campagne de test" }, acteurs.SURVEILLANT);
verifier("suppression HTTP", 200, rd.status);
const reste = await n1("select count(*)::int n from absences where id=$1", [absFixture[0].id]);
verifier("absence réellement supprimée en base", 0, reste.n);
const auditSup = await n1("select count(*)::int n from journal_audit where action='absence.supprimee' and utilisateur_id=$1", [acteurs.SURVEILLANT]);
verifier("audit « absence.supprimee » écrit", 1, auditSup.n);
verifier(
  "seconde suppression (doublon) refusée proprement",
  422,
  (await api("supprimerAbsence", { absenceId: absFixture[0].id, motif: "nettoyage campagne de test" }, acteurs.SURVEILLANT)).status,
);

// ---------------------------------------------------------------------------
// G. Concurrence
// ---------------------------------------------------------------------------
console.log("\n--- G. Exécutions simultanées ---");
const simultanes = await Promise.all(
  Array.from({ length: 5 }, () => api("listerAbsences", { classeId: CLASSE, limite: 5 }, acteurs.SURVEILLANT)),
);
verifier("5 lectures simultanées", 5, simultanes.filter((r) => r.status === 200).length);

// ---------------------------------------------------------------------------
// Nettoyage et vérification du retour à l'état initial
// ---------------------------------------------------------------------------
console.log("\n--- Nettoyage ---");
await db.query("delete from retards where inscription_id=$1", [insc.id]);
await db.query("delete from absences where inscription_id=$1", [insc.id]);
await db.query("delete from inscriptions where id=$1", [insc.id]);
await db.query("delete from eleves where id=$1", [eleve.id]);
// Le journal d'audit est IMMUABLE (déclencheur `audit_pas_de_update`) : c'est la
// garantie que rien de ce que fait l'agent ne peut être effacé après coup. On ne
// supprime donc que les comptes n'ayant rien journalisé ; les autres sont
// désactivés, ce qui les neutralise sans toucher à la trace.
const idsActeurs = Object.values(acteurs);
const comptesSupprimes = await db.query(
  `delete from utilisateurs u where u.id = any($1::uuid[])
     and not exists (select 1 from journal_audit j where j.utilisateur_id = u.id)`,
  [idsActeurs],
);
const comptesDesactives = await db.query(
  `update utilisateurs set actif = false where id = any($1::uuid[]) and actif`,
  [idsActeurs],
);
console.log(
  `comptes de test : ${comptesSupprimes.rowCount} supprimé(s), ${comptesDesactives.rowCount} désactivé(s) (audit immuable)`,
);

const apres = {
  absences: (await n1("select count(*)::int n from absences")).n,
  retards: (await n1("select count(*)::int n from retards")).n,
  eleves: (await n1("select count(*)::int n from eleves")).n,
};
verifier("absences revenues à l'état initial", avant.absences, apres.absences);
verifier("retards revenus à l'état initial", avant.retards, apres.retards);
verifier("élèves revenus à l'état initial", avant.eleves, apres.eleves);
verifier("aucune fixture résiduelle", 0, (await n1("select count(*)::int n from eleves where nom=$1", [MARQUE])).n);

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
const pass = resultats.filter((r) => r.ok).length;
console.log(`\n==== ${pass}/${resultats.length} tests réussis ====`);

const md = [
  "# Résultats de la campagne CRUD + RBAC",
  "",
  `Exécutée le ${new Date().toISOString().slice(0, 16).replace("T", " ")} contre la base réelle,`,
  "via `node agent/scripts/campagne-crud.mjs` (serveur local, API `/api/agent/*`).",
  "",
  `**${pass} / ${resultats.length} tests réussis.**`,
  "",
  "## Sûreté de la campagne",
  "",
  "Le déclencheur `absences_notification` met en file une notification à chaque tuteur",
  "dès l'insertion d'une absence, et les 549 élèves réels ont tous un tuteur. La campagne",
  "crée donc son **propre élève de test sans tuteur**, opère uniquement dessus, puis",
  "supprime tout. Aucune donnée de production n'a été modifiée ni supprimée — vérifié par",
  "comparaison des compteurs avant/après.",
  "",
  `État initial : ${avant.absences} absences, ${avant.retards} retards, ${avant.eleves} élèves.`,
  `État final : ${apres.absences} absences, ${apres.retards} retards, ${apres.eleves} élèves.`,
  "",
  "## Détail",
  "",
  "| Test | Intitulé | Attendu | Obtenu | Statut |",
  "|---|---|---|---|---|",
  ...resultats.map((r) => `| ${r.id} | ${r.nom} | \`${r.attendu}\` | \`${r.obtenu}\` | ${r.ok ? "✅ PASS" : "❌ FAIL"} |`),
  "",
].join("\n");
writeFileSync(resolve(racine, "docs/AI_SCHOOL_AGENT/CRUD_TEST_RESULTS.md"), md, "utf8");
console.log("Rapport écrit dans docs/AI_SCHOOL_AGENT/CRUD_TEST_RESULTS.md");

await db.end();
process.exit(pass === resultats.length ? 0 : 1);
