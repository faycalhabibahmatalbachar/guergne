/**
 * eleves.changer_statut : ce qu'il faut pour qu'une décision ait un sens, les
 * conséquences dites avant le oui, et la relecture après.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { STATUT_TOOLS, statutDe } from "../src/tools-statut.js";

const outil = STATUT_TOOLS[0];
const E = "33333333-3333-4333-8333-333333333333";

function outils(fiche) {
  return {
    ctx: {},
    guergne: {
      rechercherEleves: async () => ({ ok: true, data: [{ id: E, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" }] }),
      consulterEleve: async () => ({ ok: true, data: { eleve: { id: E, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" } } }),
      ficheEleve: async () => ({ ok: true, data: fiche }),
    },
  };
}
const FICHE = {
  identite: { nom: "ABAKAR", prenom: "Mahamat", statut: "INSCRIT" },
  inscription: { classeLibelle: "3ème A", anneeLibelle: "2026-2027" },
  scolarite: { echeances: [{ reste: 40000 }, { reste: 0 }] },
  historique: { statuts: [] },
};

test("statutDe : les mots de la direction", () => {
  assert.equal(statutDe("transfert"), "TRANSFERE");
  assert.equal(statutDe("exclusion définitive"), "EXCLU");
  assert.equal(statutDe("suspension pour impayé"), "SUSPENDU_IMPAYE");
  assert.equal(statutDe("suspension"), "SUSPENDU_DISCIPLINE");
  assert.equal(statutDe("réintégrer"), "INSCRIT");
  assert.equal(statutDe("abandon de scolarité"), "ABANDON");
  assert.equal(statutDe("diplôme"), null, "le diplome ne passe pas par cette voie");
});

test("une exclusion sans reference de decision n'est meme pas preparee", () => {
  const e = outil.validate({ eleve: "Mahamat", statut: "exclusion définitive", motif: "violences répétées" });
  assert.ok(e.decision);
});

test("un transfert sans etablissement d'accueil est refuse", () => {
  assert.ok(outil.validate({ eleve: "Mahamat", statut: "transfert", motif: "déménagement à Moundou" }).etablissement);
});

test("un motif vague est refuse", () => {
  assert.ok(outil.validate({ eleve: "Mahamat", statut: "abandon", motif: "ras" }).motif);
});

test("exclusion : la decision entre dans le motif historise, consequences dites", async () => {
  const r = await outil.preparer(
    { eleve: "Mahamat", statut: "exclusion définitive", motif: "violences répétées", decision: "conseil de discipline du 10/11/2026" },
    outils(FICHE),
  );
  assert.equal(r.ok, true, r.message);
  assert.equal(r.params.statut, "EXCLU");
  assert.equal(r.params.motif, "violences répétées — décision : conseil de discipline du 10/11/2026");
  assert.match(r.texte, /inscription de l'année sera close/);
  assert.match(r.texte, /Décision grave et définitive/);
  assert.match(r.texte, /solde restant dû : 40[\s ]000 FCFA/);
});

test("un eleve deja parti : plus aucune decision", async () => {
  const r = await outil.preparer({ eleve: "Mahamat", statut: "abandon", motif: "plus venu depuis un mois" }, outils({ ...FICHE, identite: { ...FICHE.identite, statut: "TRANSFERE" } }));
  assert.equal(r.ok, false);
  assert.match(r.message, /déjà quitté/);
});

test("verifier : un depart dont l'inscription reste active n'est pas confirme", async () => {
  const pasClos = await outil.verifier({ params: { eleveId: E, statut: "ABANDON" }, ...outils({ ...FICHE, identite: { ...FICHE.identite, statut: "ABANDON" }, inscription: { ...FICHE.inscription, active: true } }) });
  assert.equal(pasClos.ok, false);
  // La DERNIERE inscription reste presente une fois close : c'est `active` qui tranche.
  const close = await outil.verifier({ params: { eleveId: E, statut: "ABANDON" }, ...outils({ ...FICHE, identite: { ...FICHE.identite, statut: "ABANDON" }, inscription: { ...FICHE.inscription, active: false } }) });
  assert.equal(close.ok, true, close.raison);
  const ok = await outil.verifier({
    params: { eleveId: E, statut: "TRANSFERE" },
    ...outils({ ...FICHE, identite: { ...FICHE.identite, statut: "TRANSFERE" }, inscription: null, historique: { statuts: [{ dateEffet: "2026-11-12", ancienStatut: "INSCRIT", nouveauStatut: "TRANSFERE" }] } }),
  });
  assert.equal(ok.ok, true);
  assert.match(ok.texte, /certificat-transfert/);
});

test("confirmation obligatoire", () => assert.equal(outil.confirmationObligatoire, true));
