/**
 * Recette de la description des erreurs.
 *
 * Ce module existe parce qu'un journal de production disait `erreur: "r"` et
 * rien d'autre. Le premier test est donc celui-là : une erreur minifiée doit
 * rester diagnosticable.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { decrireErreur, resumerErreur } from "../src/erreurs.js";

test("une erreur minifiee reste diagnosticable", () => {
  // Exactement le cas de production : WhatsApp Web leve une erreur dont le
  // message tient en une lettre.
  class r extends Error {}
  const e = new r("r");
  const d = decrireErreur(e);
  assert.equal(d.message, "r");
  assert.equal(d.messageSuspect, true, "un message d'une lettre doit etre signale comme tel");
  assert.equal(d.classe, "r", "la classe reelle est la seule indication d'origine");
  assert.ok(d.pile?.includes("erreurs.test"), "la pile doit dire d'ou elle vient");
  assert.match(resumerErreur(e), /r/);
});

test("une Error ordinaire donne nom, message et pile", () => {
  const d = decrireErreur(new TypeError("x is not a function"));
  assert.equal(d.nom, "TypeError");
  assert.equal(d.message, "x is not a function");
  assert.ok(d.pile);
  assert.equal(d.messageSuspect, undefined);
});

test("la chaine des causes est suivie", () => {
  const racine = new Error("socket ferme");
  const e = new Error("envoi impossible", { cause: racine });
  const d = decrireErreur(e);
  assert.equal(d.cause.message, "socket ferme");
  assert.match(resumerErreur(e), /envoi impossible <- Error: socket ferme/);
});

test("une erreur agregee ne cache plus ses causes", () => {
  const e = new AggregateError([new Error("a"), new Error("b")], "toutes ont echoue");
  const d = decrireErreur(e);
  assert.equal(d.erreurs.length, 2);
  assert.equal(d.erreurs[1].message, "b");
});

test("une chaine, un nombre, null et undefined sont decrits sans lever", () => {
  assert.equal(decrireErreur("boum").message, "boum");
  assert.equal(decrireErreur(7).message, "7");
  assert.equal(decrireErreur(null).message, "null");
  assert.equal(decrireErreur(undefined).message, "undefined");
});

test("un objet nu leve depuis une page est decrit par ses proprietes", () => {
  const d = decrireErreur({ message: "Data passed to getter must include an id property", status: 500, etape: "envoi" });
  assert.match(d.message, /must include an id property/);
  assert.equal(d.statut, 500);
  assert.equal(d.details.etape, "envoi");
});

test("un code et un statut sont conserves : ce sont eux qui orientent", () => {
  const e = Object.assign(new Error("espace insuffisant"), { code: "ENOSPC" });
  assert.equal(decrireErreur(e).code, "ENOSPC");
});

// --- Ce qui ne doit JAMAIS figurer dans un journal ----------------------

test("une propriete qui ressemble a un secret est masquee", () => {
  // Les bibliotheques HTTP transportent volontiers l'en-tete d'autorisation
  // dans les proprietes de leurs erreurs.
  const e = Object.assign(new Error("HTTP 401"), {
    authorization: "Bearer gsk_vraie_cle",
    apiKey: "sk-123",
    jetonService: "secret",
    etape: "transcription",
  });
  const d = decrireErreur(e);
  assert.equal(d.details.authorization, "[masque]");
  assert.equal(d.details.apiKey, "[masque]");
  assert.equal(d.details.jetonService, "[masque]");
  assert.equal(d.details.etape, "transcription", "le reste doit survivre");
  assert.ok(!JSON.stringify(d).includes("gsk_vraie_cle"));
});

test("les objets imbriques ne sont pas recopies : ils transportent trop", () => {
  const d = decrireErreur(Object.assign(new Error("x"), { reponse: { headers: { authorization: "Bearer z" } } }));
  assert.ok(!JSON.stringify(d).includes("Bearer z"));
});

test("la description ne leve jamais, meme sur un objet hostile", () => {
  const hostile = {
    get message() { throw new Error("piege"); },
  };
  assert.doesNotThrow(() => decrireErreur(hostile));
  assert.doesNotThrow(() => resumerErreur(hostile));
});

test("le resume reste borne : un journal ne doit pas etre noye", () => {
  const e = new Error("x".repeat(5000));
  assert.ok(resumerErreur(e).length <= 200);
  assert.ok(decrireErreur(e).message.length <= 600);
});
