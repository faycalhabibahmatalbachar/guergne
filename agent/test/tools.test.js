import test from "node:test";
import assert from "node:assert/strict";

import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { redact } from "../src/audit.js";
import { READ, WRITE, SENSITIVE } from "../src/guard.js";

const reg = new ToolRegistry(ASSIDUITE_TOOLS);
const tool = (n) => reg.get(n);

test("le registre expose les outils Assiduité avec leurs permissions réelles", () => {
  assert.equal(tool("assiduite.enregistrer_appel").permission, "assiduite:saisir");
  assert.equal(tool("assiduite.enregistrer_retard").permission, "retard:saisir");
  assert.equal(tool("assiduite.justifier_absences").permission, "assiduite:justifier");
  assert.equal(tool("assiduite.consulter_absences").permission, "assiduite:lire");
  assert.equal(tool("assiduite.supprimer_absence").sensitivity, SENSITIVE);
  assert.equal(tool("assiduite.consulter_absences").sensitivity, READ);
  assert.equal(tool("assiduite.enregistrer_appel").sensitivity, WRITE);
});

test("appel : nbHeures hors [0.5,12] est rejeté", () => {
  const v = tool("assiduite.enregistrer_appel").validate;
  assert.ok(v({ periodeId: "p", dateAbsence: "d", nbHeures: 20, absents: [] }).nbHeures);
  assert.deepEqual(v({ periodeId: "p", dateAbsence: "d", nbHeures: 2, absents: [] }), {});
});

test("retard : durée hors [0,480] est rejetée", () => {
  const v = tool("assiduite.enregistrer_retard").validate;
  assert.ok(v({ inscriptionId: "i", periodeId: "p", dateRetard: "d", dureeMinutes: 500 }).dureeMinutes);
  assert.deepEqual(v({ inscriptionId: "i", periodeId: "p", dateRetard: "d", dureeMinutes: 30 }), {});
});

test("justification : plus de 200 lignes est rejeté", () => {
  const v = tool("assiduite.justifier_absences").validate;
  const ids = Array.from({ length: 201 }, (_, i) => "a" + i);
  assert.ok(v({ absenceIds: ids, statut: "JUSTIFIEE", motif: "certificat" }).absenceIds);
});

test("justification : motif < 3 caractères rejeté quand JUSTIFIEE", () => {
  const v = tool("assiduite.justifier_absences").validate;
  assert.ok(v({ absenceIds: ["a1"], statut: "JUSTIFIEE", motif: "x" }).motif);
  assert.deepEqual(v({ absenceIds: ["a1"], statut: "JUSTIFIEE", motif: "certificat médical" }), {});
});

test("suppression : motif obligatoire (≥3)", () => {
  const v = tool("assiduite.supprimer_absence").validate;
  assert.ok(v({ absenceId: "a1", motif: "x" }).motif);
  assert.deepEqual(v({ absenceId: "a1", motif: "erreur de saisie" }), {});
});

test("redact masque les secrets dans les paramètres journalisés", () => {
  const out = redact({ eleve: "insc-1", apiKey: "sk-123", nested: { token: "t", ok: 1 } });
  assert.equal(out.eleve, "insc-1");
  assert.equal(out.apiKey, "[redacted]");
  assert.equal(out.nested.token, "[redacted]");
  assert.equal(out.nested.ok, 1);
});
