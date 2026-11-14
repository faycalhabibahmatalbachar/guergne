/**
 * Isolement de la mémoire de conversation.
 *
 * Ce que ces tests fixent : le contexte d'une conversation n'atteint JAMAIS une
 * autre. Deux utilisateurs, deux numéros, un groupe, un contexte périmé, une
 * confirmation : rien ne traverse.
 *
 * Le moteur est le vrai ; seuls le modèle (un interprète écrit à la main, qui
 * note ce qu'on lui montre) et le backend (un simulateur) sont remplacés. Ce ne
 * sont donc PAS des tests d'intelligence : ceux-là sont dans `banc/`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Agent } from "../src/engine.js";
import { FakeProvider } from "../src/provider.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { AuditLog } from "../src/audit.js";
import { FakePermissionChecker } from "../src/guard.js";
import { ToolRegistry, ASSIDUITE_TOOLS } from "../src/tools.js";
import { MemoireVive } from "../src/memoire-vive.js";
import { MemoireComposee } from "../src/memoire-composee.js";
import { validerFoyer } from "../src/memory.js";
import { GuergneSim } from "./harness.js";

const A = "23566000001@c.us";
const B = "23566000002@c.us";
const A_BIS = "23566000003@c.us";
const GROUPE = "120363000000000001@g.us";
const CLASSE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLASSE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ELEVE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DROITS = new Set(["assiduite:lire", "assiduite:saisir", "eleve:lire"]);

function monter({ horloge = () => Date.now(), memory = null } = {}) {
  const provider = new FakeProvider();
  const guergne = new GuergneSim();
  // Le simulateur ne connaît que les actions d'origine.
  guergne.listerRetards = (p, c) => guergne._run("listerRetards", p, c);
  const vus = [];
  let n = 0;
  const agent = new Agent({
    provider,
    identity: new IdentityStore([
      { jid: A, id: "acteur-a", nom: "A", role: "surveillant" },
      { jid: B, id: "acteur-b", nom: "B", role: "surveillant" },
      { jid: A_BIS, id: "acteur-a", nom: "A (second numéro)", role: "surveillant" },
    ]),
    idempotency: new IdempotencyStore(),
    audit: new AuditLog(),
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker({ surveillant: DROITS }),
    guergne,
    memory: memory ?? new MemoireVive({ maintenant: horloge }),
    // L'interprète note CE QUE LE MOTEUR LUI MONTRE de la mémoire, puis exécute
    // le plan dicté par le test.
    interpret: async (texte, ctx) => {
      vus.push({ texte, acteur: ctx.staff.id, memoire: JSON.parse(JSON.stringify(ctx.memory)) });
      return plans.shift() ?? { intention: "conversation", reponse: "…" };
    },
  });
  const plans = [];
  const dire = (from, texte, plan) => {
    if (plan) plans.push(plan);
    return agent.handle({ id: "m" + n++, from, body: texte });
  };
  return { agent, provider, guergne, vus, dire };
}

const absences = (classeId) => ({ intention: "outil", outil: "assiduite.consulter_absences", params: { classeId } });

test("deux utilisateurs : le fil de l'un n'est jamais montré à l'autre", async () => {
  const { dire, vus } = monter();
  await dire(A, "absences de la classe A", absences(CLASSE_A));
  await dire(B, "bonjour");
  const pourB = vus.at(-1);
  assert.equal(pourB.acteur, "acteur-b");
  assert.equal(pourB.memoire.lastTask, null, "la dernière consultation de A a fui vers B");
  assert.equal(pourB.memoire.foyer, null);
  assert.deepEqual(pourB.memoire.history, []);

  await dire(A, "et ensuite ?");
  const pourA = vus.at(-1);
  assert.equal(pourA.memoire.lastTask.tool, "assiduite.consulter_absences");
  assert.equal(pourA.memoire.foyer.classeId, CLASSE_A);
});

test("deux conversations entrelacées gardent chacune leur classe", async () => {
  const { dire, vus } = monter();
  await Promise.all([dire(A, "absences classe A", absences(CLASSE_A)), dire(B, "absences classe B", absences(CLASSE_B))]);
  await dire(A, "suite");
  const a = vus.at(-1).memoire.foyer.classeId;
  await dire(B, "suite");
  const b = vus.at(-1).memoire.foyer.classeId;
  // Les plans sont servis dans l'ordre d'arrivée : ce qui compte est que chaque
  // conversation retrouve SA classe, et pas celle de l'autre.
  assert.notEqual(a, b);
  assert.deepEqual(new Set([a, b]), new Set([CLASSE_A, CLASSE_B]));
});

test("le même acteur sur deux numéros a deux fils distincts", async () => {
  const { dire, vus } = monter();
  await dire(A, "absences classe A", absences(CLASSE_A));
  await dire(A_BIS, "bonjour");
  assert.equal(vus.at(-1).acteur, "acteur-a");
  assert.equal(vus.at(-1).memoire.lastTask, null, "le fil a suivi l'acteur d'un numéro à l'autre");
});

test("la confirmation de l'un ne peut pas être donnée par l'autre", async () => {
  const { dire, guergne, provider } = monter();
  const r = await dire(A, "supprime l'absence", {
    intention: "outil",
    outil: "assiduite.supprimer_absence",
    params: { absenceId: "abs-1", motif: "saisie en double" },
  });
  assert.equal(r.status, "WAITING_APPROVAL");
  await dire(B, "oui");
  assert.equal(guergne.countOf("supprimerAbsence"), 0, "B a confirmé l'opération de A");
  const rA = await dire(A, "oui");
  assert.equal(rA.status, "COMPLETED");
  assert.equal(guergne.countOf("supprimerAbsence"), 1);
  assert.ok(provider.lastTextTo(A));
});

test("un « oui » rejoué ne confirme pas deux fois", async () => {
  const { dire, guergne } = monter();
  await dire(A, "supprime", { intention: "outil", outil: "assiduite.supprimer_absence", params: { absenceId: "abs-1", motif: "saisie en double" } });
  await dire(A, "oui");
  await dire(A, "oui");
  assert.equal(guergne.countOf("supprimerAbsence"), 1);
});

test("un contexte resté muet plus d'une demi-heure n'est plus servi", async () => {
  let t = 1_000_000;
  const { dire, vus } = monter({ horloge: () => t });
  await dire(A, "absences classe A", absences(CLASSE_A));
  t += 10 * 60 * 1000;
  await dire(A, "suite");
  assert.equal(vus.at(-1).memoire.foyer.classeId, CLASSE_A);
  t += 31 * 60 * 1000;
  await dire(A, "et les retards ?");
  assert.equal(vus.at(-1).memoire.lastTask, null, "un contexte périmé a été servi");
  assert.equal(vus.at(-1).memoire.foyer, null);
});

test("« nouveau sujet » ferme le fil, y compris une confirmation en attente", async () => {
  const { dire, vus, guergne } = monter();
  await dire(A, "absences classe A", absences(CLASSE_A));
  await dire(A, "supprime", { intention: "outil", outil: "assiduite.supprimer_absence", params: { absenceId: "abs-1", motif: "saisie en double" } });
  const r = await dire(A, "Nouveau sujet");
  assert.equal(r.memory, "fil_reinitialise");
  const r2 = await dire(A, "oui");
  assert.equal(guergne.countOf("supprimerAbsence"), 0, "la confirmation a survécu à « nouveau sujet »");
  assert.equal(r2.orpheline, true, "le « oui » devait être dit sans objet");
  await dire(A, "suite");
  assert.equal(vus.at(-1).memoire.lastTask, null);
  assert.equal(vus.at(-1).memoire.foyer, null);
});

test("un groupe ne reçoit aucun message, et n'ouvre aucune mémoire", async () => {
  const { agent, provider, vus } = monter();
  const r = await agent.handle({ id: "g1", from: GROUPE, author: A, body: "absences de la 6e A" });
  assert.equal(r.status, "REJECTED_UNKNOWN");
  assert.equal(r.raison, "GROUP_NOT_SUPPORTED");
  assert.equal(provider.sent.length, 0, "l'agent a écrit dans un groupe");
  assert.equal(vus.length, 0, "le message d'un groupe a atteint le modèle");
});

test("le fil montré au modèle ne porte que des références, jamais le contenu d'une consultation", async () => {
  const { dire, vus, guergne } = monter();
  guergne.listerAbsences = async () => ({
    ok: true,
    data: { lignes: [{ id: "x", eleveId: ELEVE, nom: "SECRET", prenom: "Nomdeleleve", classe: "6A", dateAbsence: "2026-03-01", nbHeures: 2, statut: "NON_JUSTIFIEE" }], total: 1 },
  });
  await dire(A, "absences classe A", absences(CLASSE_A));
  await dire(A, "suite");
  const m = JSON.stringify(vus.at(-1).memoire);
  assert.doesNotMatch(m, /SECRET|Nomdeleleve/, "un nom d'élève lu au backend est resté dans le fil");
  assert.deepEqual(vus.at(-1).memoire.foyer.eleveIds, [ELEVE]);
  assert.equal(vus.at(-1).memoire.foyer.eleveId, ELEVE);
});

test("le foyer durable n'accepte que des identifiants", () => {
  const f = validerFoyer({
    classeId: CLASSE_A,
    eleveId: "Mahamat ABAKAR",
    eleveIds: [ELEVE, "pas-un-uuid", { nom: "x" }],
    nom: "ABAKAR",
    note: 12.5,
    outil: "eleves.fiche",
  });
  assert.deepEqual(f, { classeId: CLASSE_A, eleveIds: [ELEVE], eleveIdsTronques: false, outil: "eleves.fiche" });
  assert.equal(validerFoyer({ nom: "ABAKAR" }), null);
});

// --- Mémoire composée : reprise après redémarrage --------------------------

/** Étage durable de substitution : même contrat que la mémoire Neon, en mémoire. */
class DurableDeTest {
  constructor() {
    this.lignes = new Map();
  }
  _c(actorId, jid) {
    const cle = actorId + "|" + jid;
    if (!this.lignes.has(cle)) this.lignes.set(cle, { pending: null, lastTask: null, foyer: null });
    return [cle, this.lignes.get(cle)];
  }
  async ping() {}
  async prepare({ actorId, jid }) {
    const [cle, l] = this._c(actorId, jid);
    return { conversationId: cle, actorId, history: [], summaries: [], facts: [], pending: l.pending, lastTask: l.lastTask, foyer: l.foyer };
  }
  async annotateInbound() {}
  async appendMessage() {}
  async saveLastTask(s, tache) { this.lignes.get(s.conversationId).lastTask = tache; }
  async saveFocus(s, f) { const l = this.lignes.get(s.conversationId); l.foyer = validerFoyer({ ...(l.foyer ?? {}), ...f }); }
  async saveState(s, e) { this.lignes.get(s.conversationId).pending = JSON.parse(JSON.stringify(e)); }
  async clearState(s) { this.lignes.get(s.conversationId).pending = null; }
  async resetFil(s) { this.lignes.set(s.conversationId, { pending: null, lastTask: null, foyer: null }); }
}

