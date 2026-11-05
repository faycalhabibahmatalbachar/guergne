/**
 * Recette de l'assemblage bilingue et de l'essai vocal de bout en bout.
 *
 * L'enjeu : éprouver les DEUX voix de l'établissement en UN SEUL envoi. Une
 * campagne de test ne doit pas se traduire par plusieurs notes vocales chez le
 * destinataire, et un essai qui échoue ne doit laisser aucun fichier derrière.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ECHANTILLONNAGE_ASSEMBLAGE, assemblerWavs } from "../src/voix/audio.js";
import { DiagnosticVoix, PARTIES_BILINGUES } from "../src/voix/diagnostic-voix.js";

const dossier = () => mkdtemp(join(tmpdir(), "assemblage-"));

/** Capture la ligne de commande sans lancer FFmpeg. */
function espion({ echoue = false } = {}) {
  const appels = [];
  return {
    appels,
    lanceur: (cmd, args, _opts, rappel) => {
      appels.push({ cmd, args });
      if (echoue) return rappel(new Error("sortie 1"), "", "Invalid argument");
      rappel(null, "", "");
    },
  };
}

test("deux parties donnent une commande concat avec un silence entre elles", async () => {
  const e = espion();
  const r = await assemblerWavs(["/a/fr.wav", "/a/ar.wav"], "/a/sortie.wav", { lanceur: e.lanceur });
  assert.equal(r.assemble, true);
  assert.equal(r.parties, 2);

  const args = e.appels[0].args;
  const filtre = args[args.indexOf("-filter_complex") + 1];
  // Trois flux : la partie francaise, le silence, la partie arabe.
  assert.match(filtre, /concat=n=3:v=0:a=1/);
  assert.match(filtre, /\[p0\]\[s0\]\[p1\]concat/);
  // Les formats sont ALIGNES de force : le filtre concat refuse des flux
  // dissemblables, et deux modeles Piper ne se ressemblent pas forcement.
  assert.ok(filtre.includes(`sample_rates=${ECHANTILLONNAGE_ASSEMBLAGE}`));
  assert.ok(filtre.includes("channel_layouts=mono"));
  // Le silence vient d'une entree lavfi, pas d'un fichier a fournir.
  assert.ok(args.includes("anullsrc=r=22050:cl=mono"));
  assert.ok(args.includes("-y"), "aucune question interactive ne doit geler l'agent");
});

test("une seule partie n'est pas assemblee : rien a faire", async () => {
  const e = espion();
  const r = await assemblerWavs(["/a/fr.wav"], "/a/sortie.wav", { lanceur: e.lanceur });
  assert.equal(r.assemble, false);
  assert.equal(r.chemin, "/a/fr.wav");
  assert.equal(e.appels.length, 0, "aucun appel a FFmpeg pour un fichier unique");
});

test("trois parties donnent deux silences", async () => {
  const e = espion();
  await assemblerWavs(["/1.wav", "/2.wav", "/3.wav"], "/s.wav", { lanceur: e.lanceur });
  const args = e.appels[0].args;
  const filtre = args[args.indexOf("-filter_complex") + 1];
  assert.match(filtre, /concat=n=5:v=0:a=1/);
  assert.equal(args.filter((a) => a === "lavfi").length, 2);
});

test("un assemblage sans partie est refuse avant tout appel", async () => {
  await assert.rejects(() => assemblerWavs([], "/s.wav"), /sans aucune partie/);
});

test("un echec de FFmpeg porte sa derniere ligne utile", async () => {
  const e = espion({ echoue: true });
  await assert.rejects(() => assemblerWavs(["/1.wav", "/2.wav"], "/s.wav", { lanceur: e.lanceur }), /Invalid argument/);
});

// --- L'essai bilingue de bout en bout ------------------------------------

