/**
 * Recette de la confirmation des écritures.
 *
 * LES TROIS FAILLES QUE CES TESTS EMPÊCHENT DE REVENIR
 * -----------------------------------------------------
 * L'ancien moteur exécutait l'écriture en attente au premier message qui
 * COMMENÇAIT par « oui », « ok » ou « valide », sans délai, et sans effacer
 * l'attente quand l'utilisateur passait à autre chose :
 *   1. un « oui » du lendemain exécutait l'écriture de la veille ;
 *   2. « oui, merci » après une autre question exécutait l'écriture oubliée ;
 *   3. « oui mais en 5e B » exécutait l'inscription en 6e A.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { creerAttente, empreinteOperation, estConfirmation, estRefus, evaluerReponse } from "../src/confirmation.js";

const OUTIL = { name: "eleves.inscrire" };
const attente = (surcharges = {}) =>
  creerAttente({ tool: OUTIL, params: { classeId: "c-6a", nom: "AHMAT" }, runId: "r1", staffId: "u1", maintenant: 1_000, dureeMs: 60_000, ...surcharges });

test("un oui NET confirme, en francais comme en arabe", () => {
  for (const t of ["oui", "Oui.", "OUI !", "oui merci", "je confirme", "Confirmé", "d'accord", "ok", "نعم", "أؤكد"]) {
    assert.equal(estConfirmation(t), true, t);
  }
});

test("un oui assorti d'une correction n'est PAS une confirmation", () => {
  // Faille 3 : l'ancien prefixe acceptait ces phrases et executait les
  // parametres D'ORIGINE, en ignorant la correction.
  for (const t of [
    "oui mais en 5e B",
    "oui, mais change la classe",
    "ok sauf le telephone",
    "oui pour Fatima",
    "valide la 6e B plutot",
    "oui et inscris aussi son frere",
  ]) {
    assert.equal(estConfirmation(t), false, t);
  }
});

test("un non net annule ; un non conditionnel n'annule pas a l'aveugle", () => {
  for (const t of ["non", "Non merci", "annule", "stop", "لا"]) assert.equal(estRefus(t), true, t);
  assert.equal(estRefus("non, en 5e B"), false);
});

test("la confirmation exacte, du bon utilisateur, dans le delai, confirme", () => {
  assert.equal(evaluerReponse(attente(), { texte: "oui", staffId: "u1", maintenant: 2_000 }), "confirmer");
});

test("passe le delai, un oui ne vaut plus rien", () => {
  // Faille 1.
  assert.equal(evaluerReponse(attente(), { texte: "oui", staffId: "u1", maintenant: 1_000 + 60_001 }), "expiree");
});

test("un autre utilisateur ne peut pas confirmer", () => {
  assert.equal(evaluerReponse(attente(), { texte: "oui", staffId: "u2", maintenant: 2_000 }), "autre_utilisateur");
});

test("toute autre phrase abandonne l'attente", () => {
  // Faille 2 : le message est traite comme une nouvelle demande, et
  // l'attente ne survit pas pour etre ressuscitee par un « oui » ulterieur.
  assert.equal(evaluerReponse(attente(), { texte: "combien d'absences en 6e A ?", staffId: "u1", maintenant: 2_000 }), "abandonnee");
  assert.equal(evaluerReponse(attente(), { texte: "oui mais en 5e B", staffId: "u1", maintenant: 2_000 }), "abandonnee");
});

test("les parametres confirmes sont figes : impossible de les alterer apres le recapitulatif", () => {
  const a = attente();
  assert.throws(() => {
    "use strict";
    a.params.classeId = "c-5b";
  }, TypeError);
  assert.equal(a.params.classeId, "c-6a");
});

test("une attente dont l'empreinte ne correspond plus est invalide", () => {
  // Une attente fabriquee a la main, avec des parametres differents de ceux
  // qui ont ete resumes, ne peut pas etre confirmee.
  const a = attente();
  const falsifiee = { ...a, params: { classeId: "c-5b", nom: "AHMAT" } };
  assert.equal(evaluerReponse(falsifiee, { texte: "oui", staffId: "u1", maintenant: 2_000 }), "abandonnee");
});

test("l'empreinte couvre l'operation ET ses parametres", () => {
  const p = { classeId: "c-6a" };
  assert.notEqual(empreinteOperation("eleves.inscrire", p), empreinteOperation("eleves.archiver", p));
  assert.notEqual(empreinteOperation("eleves.inscrire", p), empreinteOperation("eleves.inscrire", { classeId: "c-5b" }));
});
