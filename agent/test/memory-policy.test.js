import test from "node:test";
import assert from "node:assert/strict";
import { analyserCommandeMemoire, estTexteGeneralMemorisable } from "../src/memory-policy.js";

test("les préférences explicitement autorisées sont reconnues", () => {
  assert.deepEqual(analyserCommandeMemoire("Retiens que je préfère les réponses courtes."), {
    type: "remember", category: "preference", key: "response_style", value: "réponses courtes",
  });
  assert.deepEqual(analyserCommandeMemoire("Retiens que je préfère le français."), {
    type: "remember", category: "preference", key: "language", value: "français",
  });
  assert.deepEqual(analyserCommandeMemoire("Retiens que je préfère les rapports au format PDF."), {
    type: "remember", category: "preference", key: "report_format", value: "PDF",
  });
});

test("les commandes de consultation et d'effacement sont reconnues", () => {
  assert.deepEqual(analyserCommandeMemoire("Mémoire"), { type: "show" });
  assert.deepEqual(analyserCommandeMemoire("Qu'as-tu retenu de moi ?"), { type: "show" });
  assert.deepEqual(analyserCommandeMemoire("Oublie ma mémoire"), { type: "forget" });
});

test("une demande de mémorisation hors liste blanche est refusée", () => {
  assert.deepEqual(
    analyserCommandeMemoire("Retiens que l'élève Ahmed a été absent cinq jours."),
    { type: "unsupported_remember" },
  );
  assert.equal(analyserCommandeMemoire("Bonjour"), null);
});

test("le filtre de contenu refuse les informations scolaires et identifiantes", () => {
  assert.equal(estTexteGeneralMemorisable("Bonjour, comment vas-tu ?"), true);
  assert.equal(estTexteGeneralMemorisable("Liste les élèves de la classe de 6e."), false);
  assert.equal(estTexteGeneralMemorisable("Le numéro est 23566000001."), false);
  assert.equal(estTexteGeneralMemorisable("Contact : faycal@example.com"), false);
});
