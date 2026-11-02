import test from "node:test";
import assert from "node:assert/strict";

import {
  canoniserClasse,
  normaliser,
  proximite,
  questionAmbiguite,
  resoudreClasse,
  resoudreEleve,
} from "../src/resolveur.js";

const CLASSES = [
  { id: "c1", libelle: "3ème A" },
  { id: "c2", libelle: "3ème B" },
  { id: "c3", libelle: "6ème A" },
  { id: "c4", libelle: "Terminale D" },
];

const ELEVES = [
  { id: "e1", nom: "ADAM", prenom: "Mahamat", matricule: "LGR-2025-1001" },
  { id: "e2", nom: "HASSAN", prenom: "Fatimé", matricule: "LGR-2025-1002" },
  { id: "e3", nom: "ADAM", prenom: "Mahamat", matricule: "LGR-2025-1003" },
  { id: "e4", nom: "DJONDANG", prenom: "Abakar", matricule: "LGR-2025-1004" },
];

test("normalisation : accents, casse et ponctuation", () => {
  assert.equal(normaliser("Fatimé  HASSAN"), "fatime hassan");
  assert.equal(normaliser("3ème-A"), "3eme a");
});

test("le défaut STT réel est corrigé : « troisième à » = « 3ème A »", () => {
  assert.equal(canoniserClasse("troisième à"), canoniserClasse("3ème A"));
  const r = resoudreClasse(CLASSES, "troisième à");
  assert.equal(r.statut, "unique");
  assert.equal(r.classe.id, "c1");
});

test("variantes d'écriture d'une classe", () => {
  for (const forme of ["3e A", "3ème A", "3EME a", "troisieme a"]) {
    const r = resoudreClasse(CLASSES, forme);
    assert.equal(r.statut, "unique", `échec sur « ${forme} »`);
    assert.equal(r.classe.id, "c1");
  }
});

test("une classe inconnue n'est pas inventée", () => {
  assert.equal(resoudreClasse(CLASSES, "quatrième Z").statut, "aucun");
});

test("le défaut STT réel est corrigé : « Mahama » retrouve « Mahamat »", () => {
  // Un seul Mahamat dans cette classe-ci.
  const r = resoudreEleve([ELEVES[0], ELEVES[1], ELEVES[3]], "Mahama Adam");
  assert.equal(r.statut, "unique");
  assert.equal(r.eleve.id, "e1");
});

test("deux homonymes : l'agent déclare l'ambiguïté au lieu de choisir", () => {
  const r = resoudreEleve(ELEVES, "Mahamat Adam");
  assert.equal(r.statut, "ambigu");
  assert.equal(r.candidats.length, 2);
});

test("un matricule cité lève l'ambiguïté", () => {
  const r = resoudreEleve(ELEVES, "LGR-2025-1003");
  assert.equal(r.statut, "unique");
  assert.equal(r.eleve.id, "e3");
});

test("un prénom seul suffit quand il est distinctif", () => {
  const r = resoudreEleve(ELEVES, "Fatimé");
  assert.equal(r.statut, "unique");
  assert.equal(r.eleve.id, "e2");
});

test("un nom absent ne renvoie jamais un élève au hasard", () => {
  assert.equal(resoudreEleve(ELEVES, "Zacharie Nangbatna").statut, "aucun");
});

test("la question de désambiguïsation est un menu numéroté", () => {
  const q = questionAmbiguite(resoudreEleve(ELEVES, "Mahamat Adam").candidats);
  assert.match(q, /1\. Mahamat ADAM \(LGR-2025-100[13]\)/);
  assert.match(q, /2\. Mahamat ADAM/);
});

test("la proximité est bornée et symétrique dans son usage", () => {
  assert.equal(proximite("adam", "adam"), 1);
  assert.ok(proximite("mahama", "mahamat") > 0.8);
  assert.ok(proximite("adam", "djondang") < 0.4);
});
