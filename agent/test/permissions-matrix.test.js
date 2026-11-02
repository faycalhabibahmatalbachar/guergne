import test from "node:test";
import assert from "node:assert/strict";

import { MATRICE, MatricePermissions } from "../src/permissions-matrix.js";

const perm = new MatricePermissions();
const staff = (role) => ({ id: "x", role });

test("la matrice reflète guergne : le SURVEILLANT saisit l'assiduité", () => {
  assert.ok(perm.allows(staff("SURVEILLANT"), "assiduite:saisir"));
  assert.ok(perm.allows(staff("SURVEILLANT"), "retard:saisir"));
});

test("constat clé : la DIRECTION ne peut PAS saisir l'assiduité (seulement lire)", () => {
  assert.ok(perm.allows(staff("DIRECTION"), "assiduite:lire"));
  assert.equal(perm.allows(staff("DIRECTION"), "assiduite:saisir"), false);
  assert.equal(perm.allows(staff("DIRECTION"), "retard:saisir"), false);
});

test("l'exclusion définitive est réservée à la DIRECTION", () => {
  assert.ok(perm.allows(staff("DIRECTION"), "eleve:exclure"));
  assert.equal(perm.allows(staff("SURVEILLANT"), "eleve:exclure"), false);
});

test("le COMPTABLE encaisse, la justification revient surveillant/secrétariat", () => {
  assert.ok(perm.allows(staff("COMPTABLE"), "finance:encaisser"));
  assert.ok(perm.allows(staff("SECRETARIAT"), "assiduite:justifier"));
  assert.equal(perm.allows(staff("COMPTABLE"), "assiduite:justifier"), false);
});

test("SUPER_ADMIN détient tout", () => {
  for (const action of ["assiduite:saisir", "eleve:exclure", "finance:encaisser", "bulletin:generer"]) {
    assert.ok(MATRICE.SUPER_ADMIN.has(action), `SUPER_ADMIN devrait avoir ${action}`);
  }
});