test("après un redémarrage, le fil et la confirmation reprennent depuis l'étage durable", async () => {
  const durable = new DurableDeTest();
  const avant = monter({ memory: new MemoireComposee({ vive: new MemoireVive(), durable }) });
  await avant.dire(A, "absences classe A", absences(CLASSE_A));
  const r = await avant.dire(A, "supprime", { intention: "outil", outil: "assiduite.supprimer_absence", params: { absenceId: "abs-1", motif: "saisie en double" } });
  assert.equal(r.status, "WAITING_APPROVAL");

  // REDÉMARRAGE : un moteur neuf, un étage vif vide, le même étage durable.
  const apres = monter({ memory: new MemoireComposee({ vive: new MemoireVive(), durable }) });
  const r2 = await apres.dire(A, "oui");
  assert.equal(r2.status, "COMPLETED", JSON.stringify(r2));
  assert.equal(apres.guergne.countOf("supprimerAbsence"), 1);
  assert.deepEqual(apres.guergne.calls.at(-1).params, { absenceId: "abs-1", motif: "saisie en double" });

  await apres.dire(A, "suite");
  assert.equal(apres.vus.at(-1).memoire.foyer.classeId, CLASSE_A, "le foyer n'a pas survécu au redémarrage");

  // Et l'autre utilisateur, après le redémarrage, ne voit toujours rien.
  await apres.dire(B, "bonjour");
  assert.equal(apres.vus.at(-1).memoire.foyer, null);
  assert.equal(apres.vus.at(-1).memoire.lastTask, null);
});

