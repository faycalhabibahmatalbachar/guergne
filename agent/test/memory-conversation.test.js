import test from "node:test";
import assert from "node:assert/strict";
import { makeAgent, incoming, GuergneSim } from "./harness.js";

class MemoryFake {
  enabled = true;
  pending = null;
  lastTask = null;
  messages = [];
  facts = [];
  annotations = [];
  async prepare({ actorId, jid, text }) {
    const history = this.messages
      .filter((m) => typeof m.text === "string")
      .map((m) => ({
        role: m.direction === "outbound" ? "assistant" : "user",
        content: m.text,
      }));
    this.messages.push({ text: null, direction: "inbound", actorId, jid, pendingText: text });
    return {
      conversationId: "conv-test",
      actorId,
      history,
      pending: this.pending,
      summaries: [],
      facts: [],
      lastTask: this.lastTask,
    };
  }
  async annotateInbound({ providerMessageId, text, intention, tool, retainContent }) {
    this.annotations.push({ providerMessageId, intention, tool, retainContent });
    const last = this.messages[this.messages.length - 1];
    if (last?.direction === "inbound") {
      last.text = retainContent ? text : null;
      delete last.pendingText;
    }
  }
  async appendMessage({ text, direction, retainContent = false }) {
    this.messages.push({ text: retainContent ? text : null, direction });
  }
  async saveFact(fact) {
    this.facts = this.facts.filter((f) => f.key !== fact.key);
    this.facts.push({ ...fact });
  }
  async listFacts(actorId) {
    return this.facts.filter((f) => f.actorId === actorId);
  }
  async forgetActor(actorId) {
    const count = this.facts.filter((f) => f.actorId === actorId).length;
    this.facts = this.facts.filter((f) => f.actorId !== actorId);
    this.messages = [];
    this.pending = null;
    this.lastTask = null;
    return { summaries: 0, facts: count, conversations: 1 };
  }
  async saveLastTask(_session, task) {
    this.lastTask = {
      tool: task.tool,
      parametres: {
        classeId: task.params.classeId,
        periodeId: task.params.periodeId,
      },
    };
  }
  async saveState(_session, state) {
    this.pending = { ...state };
  }
  async clearState() {
    this.pending = null;
  }
}

const grants = { surveillant: new Set(["eleve:lire"]) };
const classId = "00000000-0000-0000-0000-000000000006";

test("une clarification conserve l'outil et reprend après redémarrage", async () => {
  const memory = new MemoryFake();
  const first = makeAgent({
    memory,
    grants,
    interpret: async () => ({
      intention: "clarifier",
      question: "De quelle classe souhaitez-vous consulter les élèves ?",
      outil: "eleves.rechercher",
      params: {},
      missingFields: ["classeId"],
    }),
  });

  const firstResult = await first.agent.handle(incoming({
    id: "memory-in-1",
    text: "Quels sont les élèves de la classe ?",
  }));
  assert.equal(firstResult.status, "WAITING_INPUT");
  assert.equal(memory.pending.tool, "eleves.rechercher");
  assert.deepEqual(memory.pending.missingFields, ["classeId"]);

  // Un second Agent simule le redémarrage du processus WhatsApp.
  const sim = new GuergneSim();
  const second = makeAgent({
    memory,
    grants,
    guergne: sim,
    interpret: async (_text, ctx) => {
      assert.equal(ctx.memory.pending.tool, "eleves.rechercher");
      assert.deepEqual(ctx.memory.pending.params, {});
      assert.equal(ctx.memory.history.some((m) => m.content.includes("Quels sont les élèves")), false);
      assert.equal(ctx.memory.history.some((m) => m.content.includes("De quelle classe")), false);
      assert.equal(memory.messages.some((m) => m.text?.includes("Quels sont les élèves")), false);
      assert.deepEqual(memory.annotations.map((a) => a.retainContent), [false]);
      return {
        intention: "outil",
        outil: "eleves.rechercher",
        params: { classeId: classId, parPage: 25 },
      };
    },
  });

  const secondResult = await second.agent.handle(incoming({ id: "memory-in-2", text: "6e" }));
  assert.equal(secondResult.status, "COMPLETED", JSON.stringify(secondResult));
  assert.equal(sim.countOf("rechercherEleves"), 1);
  assert.equal(memory.pending, null);
  assert.ok(memory.messages.some((m) => m.direction === "outbound" && m.text.includes("OK rechercherEleves")));
});


test("les préférences sont explicites, consultables et effaçables", async () => {
  const memory = new MemoryFake();
  const { agent, provider } = makeAgent({ memory });

  const saved = await agent.handle(incoming({
    id: "memory-pref-1",
    text: "Retiens que je préfère les réponses courtes.",
  }));
  assert.equal(saved.status, "COMPLETED");
  assert.equal(memory.facts.length, 1);
  assert.equal(memory.facts[0].actorId, "staff-1");
  assert.equal(memory.facts[0].key, "response_style");
  assert.equal(memory.facts[0].value, "réponses courtes");

  const listed = await agent.handle(incoming({ id: "memory-pref-2", text: "Mémoire" }));
  assert.equal(listed.status, "COMPLETED");
  assert.match(provider.lastTextTo("23566000001@c.us"), /réponses courtes/u);

  const forgotten = await agent.handle(incoming({ id: "memory-pref-3", text: "Oublie ma mémoire" }));
  assert.equal(forgotten.status, "COMPLETED");
  assert.equal(memory.facts.length, 0);
  assert.equal(memory.messages.length, 0);
  assert.match(provider.lastTextTo("23566000001@c.us"), /effacée/u);
});


test("une consultation réussie conserve son périmètre pour le message suivant", async () => {
  const memory = new MemoryFake();
  const classeId = "00000000-0000-4000-8000-000000000006";
  const periodeId = "00000000-0000-4000-8000-000000000099";
  const grantsSuivi = { surveillant: new Set(["eleve:lire", "assiduite:lire"]) };

  const first = makeAgent({
    memory,
    grants: grantsSuivi,
    interpret: async () => ({
      intention: "outil",
      outil: "eleves.rechercher",
      params: { classeId, parPage: 25 },
    }),
  });
  const firstResult = await first.agent.handle(incoming({
    id: "memory-last-task-1",
    text: "Liste les élèves de la 6e.",
  }));
  assert.equal(firstResult.status, "COMPLETED");
  assert.equal(memory.lastTask.tool, "eleves.rechercher");
  assert.equal(memory.lastTask.params.classeId, classeId);

  // Après redémarrage, la dernière consultation est chargée depuis la mémoire.
  let contexteRestaure = null;
  const second = makeAgent({
    memory,
    grants: grantsSuivi,
    interpret: async (_text, ctx) => {
      contexteRestaure = ctx.memory.lastTask;
      return { intention: "conversation", reponse: "Je poursuis votre demande." };
    },
  });
  const secondResult = await second.agent.handle(incoming({
    id: "memory-last-task-2",
    text: "Et les retards ?",
  }));
  assert.equal(secondResult.status, "COMPLETED");
  assert.equal(contexteRestaure.tool, "eleves.rechercher");
  assert.equal(contexteRestaure.params.classeId, classeId);
});
