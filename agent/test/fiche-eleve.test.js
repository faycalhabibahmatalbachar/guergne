/**
 * La fiche complète : ce que l'agent DIT d'un élève à partir de ce que le
 * backend lui a ouvert. Le filtrage des droits est fait côté serveur et
 * éprouvé par la recette réelle ; ici on fixe le rendu.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { FICHE_TOOLS, rendreFiche } from "../src/fiche-eleve.js";

const COMPLETE = {
  identite: {
    nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001", sexe: "M", dateNaissance: "2011-03-04", age: 15,
    lieuNaissance: "N'Djamena", statut: "INSCRIT", adresse: "Moursal", quartier: "Moursal", acteNaissanceNumero: "A-1", photoUrl: "x",
    sante: { groupeSanguin: "O+", allergies: null, observationsMedicales: null },
  },
  inscription: { anneeLibelle: "2026-2027", classeLibelle: "3ème A", serieCode: null, estRedoublant: false, estBoursier: true, dateInscription: "2026-09-20" },
  tuteurs: [
    { nom: "ABAKAR", prenom: "Ahmat", lien: "PERE", telephone: "+23566000000", estPrincipal: true, estResponsableFinancier: true, appActivee: true },
    { nom: "HAWA", prenom: "Zara", lien: "MERE", telephone: "+23599000000", autoriseRetrait: true },
  ],
  parcours: [{ anneeLibelle: "2025-2026", classeLibelle: "4ème A", active: false }],
  scolarite: {
    periodeReleve: "1er Trimestre",
    releve: [{ matiere: "Mathématiques", moyenne: 12.5, rang: 4 }],
    evolution: [{ periode: "T1", moyenne: 11.2, rang: 7, effectif: 48 }],
    assiduite: [
      { type: "absence", date: "2026-10-12", statut: "NON_JUSTIFIEE" },
      { type: "absence", date: "2026-10-05", statut: "JUSTIFIEE" },
      { type: "retard", date: "2026-10-03", statut: "NON_JUSTIFIE" },
    ],
    discipline: [],
    echeances: [
      { du: 100000, paye: 60000, exonere: 0, reste: 40000, enRetard: true },
      { du: 70000, paye: 0, exonere: 10000, reste: 60000, enRetard: false },
    ],
    paiements: [{ montant: 60000, date: "2026-09-21", numeroRecu: "R-12", annule: false }],
  },
  pieces: [{ type: "ACTE_NAISSANCE", libelle: "Acte", deposeLe: "2026-09-20" }],
  historique: { statuts: [], changementsClasse: [{ dateEffet: "2026-10-01", origine: "3ème B", destination: "3ème A" }], journal: null },
  masquees: ["journal des modifications"],
};

test("fiche complete : chaque section est presente, avec ses chiffres", () => {
  const t = rendreFiche(COMPLETE);
  assert.match(t, /Fiche de Mahamat ABAKAR — matricule LGR-001/);
  assert.match(t, /Garçon, né le 2011-03-04 \(15 ans\) à N'Djamena/);
  assert.match(t, /Santé : groupe O\+/);
  assert.match(t, /2026-2027 : 3ème A, boursier/);
  assert.match(t, /Responsables \(2\)/);
  assert.match(t, /Ahmat ABAKAR — PERE, \+23566000000 \(principal, responsable financier\), application activée/);
  assert.match(t, /Zara HAWA — MERE, .*autorisé au retrait/);
  assert.match(t, /Mathématiques : 12,5\/20, rang 4/);
  assert.match(t, /2 absence\(s\), dont 1 non justifiée\(s\) · 1 retard\(s\)/);
  assert.match(t, /Aucun incident ni sanction/);
  assert.match(t, /Facturé 170[\s ]000 FCFA · payé 60[\s ]000 FCFA · exonéré 10[\s ]000 FCFA · reste 100[\s ]000 FCFA/);
  assert.match(t, /1 échéance\(s\) en retard/);
  assert.match(t, /1 pièce\(s\) : ACTE_NAISSANCE/);
  assert.match(t, /classe 3ème B → 3ème A/);
  assert.match(t, /Non affiché faute de droit : journal des modifications\./);
});

test("une section que le backend n'a pas ouverte n'est ni inventee ni presentee comme vide", () => {
  const sansFinances = {
    ...COMPLETE,
    identite: { ...COMPLETE.identite, sante: undefined },
    scolarite: { periodeReleve: null, assiduite: [] },
    masquees: ["notes", "finances", "santé"],
  };
  const t = rendreFiche(sansFinances);
  assert.doesNotMatch(t, /Finances/);
  assert.doesNotMatch(t, /Notes/);
  assert.doesNotMatch(t, /Santé :/);
  assert.match(t, /Non affiché faute de droit : notes, finances, santé\./);
});

test("une inscription close est dite close, avec sa date et sa destination", () => {
  const t = rendreFiche({ ...COMPLETE, inscription: { ...COMPLETE.inscription, active: false, dateSortie: "2026-11-12", motifSortie: "Déménagement", etablissementDestination: "Lycée de Moundou" } });
  assert.match(t, /Inscription CLOSE le 2026-11-12 — Déménagement — vers Lycée de Moundou/);
  assert.doesNotMatch(rendreFiche({ ...COMPLETE, inscription: { ...COMPLETE.inscription, active: true } }), /CLOSE/);
});

test("un dossier incomplet est signale champ par champ", () => {
  const t = rendreFiche({ ...COMPLETE, identite: { ...COMPLETE.identite, lieuNaissance: null, photoUrl: null } });
  assert.match(t, /Dossier incomplet : lieu de naissance, photo/);
});

test("sans inscription ni responsable, la fiche le dit", () => {
  const t = rendreFiche({ identite: { nom: "X", prenom: "Y", statut: "CANDIDAT" }, inscription: null, tuteurs: [], scolarite: null, pieces: [], historique: {}, masquees: [] });
  assert.match(t, /Aucune inscription active/);
  assert.match(t, /Aucun responsable rattaché/);
  assert.match(t, /Aucune pièce déposée/);
  assert.doesNotMatch(t, /undefined|NaN/);
});

test("eleves.fiche resout le nom avant d'appeler le backend", async () => {
  const E = "33333333-3333-4333-8333-333333333333";
  const guergne = {
    rechercherEleves: async () => ({ ok: true, data: [{ id: E, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" }] }),
    consulterEleve: async () => ({ ok: true, data: { eleve: { id: E, nom: "ABAKAR", prenom: "Mahamat" } } }),
  };
  const r = await FICHE_TOOLS[0].preparer({ eleve: "Mahamat Abakar" }, { guergne, ctx: {} });
  assert.deepEqual(r, { ok: true, params: { eleveId: E } });
});
