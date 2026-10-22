import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { etatCompteParent } from "./etat-compte-parent.ts";

describe("état d'un accès parent", () => {
  it("distingue une fiche sans compte", () => {
    assert.equal(etatCompteParent({ utilisateurId: null, compteActif: null, derniereConnexion: null }), "sans_compte");
  });
  it("n'affiche jamais un compte révoqué comme actif, même s'il a déjà accédé à l'application", () => {
    assert.equal(etatCompteParent({ utilisateurId: "parent-1", compteActif: false, derniereConnexion: "2026-10-21" }), "revoque");
  });
  it("considère un compte existant mais désactivé ou incohérent comme révoqué", () => {
    assert.equal(etatCompteParent({ utilisateurId: "parent-1", compteActif: null, derniereConnexion: null }), "revoque");
  });
  it("distingue l'invitation sans connexion d'un accès utilisé", () => {
    assert.equal(etatCompteParent({ utilisateurId: "parent-1", compteActif: true, derniereConnexion: null }), "invite");
    assert.equal(etatCompteParent({ utilisateurId: "parent-1", compteActif: true, derniereConnexion: "2026-10-21" }), "actif");
  });
});
