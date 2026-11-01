/**
 * Recette de la résilience du parcours d'un message.
 *
 * Le défaut corrigé ici n'était ni une erreur ni un refus : c'était le
 * SILENCE. Une promesse qui ne se résout jamais — la résolution d'un
 * identifiant LID à travers Puppeteer — suspendait le traitement sans rien
 * écrire. Le processus paraissait sain, WhatsApp était `ready`, et
 * l'utilisateur n'avait rien.
 *
 * Ces tests verrouillent une règle : **un message obtient toujours une
 * réponse**, même quand une dépendance externe est en panne.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditLog } from "../src/audit.js";
import { DelaiDepasse, avecDelai } from "../src/delai.js";
import { Agent, Status } from "../src/engine.js";
import { FakePermissionChecker } from "../src/guard.js";
import { IdentityStore } from "../src/identity.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { DedupPersistant } from "../src/persistance.js";
import { FakeProvider } from "../src/provider.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";
import { GuergneSim } from "./harness.js";

const NUM = "23560000001";
const JID = `${NUM}@c.us`;

function monter({ interpret, guergne, idempotency, provider: fourni } = {}) {
  const provider = fourni ?? new FakeProvider();
  const audit = new AuditLog();
  const etapes = [];
  const agent = new Agent({
    provider,
    identity: new IdentityStore([{ jid: JID, id: "staff-1", nom: "Awa", role: "surveillant" }]),
    idempotency: idempotency ?? new IdempotencyStore(),
    audit,
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker({ surveillant: new Set(["assiduite:lire"]) }),
    guergne: guergne ?? new GuergneSim(),
    interpret: interpret ?? (async () => ({ tool: "assiduite.consulter_absences", params: { limite: 1 } })),
    journalEtape: (e) => etapes.push(e),
    diagnostic: async () => ({ ia: "disponible (groq)", backend: "non configure" }),
  });
  let n = 0;
  const ecrire = (text, from = JID, id = `m-${n++}`) => agent.handle({ id, from, body: text });
  return { agent, provider, audit, etapes, ecrire };
}

// --- avecDelai -------------------------------------------------------------

test("une promesse qui aboutit passe sans entrave", async () => {
  assert.equal(await avecDelai(Promise.resolve(42), { ms: 1000, operation: "x" }), 42);
});

test("une promesse qui ne se resout JAMAIS est bornee", async () => {
  // Le coeur du defaut : sans borne, cette attente durait indefiniment.
  const jamais = new Promise(() => {});
  await assert.rejects(() => avecDelai(jamais, { ms: 20, operation: "resolution LID" }), DelaiDepasse);
});

test("un defaut remplace le depassement, mais JAMAIS une vraie erreur", async () => {
  assert.equal(await avecDelai(new Promise(() => {}), { ms: 20, operation: "x", defaut: null }), null);
  // Masquer une erreur reelle transformerait une panne en silence.
  await assert.rejects(
    () => avecDelai(Promise.reject(new Error("panne reelle")), { ms: 1000, operation: "x", defaut: null }),
    /panne reelle/,
  );
});

test("le minuteur est nettoye : il ne retient pas le processus", async () => {
  // Un setTimeout en attente garderait la boucle d'evenements vivante et
  // retarderait l'arret du service.
  const avant = process._getActiveHandles?.().length ?? 0;
  await avecDelai(Promise.resolve(1), { ms: 60_000, operation: "x" });
  const apres = process._getActiveHandles?.().length ?? 0;
  assert.ok(apres <= avant + 1, "aucun minuteur ne doit survivre");
});

// --- Le message obtient toujours une réponse -------------------------------

test("une comprehension qui leve n'aboutit pas a un silence", async () => {
  const { ecrire, provider, audit } = monter({
    interpret: async () => {
      throw new Error("fournisseur IA injoignable");
    },
  });
  const r = await ecrire("les absences");
  assert.equal(r.status, Status.FAILED);
  assert.match(provider.lastTextTo(JID) ?? "", /erreur technique/i);
  assert.equal(audit.last().result, "FAILED");
});

test("une comprehension qui ne repond jamais n'aboutit pas a un silence", async () => {
  // C'est la forme exacte de la panne de production : pas une exception, une
  // attente sans fin.
  const { ecrire, provider } = monter({
    interpret: () => avecDelai(new Promise(() => {}), { ms: 20, operation: "NLU" }),
  });
  const r = await ecrire("les absences");
  assert.equal(r.status, Status.FAILED);
  assert.match(provider.lastTextTo(JID) ?? "", /erreur technique/i);
});

test("un envoi qui echoue est trace, sans masquer la cause", async () => {
  const provider = new FakeProvider();
  provider.sendText = async () => {
    throw new Error("conversation introuvable");
  };
  const { ecrire, audit } = monter({ provider, interpret: async () => { throw new Error("cause reelle"); } });
  const r = await ecrire("les absences");
  assert.equal(r.status, Status.FAILED);
  assert.match(audit.last().error, /cause reelle/, "la cause initiale ne doit pas etre remplacee");
});

// --- Revendication et rejeu ------------------------------------------------

test("un echec AVANT toute action metier relache la revendication", async () => {
  // Sinon un message serait condamne a vie pour une panne d'une seconde.
  const dedup = new IdempotencyStore();
  const { ecrire } = monter({
    idempotency: dedup,
    interpret: async () => {
      throw new Error("IA en panne");
    },
  });
  await ecrire("les absences", JID, "msg-1");
  assert.equal(dedup.seen("msg-1"), false, "le message doit pouvoir etre retente");
});

test("un echec APRES une action metier garde la revendication", async () => {
  // Rejouer une ecriture d'assiduite creerait une seconde absence dans le
  // dossier d'un eleve.
  const dedup = new IdempotencyStore();
  const guergne = new GuergneSim();
  guergne.listerAbsences = () => {
    throw new Error("coupure en plein appel");
  };
  const { ecrire } = monter({ idempotency: dedup, guergne });
  await ecrire("les absences", JID, "msg-2");
  assert.equal(dedup.seen("msg-2"), true, "une ecriture incertaine ne se rejoue jamais toute seule");
});

test("un vrai doublon reste ignore", async () => {
  const { ecrire, etapes } = monter();
  await ecrire("les absences", JID, "meme-id");
  const r = await ecrire("les absences", JID, "meme-id");
  assert.equal(r.status, Status.DUPLICATE);
  assert.ok(etapes.some((e) => e.event === "message_duplicate_detected"));
});

test("un message sans identifiant est signale, pas silencieusement protege", async () => {
  const { agent, etapes } = monter();
  await agent.handle({ id: null, from: JID, body: "les absences" });
  assert.ok(etapes.some((e) => e.event === "message_id_missing"));
});

test("relacher une revendication la retire aussi du fichier", () => {
  const d = mkdtempSync(join(tmpdir(), "dedup-"));
  try {
    const f = join(d, "dedup.json");
    const a = new DedupPersistant({ chemin: f });
    a.remember("x");
    assert.equal(a.oublier("x"), true);
    assert.equal(new DedupPersistant({ chemin: f }).seen("x"), false, "le relachement doit survivre au redemarrage");
    assert.equal(a.oublier("inconnu"), false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Commande de diagnostic ------------------------------------------------

test("TEST AGENT repond sans LLM, sans backend et sans ecriture", async () => {
  let nlu = 0;
  const guergne = new GuergneSim();
  const { ecrire, provider, audit } = monter({
    guergne,
    interpret: async () => {
      nlu += 1;
      return { clarify: "?" };
    },
  });
  const r = await ecrire("TEST AGENT");
  assert.equal(r.status, Status.COMPLETED);
  assert.equal(r.diagnostic, true);
  assert.equal(nlu, 0, "la commande doit court-circuiter la comprehension");
  assert.equal(guergne.calls.length, 0, "aucun appel au backend");

  const rep = provider.lastTextTo(JID) ?? "";
  assert.match(rep, /Agent WhatsApp connecte/);
  assert.match(rep, /Identite reconnue : surveillant/);
  assert.match(rep, /Service IA : disponible/);
  assert.match(rep, /Backend scolaire : non configure/);
  assert.ok(!rep.includes(NUM), "aucun numero complet dans la reponse");
  assert.equal(audit.last().intent, "diagnostic");
});

test("TEST AGENT exige une identite autorisee", async () => {
  const { ecrire, provider } = monter();
  const inconnu = "23599999999@c.us";
  const r = await ecrire("TEST AGENT", inconnu);
  assert.equal(r.status, Status.REJECTED_UNKNOWN);
  assert.match(provider.lastTextTo(inconnu) ?? "", /non autoris/i);
});

test("TEST AGENT ne se declenche pas sur une phrase ordinaire", async () => {
  // Une formulation libre doit rester une demande scolaire.
  const { ecrire } = monter({ interpret: async () => ({ clarify: "?" }) });
  for (const texte of ["peux-tu faire un test agent ?", "TESTAGENT", "test"]) {
    const r = await ecrire(texte);
    assert.notEqual(r.diagnostic, true, texte);
  }
});

test("le journal d'etape porte le run du transport, de bout en bout", async () => {
  const { agent, etapes } = monter();
  await agent.handle({ id: "m-run", from: JID, body: "TEST AGENT", runId: "run_transport" });
  assert.ok(etapes.length > 0);
  assert.ok(
    etapes.every((e) => e.run === "run_transport"),
    "un run different a chaque etape rendrait la correlation impossible",
  );
});

// --- Le contrat d'intention, de bout en bout dans le moteur ----------------

test("une conversation obtient une vraie reponse, sans toucher au backend", async () => {
  const guergne = new GuergneSim();
  const { ecrire, provider, audit } = monter({
    guergne,
    interpret: async () => ({ intention: "conversation", reponse: "Bonjour, comment puis-je vous aider ?" }),
  });
  const r = await ecrire("Salut");
  assert.equal(r.status, Status.COMPLETED);
  assert.equal(r.conversation, true);
  assert.equal(provider.lastTextTo(JID), "Bonjour, comment puis-je vous aider ?");
  assert.equal(guergne.calls.length, 0, "une conversation ne lit aucune donnee");
  assert.equal(audit.last().intent, "conversation");
});

test("l'objet qui produisait « Action inconnue. » obtient une reponse utile", async () => {
  // Le cas exact observe en production.
  const { ecrire, provider, audit } = monter({
    interpret: async () => ({ description: "Je peux consulter l'assiduite", examples: ["..."] }),
  });
  const r = await ecrire("presente-moi tes capacites");
  assert.equal(r.status, Status.WAITING_INPUT);
  const rep = provider.lastTextTo(JID) ?? "";
  assert.notEqual(rep, "Action inconnue.");
  assert.match(rep, /Reformulez/);
  assert.equal(audit.last().result, "PLAN_INVALIDE");
  assert.match(audit.last().error, /INTENTION_INCONNUE/);
});

test("un outil invente est nomme dans l'audit, pas masque", async () => {
  const { ecrire, provider, audit } = monter({
    interpret: async () => ({ intention: "outil", outil: "assiduite.supprimer_tout" }),
  });
  await ecrire("supprime tout");
  assert.match(provider.lastTextTo(JID) ?? "", /Je ne sais pas faire cette operation/);
  assert.match(audit.last().error, /OUTIL_INCONNU:assiduite\.supprimer_tout/);
});

test("un chiffre scolaire invente n'atteint JAMAIS l'utilisateur", async () => {
  // Un directeur lirait « 45 absences » comme un releve de son etablissement.
  const { ecrire, provider, audit } = monter({
    interpret: async () => ({ intention: "conversation", reponse: "Aujourd'hui nous avons 45 absences." }),
  });
  const rep = await ecrire("combien d'absences aujourd'hui ?").then(() => provider.lastTextTo(JID) ?? "");
  assert.ok(!rep.includes("45"), "le chiffre invente ne doit pas etre transmis");
  assert.match(rep, /donnees reelles/);
  assert.match(audit.last().error, /DONNEES_INVENTEES/);
});

test("une clarification reste une clarification", async () => {
  const { ecrire, provider } = monter({
    interpret: async () => ({ intention: "clarifier", question: "De quelle classe parlez-vous ?" }),
  });
  const r = await ecrire("les absences");
  assert.equal(r.status, Status.WAITING_INPUT);
  assert.equal(provider.lastTextTo(JID), "De quelle classe parlez-vous ?");
});

test("le journal nomme l'intention detectee et la raison d'un rejet", async () => {
  const { ecrire, etapes } = monter({ interpret: async () => ({ fantaisie: true }) });
  await ecrire("quelque chose");
  const e = etapes.find((x) => x.event === "intent_detected");
  assert.equal(e.intention, "invalide");
  assert.equal(e.rejet, "INTENTION_INCONNUE");
  assert.equal(e.detail, "fantaisie");
  assert.ok(typeof e.dureeMs === "number");
});
