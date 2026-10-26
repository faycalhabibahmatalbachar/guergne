import { dispatchMode, maskPhone, redactPhones } from "./communication-safety.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("dispatch fails closed with missing, malformed or partially configured environment", () => {
  for (const env of [{}, { NOTIFICATIONS_MODE: "live" }, { NOTIFICATIONS_SUSPENDUES: "FALSE" }]) {
    assert.equal(dispatchMode(env), "suspended");
  }
  assert.equal(dispatchMode({ NOTIFICATIONS_SUSPENDUES: "false" }), "simulation");
  assert.equal(dispatchMode({ NOTIFICATIONS_SUSPENDUES: "false", NOTIFICATIONS_MODE: "live" }), "live");
});
test("mask before serialization and redact legacy errors", () => {
  assert.equal(maskPhone(null), null);
  assert.equal(maskPhone("123"), "Numéro masqué");
  // Synthetic values only.
  assert.equal(maskPhone("+235 66 12 34 78"), "+235 66 •• •• 78");
  assert.ok(!redactPhones("provider refused +23566123478").includes("66123478"));
});
