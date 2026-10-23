import assert from "node:assert/strict";
import test from "node:test";

import { roleAutoriseAdministration } from "./acces-administration.ts";

test("refuse explicitement les rôles de parent et d'élève dans le back-office", () => {
  assert.equal(roleAutoriseAdministration("PARENT"), false);
  assert.equal(roleAutoriseAdministration("ELEVE"), false);
  assert.equal(roleAutoriseAdministration("ROLE_INCONNU"), false);
});

test("conserve l'accès au personnel habilité sans élargir ses permissions", () => {
  for (const role of [
    "SUPER_ADMIN",
    "DIRECTION",
    "CENSEUR",
    "SURVEILLANT",
    "SECRETARIAT",
    "COMPTABLE",
    "ENSEIGNANT",
  ]) {
    assert.equal(roleAutoriseAdministration(role), true, role);
  }
});
