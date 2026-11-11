/**
 * La jonction de deux travaux : la mémoire Neon (`main`, e61202c) et la
 * confirmation durcie (`voix-bidirectionnelle`).
 *
 * `main` rendait une confirmation reprenable après un redémarrage, mais la
 * reconstruisait depuis la mémoire SANS empreinte ni délai, et l'acceptait sur
 * une simple expression régulière. La fusion garde la reprise et refuse ce qui
 * la rendait dangereuse. Ces tests fixent les deux moitiés du contrat.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Status } from "../src/engine.js";
import { makeAgent, incoming, GuergneSim } from "./harness.js";

class MemoireMinimale {
  enabled = true;
  pending = null;
  lastTask = null;
  async prepare() {
    return { conversationId: "conv", actorId: "staff-1", history: [], pending: this.pending, summaries: [], facts: [], lastTask: this.lastTask };
  }
  async annotateInbound() {}
  async appendMessage() {}
  async saveFact() {}
  async listFacts() { return []; }
  async forgetActor() { return {}; }
  async saveLastTask(_s, t) { this.lastTask = t; }
  async saveState(_s, etat) { this.pending = { ...etat }; }
  async clearState() { this.pending = null; }
}

const SUPPRESSION = { tool: "assiduite.supprimer_absence", params: { absenceId: "abs-1", motif: "erreur de saisie" } };
const neComprendRien = async () => ({ intention: "clarifier", question: "Que souhaitez-vous faire ?" });

async function demanderPuisRedemarrer() {
  const memoire = new MemoireMinimale();
  const premier = makeAgent({ memory: memoire, interpret: async () => SUPPRESSION });
  const r1 = await premier.agent.handle(incoming({ text: "supprime l'absence abs-1", id: "m1" }));
  assert.equal(r1.status, Status.WAITING_APPROVAL);
  // Un second agent : le processus a redémarré, seule la mémoire a survécu.
  const sim = new GuergneSim();
  const second = makeAgent({ memory: memoire, guergne: sim, interpret: neComprendRien });
  return { memoire, sim, second };
}

test("l'attente persistee porte ses garanties : empreinte, expiration, utilisateur", async () => {
  const { memoire } = await demanderPuisRedemarrer();
  assert.equal(memoire.pending.intention, "approval");
  assert.match(memoire.pending.empreinte, /^[0-9a-f]{16,}$/);
  assert.ok(memoire.pending.expireA > Date.now());
  assert.equal(memoire.pending.staffId, "staff-1");
});

test("apres redemarrage, un oui net dans le delai execute une seule fois", async () => {
  const { memoire, sim, second } = await demanderPuisRedemarrer();
  const r = await second.agent.handle(incoming({ text: "oui", id: "m2" }));
  assert.equal(r.status, Status.COMPLETED, JSON.stringify(r));
  assert.equal(sim.countOf("supprimerAbsence"), 1);
  assert.equal(memoire.pending, null, "l'attente persistee doit tomber apres usage");
  const r2 = await second.agent.handle(incoming({ text: "oui", id: "m3" }));
  assert.notEqual(r2.status, Status.COMPLETED);
  assert.equal(sim.countOf("supprimerAbsence"), 1, "un second oui ne doit rien re-executer");
});

test("une attente de l'ancienne forme, sans empreinte, n'est jamais executee", async () => {
  const { memoire, sim, second } = await demanderPuisRedemarrer();
  memoire.pending = { intention: "approval", tool: SUPPRESSION.tool, params: SUPPRESSION.params, missingFields: [] };
  await second.agent.handle(incoming({ text: "oui", id: "m2" }));
  assert.equal(sim.countOf("supprimerAbsence"), 0);
});

test("des parametres alteres en memoire invalident la confirmation", async () => {
  const { memoire, sim, second } = await demanderPuisRedemarrer();
  memoire.pending = { ...memoire.pending, params: { absenceId: "abs-AUTRE", motif: "erreur de saisie" } };
  await second.agent.handle(incoming({ text: "oui", id: "m2" }));
  assert.equal(sim.countOf("supprimerAbsence"), 0);
});

test("une attente persistee expiree est dite expiree, et rien n'est execute", async () => {
  const { memoire, sim, second } = await demanderPuisRedemarrer();
  memoire.pending = { ...memoire.pending, expireA: Date.now() - 1000 };
  const r = await second.agent.handle(incoming({ text: "oui", id: "m2" }));
  assert.equal(r.status, Status.CANCELLED);
  assert.equal(sim.countOf("supprimerAbsence"), 0);
  assert.match(second.provider.lastTextTo("23566000001@c.us"), /expiré/);
});

test("un « ouais d'accord » n'est pas un oui net, meme apres redemarrage", async () => {
  const { sim, second } = await demanderPuisRedemarrer();
  await second.agent.handle(incoming({ text: "ouais d'accord vas-y", id: "m2" }));
  assert.equal(sim.countOf("supprimerAbsence"), 0);
});
