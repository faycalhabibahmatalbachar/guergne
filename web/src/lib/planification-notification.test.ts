import assert from "node:assert/strict";
import test from "node:test";

import { choisirCanaux, type CapacitesContact } from "./planification-notification.ts";

const complet: CapacitesContact = {
  utilisateurId: "parent-1",
  compteActif: true,
  telephone: "+23566123456",
  accepteSms: true,
  pushDisponible: true,
};

test("PUSH_SINON_SMS choisit le push, puis le SMS, puis la boîte interne", () => {
  assert.deepEqual(choisirCanaux(complet, "PUSH_SINON_SMS"), ["PUSH"]);
  assert.deepEqual(
    choisirCanaux({ ...complet, pushDisponible: false }, "PUSH_SINON_SMS"),
    ["SMS"],
  );
  assert.deepEqual(
    choisirCanaux(
      { ...complet, pushDisponible: false, accepteSms: false },
      "PUSH_SINON_SMS",
    ),
    ["IN_APP"],
  );
  assert.deepEqual(
    choisirCanaux(
      { ...complet, utilisateurId: null, compteActif: false, pushDisponible: false, accepteSms: false },
      "PUSH_SINON_SMS",
    ),
    [],
  );
});

test("PUSH_ET_SMS peut déposer les deux canaux quand ils sont disponibles", () => {
  assert.deepEqual(choisirCanaux(complet, "PUSH_ET_SMS"), ["PUSH", "SMS"]);
  assert.deepEqual(
    choisirCanaux({ ...complet, pushDisponible: false }, "PUSH_ET_SMS"),
    ["SMS"],
  );
});

test("PUSH_SEUL ne bascule jamais vers le SMS", () => {
  assert.deepEqual(
    choisirCanaux({ ...complet, pushDisponible: false }, "PUSH_SEUL"),
    ["IN_APP"],
  );
  assert.deepEqual(
    choisirCanaux({ ...complet, utilisateurId: null, compteActif: false, pushDisponible: false }, "PUSH_SEUL"),
    [],
  );
});

test("SMS_SEUL respecte le consentement et AUCUN ne dépose rien", () => {
  assert.deepEqual(choisirCanaux(complet, "SMS_SEUL"), ["SMS"]);
  assert.deepEqual(
    choisirCanaux({ ...complet, accepteSms: false }, "SMS_SEUL"),
    ["IN_APP"],
  );
  assert.deepEqual(choisirCanaux(complet, "AUCUN"), []);
});
