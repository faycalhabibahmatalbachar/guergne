import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paireCanonique, schemaExamenDoublon } from "./examen-doublon.ts";

const a = "4a7d9793-8c9e-42b0-817a-1538e4da1051";
const b = "e27b35af-13a4-4ac7-af9f-8d1d0e53d79a";
const valide = {
  tuteurId: a, autreTuteurId: b,
  decision: "DISTINCTS", motif: "Deux pièces d'identité indépendantes vérifiées.",
  justificatifsVerifies: true,
};
describe("Examen prudent des doublons familiaux", () => {
  it("interdit de comparer une fiche avec elle-même", () => {
    assert.equal(schemaExamenDoublon.safeParse({ ...valide, autreTuteurId: a }).success, false);
  });
  it("exige une confirmation documentaire et un motif", () => {
    assert.equal(schemaExamenDoublon.safeParse({ ...valide, justificatifsVerifies: false }).success, false);
    assert.equal(schemaExamenDoublon.safeParse({ ...valide, motif: "OK" }).success, false);
  });
  it("ne permet pas de supprimer ou fusionner des fiches", () => {
    assert.equal(schemaExamenDoublon.safeParse({ ...valide, decision: "FUSIONNER" }).success, false);
    assert.equal(schemaExamenDoublon.safeParse({ ...valide, decision: "MEME_PERSONNE_A_VERIFIER" }).success, true);
  });
  it("ordonne les identifiants pour retrouver le même audit depuis les deux dossiers", () => {
    assert.deepEqual(paireCanonique(a, b), paireCanonique(b, a));
  });
});
