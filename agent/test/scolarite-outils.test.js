/**
 * Les huit outils branchés le 2026-11-11 (registre §4).
 *
 * Ce qui est éprouvé ici : ce que l'AGENT fait de la demande — reconnaître
 * « premier trimestre » ou « jamais connecté », résoudre un nom en identifiant
 * relu au backend, s'arrêter sur une ambiguïté, et rendre une réponse qui ne
 * ment ni par omission ni par artefact. Ce que le BACKEND fait de ces
 * paramètres est éprouvé contre la base de test par
 * `scripts/recette-scolarite-reel.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SCOLARITE_TOOLS,
  etatParent,
  numeroPeriode,
  rendreCalendrier,
  rendreReleve,
  rendreSituations,
} from "../src/tools-scolarite.js";

const outil = (nom) => SCOLARITE_TOOLS.find((o) => o.name === nom);
const ok = (data) => ({ ok: true, data });

const C4B = "11111111-1111-4111-8111-111111111111";
const C4A = "22222222-2222-4222-8222-222222222222";
const E1 = "33333333-3333-4333-8333-333333333333";

function backend() {
  const appels = [];
  const g = {
    listerClasses: async () => ok([
      { id: C4A, libelle: "4ème A" },
      { id: C4B, libelle: "4ème B" },
    ]),
    rechercherEleves: async ({ recherche }) => {
      appels.push(["rechercherEleves", recherche]);
      const tous = [
        { id: E1, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001", classeLibelle: "3ème A" },
        { id: "55555555-5555-4555-8555-555555555555", nom: "ABAKAR", prenom: "Amina", matricule: "LGR-002", classeLibelle: "6ème A" },
      ];
      const t = recherche.toLowerCase();
      return ok(tous.filter((e) => `${e.prenom} ${e.nom} ${e.matricule}`.toLowerCase().includes(t.split(" ")[0])));
    },
    consulterEleve: async ({ eleveId }) =>
      eleveId === E1 ? ok({ eleve: { id: E1, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" } }) : { ok: false, message: "Élève introuvable." },
  };
  return { g, appels, outils: { guergne: g, ctx: { actorId: "acteur" } } };
}

// --- Interprétation ----------------------------------------------------------

test("periode : les facons ordinaires de dire un trimestre", () => {
  for (const [dit, attendu] of [
    ["premier trimestre", 1], ["1er trimestre", 1], ["T1", 1], [1, 1],
    ["deuxième trimestre", 2], ["second trimestre", 2], ["T2", 2], ["2", 2],
    ["troisième trimestre", 3], ["3e trimestre", 3], ["الثالث", 3],
  ]) {
    assert.deepEqual(numeroPeriode(dit), { numero: attendu }, `« ${dit} »`);
  }
});

test("periode : rien de precise -> periode en cours, decidee par le backend", () => {
  assert.deepEqual(numeroPeriode(undefined), { numero: null });
  assert.deepEqual(numeroPeriode(""), { numero: null });
});

test("periode : une mention illisible est une erreur, jamais « en cours » en silence", () => {
  const r = numeroPeriode("le trimestre d'hiver");
  assert.ok(r.erreur, "une periode illisible ne doit pas retomber sur la periode en cours");
  assert.equal(numeroPeriode(7).erreur !== undefined, true);
});

test("etat d'un compte parent : « pas activé » n'est pas « activé »", () => {
  assert.deepEqual(etatParent("pas encore activé"), { etat: "invite" });
  assert.deepEqual(etatParent("jamais connecté"), { etat: "invite" });
  assert.deepEqual(etatParent("actif"), { etat: "actif" });
  assert.deepEqual(etatParent("inactif"), { etat: "revoque" });
  assert.deepEqual(etatParent("désactivé"), { etat: "revoque" });
  assert.deepEqual(etatParent("sans compte"), { etat: "sans_compte" });
  assert.deepEqual(etatParent("doublons"), { etat: "doublon" });
  assert.deepEqual(etatParent(undefined), { etat: null });
  assert.ok(etatParent("vip").erreur);
});

// --- Préparation : les noms deviennent des identifiants relus ---------------

test("notes.releve : « Mahamat Abakar au premier trimestre » -> eleveId + periodeNumero", async () => {
  const { outils } = backend();
  const r = await outil("notes.releve").preparer({ eleve: "Mahamat Abakar", periode: "premier trimestre" }, outils);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params, { eleveId: E1, periodeNumero: 1 });
});

test("notes.releve : sans periode, aucune periode n'est inventee", async () => {
  const { outils } = backend();
  const r = await outil("notes.releve").preparer({ eleve: "Mahamat" }, outils);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params, { eleveId: E1 });
});

test("notes.releve : un homonyme de nom de famille s'arrete sur une question", async () => {
  const { outils } = backend();
  const r = await outil("notes.releve").preparer({ eleve: "ABAKAR" }, outils);
  assert.equal(r.ok, false);
  assert.match(r.message, /Mahamat/);
  assert.match(r.message, /Amina/);
});

test("notes.releve : la periode illisible est refusee AVANT d'interroger le backend", async () => {
  const { outils, appels } = backend();
  const r = await outil("notes.releve").preparer({ eleve: "Mahamat", periode: "l'hiver" }, outils);
  assert.equal(r.ok, false);
  assert.equal(appels.length, 0);
});

test("finances.situations : « 4e B, impayés » -> classeId resolu, filtres booleens nets", async () => {
  const { outils } = backend();
  const r = await outil("finances.situations").preparer({ classe: "4e B", seulementImpayes: "true", boursier: false }, outils);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params, { classeId: C4B, seulementImpayes: true, boursier: false });
});

test("finances.situations : une classe inconnue arrete la demande", async () => {
  const { outils } = backend();
  const r = await outil("finances.situations").preparer({ classe: "Terminale Z" }, outils);
  assert.equal(r.ok, false);
});

test("parents.rechercher : « parents de 4e A qui n'ont pas activé leur compte »", async () => {
  const { outils } = backend();
  const r = await outil("parents.rechercher").preparer({ classe: "4e A", etat: "pas activé" }, outils);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params, { etat: "invite", classeId: C4A, page: 1, parPage: 25 });
});

test("pedagogie.calendrier_evaluations : type normalise, periode resolue", async () => {
  const { outils } = backend();
  const r = await outil("pedagogie.calendrier_evaluations").preparer({ periode: "T2", type: "composition" }, outils);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params, { periodeNumero: 2, type: "COMPOSITION" });
});

// --- Rendus ----------------------------------------------------------------

const RELEVE = {
  eleve: { nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" },
  classe: "3ème A",
  periode: { libelle: "Premier trimestre", numero: 1 },
  matieres: [
    { matiere: "Mathématiques", coefficient: 4, noteeAuBulletin: true, moyenne: 12.5, notes: [{ valeur: 12, bareme: 20 }, { valeur: 13, bareme: 20 }] },
    { matiere: "Dessin", coefficient: null, noteeAuBulletin: false, moyenne: 15, notes: [{ valeur: 15, bareme: 20 }] },
    { matiere: "Anglais", coefficient: 2, noteeAuBulletin: true, moyenne: null, notes: [{ valeur: null, bareme: 20, statut: "ABSENT_JUSTIFIE" }] },
  ],
  moyenneGenerale: 12.5,
  bulletin: null,
  provisoire: true,
};

test("releve : moyennes, matiere hors bulletin dite, absence justifiee montree", () => {
  const t = rendreReleve(RELEVE);
  assert.match(t, /Mathématiques : 12,5\/20 \(coef 4\)/);
  assert.match(t, /Dessin .*hors bulletin/);
  assert.match(t, /Anglais : pas de moyenne/);
  assert.match(t, /ABSENT_JUSTIFIE/);
  assert.match(t, /provisoire : 12,5\/20/);
  assert.match(t, /Aucun bulletin généré/);
});

test("releve : le bulletin publie est cite, et fait foi", () => {
  const t = rendreReleve({ ...RELEVE, bulletin: { publie: true, moyenneGenerale: 12.4, rang: 7 } });
  assert.match(t, /publié, moyenne 12,4\/20, rang 7\. C'est lui qui fait foi/);
});

test("releve : aucune note n'est pas une moyenne nulle", () => {
  const t = rendreReleve({ ...RELEVE, matieres: [], moyenneGenerale: null });
  assert.match(t, /Aucune note saisie/);
  assert.doesNotMatch(t, /0\/20/);
});

test("situations : a 200 lignes, la somme n'est pas presentee comme un total", () => {
  const ligne = { nom: "X", prenom: "Y", classe: "4ème B", totalPaye: 1000, resteDu: 500, nbEnRetard: 0 };
  const t = rendreSituations(Array.from({ length: 200 }, () => ligne), {});
  assert.match(t, /200 premières lignes seulement/);
  const court = rendreSituations([ligne, ligne], {});
  assert.match(court, /Total de cette liste : 2[\s ]000 FCFA encaissés, 1[\s ]000 FCFA restant dus/);
});

test("situations : liste vide filtree sur les impayes le dit en clair", () => {
  assert.match(rendreSituations([], { seulementImpayes: true }), /personne n'est en impayé/);
});

test("calendrier : les journees surchargees sont signalees", () => {
  const t = rendreCalendrier({
    debut: "2026-10-01", fin: "2026-12-22",
    jours: [{ date: "2026-12-10", classe: "3ème A", matiere: "Maths", titre: "Compo", type: "COMPOSITION" }],
    surcharges: [{ date: "2026-12-10", classe: "3ème A", nombre: 3, matieres: ["Maths", "SVT", "PC"] }],
  });
  assert.match(t, /Journées chargées/);
  assert.match(t, /3ème A : 3 \(Maths, SVT, PC\)/);
});

// --- Contrat avec le backend -------------------------------------------------

test("chaque outil cite une operation reellement exposee, et seulement des parametres qu'elle lit", () => {
  const ici = dirname(fileURLToPath(import.meta.url));
  const ops = readFileSync(join(ici, "..", "..", "web", "src", "server", "agent", "operations.ts"), "utf8");
  for (const o of SCOLARITE_TOOLS) {
    assert.match(ops, new RegExp(`^  ${o.action}: \\{`, "m"), `${o.name} : operation ${o.action} absente du registre`);
  }
  // Les parametres que les outils produisent apres preparation doivent etre lus par la route.
  for (const [op, champs] of [
    ["rechercherTuteurs", ["etat", "classeId", "recherche"]],
    ["releveEleve", ["eleveId", "periodeNumero"]],
    ["listerSituationsFinancieres", ["enRetard", "boursier", "seulementImpayes", "classeId"]],
  ]) {
    for (const c of champs) assert.match(ops, new RegExp(`p\\.${c}\\b`), `${op} ne lit pas ${c}`);
  }
});
