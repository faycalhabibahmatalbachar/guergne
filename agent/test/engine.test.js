import test from "node:test";
import assert from "node:assert/strict";

import { Status } from "../src/engine.js";
import { makeAgent, incoming, GuergneSim, JID_SURVEILLANT, JID_INCONNU } from "./harness.js";

const planAppel = () => ({
  tool: "assiduite.enregistrer_appel",
  params: { periodeId: "p1", dateAbsence: "2026-10-31", nbHeures: 1, absents: ["insc-1"], retards: [] },
});

test("un numéro non lié est refusé, sans aucune action métier", async () => {
  const { agent, provider, audit, guergne } = makeAgent({ interpret: async () => planAppel() });
  const r = await agent.handle(incoming({ from: JID_INCONNU, text: "absence" }));
  assert.equal(r.status, Status.REJECTED_UNKNOWN);
  assert.equal(provider.lastTextTo(JID_INCONNU), "Numéro non autorisé.");
  assert.equal(guergne.calls.length, 0);
  assert.equal(audit.last().result, "REFUSED_UNKNOWN");
});

test("un message en double n'est traité qu'une fois (idempotence)", async () => {
  const { agent, guergne } = makeAgent({ interpret: async () => planAppel() });
  const msg = incoming({ text: "absence", id: "dup-1" });
  const r1 = await agent.handle(msg);
  const r2 = await agent.handle(msg);
  assert.equal(r1.status, Status.COMPLETED);
  assert.equal(r2.status, Status.DUPLICATE);
  assert.equal(guergne.countOf("enregistrerAppel"), 1);
});

test("une écriture autorisée s'exécute et trace l'audit avant/après", async () => {
  const { agent, provider, audit, guergne } = makeAgent({ interpret: async () => planAppel() });
  const r = await agent.handle(incoming({ text: "absence de insc-1" }));
  assert.equal(r.status, Status.COMPLETED);
  assert.equal(guergne.countOf("enregistrerAppel"), 1);
  const e = audit.last();
  assert.equal(e.result, "SUCCESS");
  assert.equal(e.intent, "assiduite.enregistrer_appel");
  assert.ok(e.after, "l'état après doit être capturé");
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /OK enregistrerAppel/);
});

test("un droit manquant bloque l'opération, sans appel métier", async () => {
  // La secrétaire n'a que assiduite:lire -> pas le droit de saisir
  const { agent, guergne, audit } = makeAgent({
    interpret: async () => planAppel(),
    grants: { surveillant: new Set(["assiduite:lire"]) },
  });
  const r = await agent.handle(incoming({ text: "absence" }));
  assert.equal(r.status, Status.FAILED);
  assert.equal(r.reason, "permission");
  assert.equal(guergne.calls.length, 0);
  assert.equal(audit.last().result, "DENIED");
});

test("des paramètres invalides n'écrivent rien et demandent une correction", async () => {
  const { agent, guergne, provider } = makeAgent({
    interpret: async () => ({
      tool: "assiduite.enregistrer_appel",
      params: { periodeId: "p1", dateAbsence: "2026-10-31", nbHeures: 99, absents: ["insc-1"] },
    }),
  });
  const r = await agent.handle(incoming({ text: "absence 99h" }));
  assert.equal(r.status, Status.WAITING_INPUT);
  assert.ok(r.errors.nbHeures);
  assert.equal(guergne.calls.length, 0);
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /Précisez/);
});

test("une suppression (sensible) exige une confirmation explicite", async () => {
  const { agent, guergne } = makeAgent({
    interpret: async () => ({
      tool: "assiduite.supprimer_absence",
      params: { absenceId: "abs-1", motif: "erreur de saisie" },
    }),
  });
  const r1 = await agent.handle(incoming({ text: "supprime l'absence abs-1", id: "s1" }));
  assert.equal(r1.status, Status.WAITING_APPROVAL);
  assert.equal(guergne.countOf("supprimerAbsence"), 0, "rien ne doit être supprimé avant confirmation");

  const r2 = await agent.handle(incoming({ text: "oui", id: "s2" }));
  assert.equal(r2.status, Status.COMPLETED);
  assert.equal(guergne.countOf("supprimerAbsence"), 1);
});

test("répondre « non » annule l'opération en attente", async () => {
  const { agent, guergne, provider } = makeAgent({
    interpret: async () => ({
      tool: "assiduite.supprimer_absence",
      params: { absenceId: "abs-1", motif: "erreur de saisie" },
    }),
  });
  await agent.handle(incoming({ text: "supprime abs-1", id: "c1" }));
  const r = await agent.handle(incoming({ text: "non", id: "c2" }));
  assert.equal(r.status, Status.CANCELLED);
  assert.equal(guergne.countOf("supprimerAbsence"), 0);
  assert.equal(provider.lastTextTo(JID_SURVEILLANT), "Opération annulée.");
});

test("une demande incomprise demande une clarification", async () => {
  const { agent, guergne } = makeAgent({ interpret: async () => ({ clarify: "Quel élève et quelle classe ?" }) });
  const r = await agent.handle(incoming({ text: "euh" }));
  assert.equal(r.status, Status.WAITING_INPUT);
  assert.equal(guergne.calls.length, 0);
});

test("un vocal est transcrit avant compréhension", async () => {
  let transcribed = 0;
  const { agent, guergne } = makeAgent({
    transcribe: async () => { transcribed++; return "absence de insc-1"; },
    interpret: async (text) => {
      assert.equal(text, "absence de insc-1", "le texte transcrit doit alimenter le NLU");
      return planAppel();
    },
  });
  const r = await agent.handle(incoming({ kind: "audio", media: { bytes: "..." }, id: "v1" }));
  assert.equal(transcribed, 1);
  assert.equal(r.status, Status.COMPLETED);
  assert.equal(guergne.countOf("enregistrerAppel"), 1);
});

test("un échec backend n'est jamais présenté comme une réussite", async () => {
  const guergne = new GuergneSim({ fail: "enregistrerAppel" });
  const { agent, provider, audit } = makeAgent({ interpret: async () => planAppel(), guergne });
  const r = await agent.handle(incoming({ text: "absence" }));
  assert.equal(r.status, Status.FAILED);
  assert.equal(audit.last().result, "FAILURE");
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /Échec simulé/);
});
