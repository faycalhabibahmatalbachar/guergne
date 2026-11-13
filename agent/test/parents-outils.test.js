/**
 * Responsables d'un élève : ce que l'agent PRÉPARE et ce qu'il VÉRIFIE.
 * Le backend (réutilisation, unicité du principal, audit) est éprouvé par la
 * recette réelle `scripts/recette-parents-reel.mjs` sur la base de test.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PARENTS_TOOLS, choisirTuteur, lienDe } from "../src/tools-parents.js";

const outil = (n) => PARENTS_TOOLS.find((o) => o.name === n);
const E = "33333333-3333-4333-8333-333333333333";
const PERE = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nom: "ABAKAR", prenom: "Ahmat", lien: "PERE", telephone: "+23566000001", estPrincipal: true };
const MERE = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nom: "HAWA", prenom: "Zara", lien: "MERE", telephone: "+23599000002", estPrincipal: false };

function outils({ tuteurs = [PERE, MERE], annuaire = [] } = {}) {
  return {
    ctx: {},
    guergne: {
      rechercherEleves: async () => ({ ok: true, data: [{ id: E, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" }] }),
      consulterEleve: async () => ({ ok: true, data: { eleve: { id: E, nom: "ABAKAR", prenom: "Mahamat", matricule: "LGR-001" } } }),
      ficheEleve: async () => ({ ok: true, data: { identite: { nom: "ABAKAR" }, tuteurs } }),
      rechercherTuteurs: async ({ recherche }) => ({ ok: true, data: { lignes: annuaire.filter((t) => t.telephone.replace(/\D/g, "").endsWith(recherche)), total: 0 } }),
    },
  };
}

test("lienDe : les mots de tous les jours", () => {
  assert.equal(lienDe("le père"), "PERE");
  assert.equal(lienDe("maman"), "MERE");
  assert.equal(lienDe("grand-mère"), "GRAND_PARENT");
  assert.equal(lienDe("sa sœur"), "FRERE_SOEUR");
  assert.equal(lienDe("TUTEUR"), "TUTEUR");
  assert.equal(lienDe("voisin"), null);
});

test("choisirTuteur : par lien, par prenom, par fin de numero ; ambigu = question", () => {
  assert.equal(choisirTuteur([PERE, MERE], "la mère").tuteur.id, MERE.id);
  assert.equal(choisirTuteur([PERE, MERE], "Ahmat").tuteur.id, PERE.id);
  assert.equal(choisirTuteur([PERE, MERE], "99 00 00 02").tuteur.id, MERE.id);
  const deuxPeres = [PERE, { ...MERE, lien: "PERE" }];
  assert.match(choisirTuteur(deuxPeres, "le père").message, /Plusieurs responsables/);
  assert.equal(choisirTuteur([PERE], "le voisin").ok, false);
});

test("rattacher : un numero deja connu REUTILISE la fiche, meme ecrit autrement", async () => {
  const connu = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", nom: "MOUSSA", prenom: "Ali", telephone: "+235 66 11 22 33", enfants: "Fatimé MOUSSA (6ème A)" };
  const r = await outil("parents.rattacher").preparer(
    { eleve: "Mahamat", telephone: "66112233", lien: "oncle", nom: "Autre", prenom: "Nom" },
    outils({ annuaire: [connu] }),
  );
  assert.equal(r.ok, true, r.message);
  assert.equal(r.params.existantId, connu.id);
  assert.equal(r.params.nom, "MOUSSA", "le nom est celui de la fiche existante, pas celui dicte");
  assert.equal(r.params.lien, "ONCLE");
  assert.match(r.texte, /fiche EXISTANTE réutilisée : Ali MOUSSA/);
  assert.match(r.texte, /déjà responsable de : Fatimé MOUSSA/);
});

test("rattacher : numero inconnu -> nouvelle fiche, nom et prenom exiges", async () => {
  const sansNom = await outil("parents.rattacher").preparer({ eleve: "Mahamat", telephone: "66999999", lien: "mère" }, outils());
  assert.equal(sansNom.ok, false);
  const r = await outil("parents.rattacher").preparer({ eleve: "Mahamat", telephone: "66999999", lien: "mère", nom: "Hawa", prenom: "Zara", estPrincipal: true }, outils());
  assert.equal(r.ok, true, r.message);
  assert.equal(r.params.existantId, undefined);
  assert.match(r.texte, /NOUVELLE fiche/);
  assert.match(r.texte, /deviendra le responsable principal/);
});

test("rattacher : deux fiches pour un meme numero -> on ne choisit pas", async () => {
  const a = { id: "c1", nom: "A", prenom: "A", telephone: "+23566112233" };
  const b = { id: "c2", nom: "B", prenom: "B", telephone: "66112233" };
  const r = await outil("parents.rattacher").preparer({ eleve: "Mahamat", telephone: "66112233", lien: "père" }, outils({ annuaire: [a, b] }));
  assert.equal(r.ok, false);
  assert.match(r.message, /Plusieurs fiches parent/);
});

test("detacher : le dernier responsable ne se retire pas", async () => {
  const r = await outil("parents.detacher").preparer({ eleve: "Mahamat", tuteur: "le père" }, outils({ tuteurs: [PERE] }));
  assert.equal(r.ok, false);
  assert.match(r.message, /seul responsable/);
});

test("detacher : le principal retire est signale", async () => {
  const r = await outil("parents.detacher").preparer({ eleve: "Mahamat", tuteur: "le père" }, outils());
  assert.equal(r.ok, true);
  assert.deepEqual(r.params, { eleveId: E, tuteurId: PERE.id });
  assert.match(r.texte, /responsable principal : désignez-en un autre/);
});

test("responsabilites : la mere devient principale -> le pere cesse de l'etre, annonce", async () => {
  const r = await outil("parents.responsabilites").preparer({ eleve: "Mahamat", tuteur: "la mère", estPrincipal: true, estResponsableFinancier: "true" }, outils());
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.params.responsabilites, { estPrincipal: true, estResponsableFinancier: true });
  assert.match(r.texte, /Ahmat ABAKAR cesse d'être responsable principal/);
});

test("responsabilites : retirer le titre de principal sans successeur est refuse", async () => {
  const r = await outil("parents.responsabilites").preparer({ eleve: "Mahamat", tuteur: "le père", estPrincipal: false }, outils());
  assert.equal(r.ok, false);
  assert.match(r.message, /se transfère/);
});

test("verifier : un serveur qui dit ok sans avoir ecrit est demasque", async () => {
  const v = await outil("parents.responsabilites").verifier({
    params: { eleveId: E, tuteurId: MERE.id, responsabilites: { estPrincipal: true } },
    ...outils(),
  });
  assert.equal(v.ok, false);
  const deux = await outil("parents.responsabilites").verifier({
    params: { eleveId: E, tuteurId: MERE.id, responsabilites: { estPrincipal: true } },
    ...outils({ tuteurs: [PERE, { ...MERE, estPrincipal: true }] }),
  });
  assert.equal(deux.ok, false);
  assert.match(deux.raison, /2 responsables principaux/);
});

test("ces trois ecritures exigent toutes une confirmation qu'aucune politique ne leve", () => {
  for (const o of PARENTS_TOOLS) assert.equal(o.confirmationObligatoire, true, o.name);
});

test("rattacher un parent DÉJÀ rattaché en changeant son rôle devient une modification de responsabilités", async () => {
  const E = "33333333-3333-4333-8333-333333333333";
  const T = "55555555-5555-4555-8555-555555555555";
  const tuteurs = [
    { id: "66666666-6666-4666-8666-666666666666", nom: "BANCIA", prenom: "Omar", lien: "PERE", telephone: "+33199001250", estPrincipal: true },
    { id: T, nom: "BANCIA", prenom: "Mariam", lien: "MERE", telephone: "+33199001251", estPrincipal: false },
  ];
  const outils = {
    ctx: {},
    guergne: {
      rechercherEleves: async () => ({ ok: true, data: [{ id: E, nom: "BANCIA", prenom: "Yara", matricule: "M1" }] }),
      consulterEleve: async () => ({ ok: true, data: { eleve: { id: E, nom: "BANCIA", prenom: "Yara", matricule: "M1" } } }),
      rechercherTuteurs: async () => ({ ok: true, data: { lignes: [{ id: T, nom: "BANCIA", prenom: "Mariam", telephone: "+33199001251", enfants: "Yara BANCIA" }] } }),
      tuteursDeLEleve: async () => ({ ok: true, data: tuteurs }),
      ficheEleve: async () => ({ ok: true, data: { identite: { nom: "BANCIA", prenom: "Yara" }, tuteurs } }),
    },
  };
  const rattacher = PARENTS_TOOLS.find((o) => o.name === "parents.rattacher");
  const r = await rattacher.preparer({ eleve: "Yara BANCIA", telephone: "+33199001251", lien: "mère", estPrincipal: true }, outils);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.outil, "parents.responsabilites");
  const sansChangement = await rattacher.preparer({ eleve: "Yara BANCIA", telephone: "+33199001251", lien: "mère" }, outils);
  assert.equal(sansChangement.ok, false);
  assert.match(sansChangement.message, /déjà responsable/);
});
