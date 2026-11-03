import test from "node:test";
import assert from "node:assert/strict";
import { makeAgent, incoming, GuergneSim } from "./harness.js";

class MemoryFake {
  enabled = true;
  pending = null;
  messages = [];
  async prepare({ actorId, jid, text }) {
    const history = this.messages.map((m) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.text,
    }));
    this.messages.push({ text, direction: "inbound", actorId, jid });
    return {
      conversationId: "conv-test",
      actorId,
      history,
      pending: this.pending,
      summaries: [],
      facts: [],
    };
  }
  async appendMessage({ text, direction }) {
    this.messages.push({ text, direction });
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
      assert.ok(ctx.memory.history.some((m) => m.content.includes("Quels sont les élèves")));
      assert.ok(ctx.memory.history.some((m) => m.content.includes("De quelle classe")));
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
