/**
 * Une conversation n'écrit rien : elle ne peut donc pas annoncer une écriture.
 * Observé au banc : un « oui » sans objet → « la mère a été ajoutée comme
 * responsable principal ». Rien n'avait été modifié.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { annonceUneAction, normaliserPlan } from "../src/plan.js";
import { makeAgent, incoming, JID_SURVEILLANT } from "./harness.js";

test("une réponse conversationnelle qui annonce une écriture est rejetée", () => {
  for (const t of [
    "D'accord, la mère de Yara BANCIA a été ajoutée comme responsable principal.",
    "C'est fait !",
    "J'ai bien enregistré l'absence.",
    "L'absence a été supprimée.",
  ]) {
    assert.ok(annonceUneAction(t), t);
    assert.equal(normaliserPlan({ intention: "conversation", reponse: t }).rejet, "ACTION_INVENTEE", t);
  }
  assert.equal(annonceUneAction("Bonjour, que puis-je faire pour vous ?"), false);
  assert.equal(annonceUneAction("Je peux enregistrer une absence si vous me donnez l'élève et la date."), false);
});

test("un « oui » qui ne répond à rien ne va pas au modèle, et ne fait rien", async () => {
  let appele = false;
  const { agent, provider, guergne } = makeAgent({ interpret: async () => { appele = true; return { intention: "conversation", reponse: "C'est fait." }; } });
  const r = await agent.handle(incoming({ text: "oui" }));
  assert.equal(appele, false);
  assert.equal(r.orpheline, true);
  assert.equal(guergne.calls.length, 0);
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /rien n'a été fait/);
});
