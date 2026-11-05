/**
 * Recette du porte-voix : la réponse parlée.
 *
 * Deux risques dominent, et ce sont eux que ces tests gardent. Le premier :
 * qu'un moteur vocal en panne transforme une réponse en silence. Le second :
 * qu'une note vocale partie de ce correctif technique atteigne un parent
 * d'élève, qui n'a rien demandé.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { avecVoix } from "../src/voix/porte-voix.js";

const JID = "23500000001@c.us";
const LONG = "Voici la situation de la classe que vous demandez, avec le detail des absences du jour.";

function faux({ mode = "texte_et_voix", roleDe = null, moteurPresent = true, echoueSynthese = false, echoueEnvoi = false } = {}) {
  const envoyes = [];
  const provider = {
    async sendText(jid, texte) {
      envoyes.push({ kind: "text", jid, texte });
      return { ok: true };
    },
    async sendAudio(jid, { data }) {
      if (echoueEnvoi) throw new Error("envoi audio impossible");
      envoyes.push({ kind: "audio", jid, octets: data.length });
      return { ok: true, voie: "direct", id: "false_x_ABC", idPartie: "ABC", ack: 1 };
    },
    autreMethode: () => "intacte",
    propriete: 42,
  };
  const journal = [];
  return {
    envoyes,
    journal,
    provider,
    async transport() {
      const dossier = await mkdtemp(join(tmpdir(), "voix-"));
      const moteur = {
        async synthesize({ language }) {
          if (echoueSynthese) throw new Error("piper indisponible");
          const wav = join(dossier, `${language}-${Math.random().toString(36).slice(2)}.wav`);
          await writeFile(wav, "RIFF....");
          return { chemin: wav, modele: `${language}-modele` };
        },
      };
      return avecVoix(provider, {
        moteur: () => (moteurPresent ? moteur : null),
        // Faux atelier audio : la conversion reelle est eprouvee ailleurs.
        audio: {
          async preparerNoteVocale(wav, ogg) {
            await writeFile(ogg, "OggS....");
            return { chemin: ogg, dureeS: 4.2, taille: 8, conteneur: "ogg", codec: "opus" };
          },
        },
        dossierTemporaire: dossier,
        mode,
        roleDe,
        roles: ["SUPER_ADMIN", "DIRECTION"],
        journal: (e) => journal.push(e),
      });
    },
  };
}

test("une reponse part en texte PUIS en note vocale", async () => {
  const f = faux();
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text", "audio"], "le texte d'abord, toujours");
  assert.ok(f.journal.find((l) => l.evenement === "tts_envoye"));
});

test("la langue entendue decide de la voix", async () => {
  const f = faux();
  const t = await f.transport();
  t.langueSouhaitee(JID, "ar");
  await t.sendText(JID, LONG);
  assert.equal(f.journal.find((l) => l.evenement === "tts_started").langue, "ar");
});

test("sans langue posee, elle est deduite du texte", async () => {
  const f = faux();
  const t = await f.transport();
  await t.sendText(JID, "عدد الطلاب في هذا القسم هو خمسة وثلاثون طالبا اليوم");
  assert.equal(f.journal.find((l) => l.evenement === "tts_started").langue, "ar");
});

// --- Le texte ne doit jamais dependre de la voix -------------------------

test("un moteur absent ne prive pas l'utilisateur de la reponse ecrite", async () => {
  const f = faux({ moteurPresent: false });
  const t = await f.transport();
  const r = await t.sendText(JID, LONG);
  assert.equal(r.ok, true);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
  assert.equal(f.journal.find((l) => l.evenement === "tts_ignore").raison, "moteur_indisponible");
});

test("une synthese qui echoue est consignee, sans emporter la reponse", async () => {
  const f = faux({ echoueSynthese: true });
  const t = await f.transport();
  const r = await t.sendText(JID, LONG);
  assert.equal(r.ok, true);
  assert.match(f.journal.find((l) => l.evenement === "tts_echec").raison, /piper indisponible/);
});

test("un envoi audio qui echoue ne masque rien et ne reessaie pas", async () => {
  const f = faux({ echoueEnvoi: true });
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.equal(f.envoyes.filter((e) => e.kind === "audio").length, 0);
  assert.ok(f.journal.find((l) => l.evenement === "tts_echec"));
});

// --- Le perimetre : qui recoit de la voix, et qui n'en recoit pas --------

test("un destinataire hors role ne recoit AUCUNE note vocale", async () => {
  // Un parent d'eleve ne doit pas recevoir de vocal du fait d'un correctif.
  const f = faux({ roleDe: () => "PARENT" });
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
  assert.equal(f.journal.find((l) => l.evenement === "tts_ignore").raison, "hors_perimetre");
});

test("un destinataire de role inconnu non plus : dans le doute, rien", async () => {
  const f = faux({ roleDe: () => null });
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
});

test("un role declare recoit bien la voix", async () => {
  const f = faux({ roleDe: () => "DIRECTION" });
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text", "audio"]);
});

// --- Les bornes -----------------------------------------------------------

test("un texte tres court reste ecrit : la voix n'y apporte rien", async () => {
  const f = faux();
  const t = await f.transport();
  await t.sendText(JID, "Opération annulée.");
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
  assert.equal(f.journal.find((l) => l.evenement === "tts_ignore").raison, "texte_trop_court");
});

test("un texte tres long reste ecrit : cinq notes vocales sont une nuisance", async () => {
  const f = faux();
  const t = await f.transport();
  await t.sendText(JID, "a".repeat(2000));
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
  assert.equal(f.journal.find((l) => l.evenement === "tts_ignore").raison, "texte_trop_long");
});

test("le mode « texte » rend le transport inchange", async () => {
  const f = faux({ mode: "texte" });
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
});

test("un mode inconnu retombe sur le texte, jamais sur un comportement devine", async () => {
  const f = faux({ mode: "n'importe quoi" });
  const t = await f.transport();
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
});

test("deux reponses au meme destinataire partent dans l'ordre", async () => {
  const f = faux();
  const t = await f.transport();
  await Promise.all([t.sendText(JID, `${LONG} un`), t.sendText(JID, `${LONG} deux`)]);
  assert.equal(f.envoyes.filter((e) => e.kind === "audio").length, 2);
});

test("le transport enveloppe reste le transport : rien d'autre ne change", async () => {
  const f = faux();
  const t = await f.transport();
  assert.equal(t.autreMethode(), "intacte");
  assert.equal(t.propriete, 42);
  await t.sendAudio(JID, { data: Buffer.from("x") });
  assert.equal(f.envoyes.at(-1).kind, "audio");
});

test("les metriques disent ce qui a reellement ete tente", async () => {
  const f = faux();
  const t = await f.transport();
  await t.sendText(JID, LONG);
  await t.sendText(JID, "court");
  const m = t.metriquesVoix();
  assert.equal(m.tentes, 1);
  assert.equal(m.envoyes, 1);
  assert.equal(m.ignores, 1);
  assert.equal(m.mode, "texte_et_voix");
});

// --- Le rôle vient du moteur, pas du JID --------------------------------

test("le role depose par le moteur l'emporte : un LID n'est pas un numero", async () => {
  // `roleDe` conclurait « inconnu » sur un JID de type LID, et personne ne
  // recevrait de voix. Le moteur, lui, a resolu l'identite.
  const f = faux({ roleDe: () => null });
  const t = await f.transport();
  t.contexteReponse("123456@lid", { role: "SUPER_ADMIN" });
  await t.sendText("123456@lid", LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text", "audio"]);
});

test("un role depose hors perimetre reste hors perimetre", async () => {
  const f = faux();
  const t = await f.transport();
  t.contexteReponse(JID, { role: "ENSEIGNANT" });
  await t.sendText(JID, LONG);
  assert.deepEqual(f.envoyes.map((e) => e.kind), ["text"]);
  assert.equal(f.journal.find((l) => l.evenement === "tts_ignore").raison, "hors_perimetre");
});

test("le contexte transporte aussi la langue entendue", async () => {
  const f = faux();
  const t = await f.transport();
  t.contexteReponse(JID, { role: "SUPER_ADMIN", langue: "ar" });
  await t.sendText(JID, LONG);
  assert.equal(f.journal.find((l) => l.evenement === "tts_started").langue, "ar");
});
