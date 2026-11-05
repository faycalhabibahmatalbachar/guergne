/**
 * Recette de la chaîne vocale ENTRANTE, du média à la compréhension.
 *
 * Le défaut qu'elle garde : une note vocale produisait `handler_failed: "r"`,
 * sans jamais atteindre le modèle, et l'expéditeur recevait un message
 * technique qui ne disait pas quoi faire. Ces tests portent donc sur l'endroit
 * exact de chaque échec, sur ce que l'expéditeur reçoit, et sur le refus
 * catégorique de poursuivre avec une transcription vide.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Status } from "../src/engine.js";
import { makeAgent, incoming, JID_SURVEILLANT } from "./harness.js";

const vocal = (extra = {}) => incoming({ kind: "audio", media: { bytes: "ogg..." }, ...extra });

/** Collecte le journal d'étape, qui est la preuve du diagnostic. */
function avecJournal(options) {
  const etapes = [];
  const { agent, provider, audit, guergne } = makeAgent(options);
  agent.journalEtape = (e) => etapes.push(e);
  return { agent, provider, audit, guergne, etapes, eut: (ev) => etapes.find((e) => e.event === ev) };
}

const planAppel = () => ({
  tool: "assiduite.enregistrer_appel",
  params: { periodeId: "p1", dateAbsence: "2026-10-31", nbHeures: 1, absents: ["insc-1"], retards: [] },
});

test("une note vocale franchit le media, la transcription, puis le modele", async () => {
  const { agent, etapes, eut } = avecJournal({
    transcribe: async (media) => {
      // Le moteur doit recevoir le contrat REEL du transport, pas une forme
      // libre : c'est precisement ce qui avait masque le defaut.
      assert.ok(Buffer.isBuffer(media.data), "le media doit porter des octets");
      return { texte: "absence de insc-1", langue: "fr" };
    },
    interpret: async (texte) => {
      assert.equal(texte, "absence de insc-1");
      return planAppel();
    },
  });
  const r = await agent.handle(vocal());
  assert.equal(r.status, Status.COMPLETED);

  // La sequence complete, dans l'ordre : sans elle, « la voix ne marche pas »
  // ne dit pas ou regarder.
  const ordre = etapes.map((e) => e.event);
  for (const attendu of [
    "voice_incoming_received",
    "voice_media_downloaded",
    "voice_stt_started",
    "voice_stt_completed",
    "llm_request_started",
  ]) {
    assert.ok(ordre.includes(attendu), `etape manquante : ${attendu}`);
  }
  assert.ok(ordre.indexOf("voice_stt_completed") < ordre.indexOf("llm_request_started"));
  assert.equal(eut("voice_media_downloaded").octets, Buffer.from("ogg...").length);
  assert.equal(eut("voice_stt_completed").langue, "fr");
});

test("la langue entendue est transmise au transport, pour la reponse", async () => {
  const vues = [];
  const { agent, provider } = avecJournal({
    transcribe: async () => ({ texte: "ما هو عدد الطلاب", langue: "ar" }),
    interpret: async () => ({ clarify: "?" }),
  });
  provider.langueSouhaitee = (jid, langue) => vues.push({ jid, langue });
  await agent.handle(vocal());
  assert.deepEqual(vues, [{ jid: JID_SURVEILLANT, langue: "ar" }]);
});

test("un moteur rendant un texte nu reste accepte", async () => {
  // Les anciens appels et les tests existants rendent une chaine : la
  // compatibilite ne doit pas dependre d'une refonte du moteur.
  const { agent } = avecJournal({
    transcribe: async () => "absence de insc-1",
    interpret: async () => planAppel(),
  });
  assert.equal((await agent.handle(vocal())).status, Status.COMPLETED);
});

// --- Chaque echec a son nom, et son message a l'expediteur ---------------

test("un media illisible nomme l'etape et dit quoi faire", async () => {
  const { agent, provider, audit, eut } = avecJournal({
    transcribe: async () => ({ texte: "x" }),
    interpret: async () => planAppel(),
  });
  provider.getMedia = async () => {
    throw Object.assign(new Error("r"), { name: "r" });
  };
  const r = await agent.handle(vocal());
  assert.equal(r.status, Status.FAILED);
  assert.equal(r.etape, "voice_media_failed");
  // La description complete, et non la lettre seule : c'est tout l'objet du
  // correctif.
  assert.equal(eut("voice_media_failed").detail.messageSuspect, true);
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /note vocale/);
  assert.equal(audit.last().result, "FAILED");
});

test("un media absent ou expire n'est pas presente comme une panne", async () => {
  const { agent, provider } = avecJournal({ transcribe: async () => ({ texte: "x" }) });
  provider.getMedia = async () => null;
  const r = await agent.handle(vocal({ media: null }));
  assert.equal(r.etape, "voice_media_indisponible");
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /plus disponible/);
});

test("une transcription vide n'atteint JAMAIS le modele", async () => {
  // Sur un texte vide, le modele inventerait une intention — et une intention
  // inventee peut devenir une ecriture scolaire.
  let interprete = 0;
  const { agent, provider } = avecJournal({
    transcribe: async () => ({ texte: "   ", langue: "fr" }),
    interpret: async () => {
      interprete++;
      return planAppel();
    },
  });
  const r = await agent.handle(vocal());
  assert.equal(r.etape, "voice_stt_vide");
  assert.equal(interprete, 0, "le modele ne doit pas avoir ete appele");
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /rien entendu/);
});

test("une erreur du moteur de transcription est nommee, pas generique", async () => {
  const { agent, provider, eut } = avecJournal({
    transcribe: async () => {
      throw new Error("HTTP 429");
    },
  });
  const r = await agent.handle(vocal());
  assert.equal(r.etape, "voice_stt_failed");
  assert.match(eut("voice_stt_failed").raison, /429/);
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /transcrire/);
});

test("sans moteur de transcription, l'agent le dit au lieu d'echouer", async () => {
  const { agent, provider } = avecJournal({ interpret: async () => planAppel() });
  const r = await agent.handle(vocal());
  assert.equal(r.etape, "voice_stt_indisponible");
  assert.match(provider.lastTextTo(JID_SURVEILLANT), /Écrivez-moi/);
});

test("un echec vocal ne consomme pas le message : il peut etre renvoye", async () => {
  // Sans cela, renvoyer la meme note vocale apres un incident ne produirait
  // qu'un « doublon detecte », et l'utilisateur resterait sans reponse.
  let appels = 0;
  const { agent } = avecJournal({
    transcribe: async () => {
      appels++;
      if (appels === 1) throw new Error("HTTP 500");
      return { texte: "absence de insc-1", langue: "fr" };
    },
    interpret: async () => planAppel(),
  });
  const msg = vocal({ id: "ptt-1" });
  assert.equal((await agent.handle(msg)).status, Status.FAILED);
  assert.equal((await agent.handle(msg)).status, Status.COMPLETED);
});

test("un echec vocal ne declenche aucune action metier", async () => {
  const { agent, guergne } = avecJournal({
    transcribe: async () => ({ texte: "" }),
    interpret: async () => planAppel(),
  });
  await agent.handle(vocal());
  assert.equal(guergne.calls.length, 0);
});
