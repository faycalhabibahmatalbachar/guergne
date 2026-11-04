import test from "node:test";
import assert from "node:assert/strict";
import { analyserCommandeMemoire, completerParametresContexte, estTexteGeneralMemorisable } from "../src/memory-policy.js";

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


test("une demande de suivi hérite de la classe précédente après une nouvelle consultation", () => {
  const lastTask = {
    tool: "eleves.rechercher",
    parametres: {
      classeId: "00000000-0000-4000-8000-000000000006",
      periodeId: "00000000-0000-4000-8000-000000000099",
    },
  };
  const suite = completerParametresContexte({
    texte: "Et les retards ?",
    dernierTravail: lastTask,
    outilLecture: true,
    parametres: {},
  });
  assert.deepEqual(suite.parametres, {
    classeId: lastTask.parametres.classeId,
  });
  assert.deepEqual(suite.champsHerites, ["classeId"]);
});

test("la référence à la même classe reprend le périmètre et une autre classe le remplace", () => {
  const lastTask = {
    tool: "assiduite.consulter_absences",
    parametres: {
      classeId: "00000000-0000-4000-8000-000000000006",
      periodeId: "00000000-0000-4000-8000-000000000099",
    },
  };
  const meme = completerParametresContexte({
    texte: "Consulte les retards pour la même classe",
    dernierTravail: lastTask,
    outilLecture: true,
    parametres: {},
  });
  assert.equal(meme.parametres.classeId, lastTask.parametres.classeId);

  const nouvelle = completerParametresContexte({
    texte: "Et les retards de la 5e A ?",
    dernierTravail: lastTask,
    outilLecture: true,
    parametres: {},
  });
  assert.equal(nouvelle.parametres.classeId, undefined);
});

test("le contexte précédent n'est jamais hérité pour une écriture ou une demande indépendante", () => {
  const lastTask = {
    tool: "eleves.rechercher",
    parametres: { classeId: "00000000-0000-4000-8000-000000000006" },
  };
  assert.deepEqual(completerParametresContexte({
    texte: "Supprime cette absence",
    dernierTravail: lastTask,
    outilLecture: false,
    parametres: {},
  }).parametres, {});
  assert.deepEqual(completerParametresContexte({
    texte: "Bonjour, comment allez-vous ?",
    dernierTravail: lastTask,
    outilLecture: true,
    parametres: {},
  }).parametres, {});
});