test("une confirmation persistée ne se rejoue pas pour un autre acteur après redémarrage", async () => {
  const durable = new DurableDeTest();
  const avant = monter({ memory: new MemoireComposee({ vive: new MemoireVive(), durable }) });
  await avant.dire(A, "supprime", { intention: "outil", outil: "assiduite.supprimer_absence", params: { absenceId: "abs-1", motif: "saisie en double" } });
  const apres = monter({ memory: new MemoireComposee({ vive: new MemoireVive(), durable }) });
  await apres.dire(B, "oui");
  assert.equal(apres.guergne.countOf("supprimerAbsence"), 0);
});


test("une écriture abandonnée par une autre question n'est pas reproposée telle quelle", async () => {
  // Le modèle relit l'historique et repropose l'archivage : observé au banc (ec-14).
  const { dire, guergne, provider, vus } = monter();
  const suppression = { intention: "outil", outil: "assiduite.supprimer_absence", params: { absenceId: "abs-1", motif: "saisie en double" } };
  const r1 = await dire(A, "supprime l'absence", suppression);
  assert.equal(r1.status, "WAITING_APPROVAL");
  const r2 = await dire(A, "combien d'absences en 6e A ?", suppression);
  assert.equal(r2.status, "CANCELLED", JSON.stringify(r2));
  assert.equal(vus.at(-1).memoire.abandonnee, "assiduite.supprimer_absence", "le modèle doit savoir que l'opération est abandonnée");
  assert.match(provider.lastTextTo(A), /abandonnée : rien n'a été fait/);
  await dire(A, "oui");
  assert.equal(guergne.countOf("supprimerAbsence"), 0, "le « oui » tardif ne doit rien exécuter");
});