/** Monte un essai complet avec de faux moteur, atelier audio et transport. */
async function essai({ echoueEnvoi = false } = {}) {
  const d = await dossier();
  const faits = { syntheses: [], assemblages: [], envois: [] };
  const voix = {
    async synthesize({ text, language }) {
      faits.syntheses.push({ language, caracteres: text.length });
      const wav = join(d, `${language}-${faits.syntheses.length}.wav`);
      await writeFile(wav, "RIFF");
      return { chemin: wav, modele: `${language}-modele` };
    },
    getCapabilities: () => ({ moteur: "piper" }),
  };
  const audio = {
    async assemblerWavs(entrees, sortie) {
      faits.assemblages.push(entrees.length);
      await writeFile(sortie, "RIFF-assemble");
      return { chemin: sortie, parties: entrees.length, assemble: true };
    },
    async preparerNoteVocale(_wav, ogg) {
      await writeFile(ogg, "OggS");
      return { chemin: ogg, dureeS: 12.5, taille: 4, conteneur: "ogg", codec: "opus", echantillonnage: 48000, canaux: 1 };
    },
  };
  const provider = {
    async sendAudio(jid, { data, mimetype }) {
      if (echoueEnvoi) throw new Error("envoi refuse");
      faits.envois.push({ jid, octets: data.length, mimetype });
      return { ok: true, voie: "direct", id: "false_x_ABC", idPartie: "ABC", ack: 1 };
    },
    async acquittement() {
      return { trouve: true, ack: 2, etat: "livre" };
    },
  };
  const diag = new DiagnosticVoix({
    jetonAttendu: "jeton",
    destinataires: async () => ["23500000001@c.us"],
    voix,
    audio,
    provider,
    dossierTemporaire: d,
    journal: () => {},
    // La relecture de l'acquittement attend WhatsApp en production ; ici elle
    // n'a rien a attendre.
    delaiAcquittementMs: 0,
  });
  return { diag, faits, dossier: d };
}

test("un essai bilingue synthetise deux langues et n'envoie QU'UNE note", async () => {
  const { diag, faits } = await essai();
  const r = await diag.declencher({ jeton: "jeton", cible: "SUPER_ADMIN", langue: "bilingue" });
  assert.equal(r.status, 200);
  assert.deepEqual(faits.syntheses.map((s) => s.language), ["fr", "ar"]);
  assert.deepEqual(faits.assemblages, [2]);
  assert.equal(faits.envois.length, 1, "un seul envoi, quoi qu'il arrive");
  // Le type est annonce COMPLET, parametre compris. Le depouiller etait mon
  // hypothese, et elle etait fausse : l'envoi echouait toujours sur la meme
  // erreur, et WhatsApp etiquette ses propres notes vocales ainsi.
  assert.equal(faits.envois[0].mimetype, "audio/ogg; codecs=opus");
  assert.equal(r.corps.etapes.parties.length, 2);
  assert.ok(r.corps.etapes.assemblage_ms >= 0);
});

test("l'essai ne confond pas acceptation et livraison", async () => {
  const { diag } = await essai();
  const r = await diag.declencher({ jeton: "jeton", langue: "bilingue" });
  assert.equal(r.corps.envoiAccepte, true);
  assert.equal(r.corps.acquittement.etat, "livre", "la livraison est RELUE, pas deduite");
  assert.match(r.corps.avertissement, /Ni la livraison ni l'ecoute ne sont prouvees/);
  // L'identifiant rendu est la fraction opaque : elle ne porte aucun numero.
  assert.equal(r.corps.messageId, "ABC");
});

test("les textes bilingues sont figes dans le code, pas fournis par l'appelant", async () => {
  const { diag, faits } = await essai();
  await diag.declencher({ jeton: "jeton", langue: "bilingue", texte: "dis ce que je veux" });
  assert.equal(faits.syntheses[0].caracteres, PARTIES_BILINGUES[0].texte.length);
});

test("un essai qui echoue ne laisse aucun fichier derriere lui", async () => {
  const { diag, dossier: d } = await essai({ echoueEnvoi: true });
  const r = await diag.declencher({ jeton: "jeton", langue: "bilingue" });
  assert.equal(r.status, 502);
  assert.match(r.corps.message, /envoi refuse/);
  // Deux WAV de parties, un WAV assemble et un OGG : tous doivent avoir
  // disparu, sinon un moteur qui echoue en boucle remplit le volume.
  assert.deepEqual(await readdir(d), []);
});

test("une langue inconnue est refusee avant toute synthese", async () => {
  const { diag, faits } = await essai();
  const r = await diag.declencher({ jeton: "jeton", langue: "es" });
  assert.equal(r.status, 400);
  assert.equal(faits.syntheses.length, 0);
});
