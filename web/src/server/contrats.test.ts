/**
 * Recette des contrats partagés.
 *
 * Ces tests portent sur la seule chose qui a déjà menti en production : la
 * différence entre le nombre de lignes rendues et le nombre réel.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { LIMITE_DEFAUT, LIMITE_PLAFOND, bornerLimite, echoue, enPage, reussi } from "./contrats.ts";

test("un succes porte ses donnees", () => {
  const r = reussi({ id: "abc" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.donnees, { id: "abc" });
});

test("un echec porte TOUJOURS un message", () => {
  // Un echec muet oblige l'appelant a inventer une explication.
  const r = echoue("Droits insuffisants.", { classeId: "inconnue" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.message, "Droits insuffisants.");
    assert.deepEqual(r.erreurs, { classeId: "inconnue" });
  }
});

// --- La troncature, qui est le defaut d'origine -----------------------------

test("100 lignes sur 211 : la page se declare TRONQUEE", () => {
  // Le cas reel : l'agent annoncait « 100 resultats » pour 211 absences.
  const p = enPage(new Array(100).fill(0), 211, 100);
  assert.equal(p.total, 211);
  assert.equal(p.tronque, true);
});

test("100 lignes pour exactement 100 resultats : PAS tronquee", () => {
  // Confondre ce cas avec le precedent est precisement l'erreur a eviter :
  // `lignes.length === limite` ne prouve pas la troncature.
  const p = enPage(new Array(100).fill(0), 100, 100);
  assert.equal(p.tronque, false);
});

test("une page vide n'est pas tronquee", () => {
  const p = enPage([], 0, 100);
  assert.equal(p.tronque, false);
  assert.equal(p.total, 0);
});

// --- Le plafond -------------------------------------------------------------

test("une limite demesuree est ramenee au plafond", () => {
  // Sans plafond, `limite=10000000` est une attaque par epuisement — et le
  // modele d'IA qui compose la requete n'a aucune raison de se retenir.
  assert.equal(bornerLimite(10_000_000), LIMITE_PLAFOND);
});

test("une limite absente, nulle, negative ou absurde retombe sur le defaut", () => {
  for (const v of [undefined, null, 0, -5, "beaucoup", Number.NaN, Infinity, {}]) {
    assert.equal(bornerLimite(v), LIMITE_DEFAUT, `valeur ${JSON.stringify(v)}`);
  }
});

test("une limite raisonnable est respectee, et tronquee a l'entier", () => {
  assert.equal(bornerLimite(42), 42);
  assert.equal(bornerLimite(42.9), 42);
});

test("un plafond plus bas peut etre impose par l'appelant", () => {
  assert.equal(bornerLimite(400, 50), 50);
});
