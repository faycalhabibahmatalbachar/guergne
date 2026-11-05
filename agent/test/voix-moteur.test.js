/**
 * Recette du moteur vocal : contrat, audio, installation.
 *
 * Le cas le plus important n'est pas la réussite : c'est la PANNE. La voix est
 * un supplément, et l'agent doit répondre par écrit quand elle manque. Les
 * tests d'échec sont donc au moins aussi nombreux que ceux de succès.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEBIT_OPUS,
  ECHANTILLONNAGE,
  EchecAudio,
  effacer,
  preparerNoteVocale,
  verifierOggOpus,
  versOggOpus,
} from "../src/voix/audio.js";
import { EchecSynthese, FORMATS, FauxFournisseurVoix, FournisseurVoix, Metriques } from "../src/voix/fournisseur.js";
import { PIPER_VERSION, VOIX, installerPiper } from "../src/voix/installation.js";

const dossier = () => mkdtemp(join(tmpdir(), "voix-"));

// --- Le contrat -----------------------------------------------------------

test("un fournisseur incomplet se fait remarquer au branchement", async () => {
  // Rendre `undefined` produirait un silence en production ; lever le signale
  // au moment ou on branche.
  const f = new FournisseurVoix();
  await assert.rejects(() => f.initialize(), /non implémenté/);
  await assert.rejects(() => f.synthesize({}), /non implémenté/);
});

test("healthCheck ne leve JAMAIS : c'est une question, pas une operation", async () => {
  const f = new FournisseurVoix();
  const r = await f.healthCheck();
  assert.equal(r.sain, false);
  assert.match(r.raison, /healthCheck/);
});

test("le double de test respecte le contrat et compte ce qu'on lui demande", async () => {
  const f = new FauxFournisseurVoix();
  await f.initialize();
  assert.equal((await f.healthCheck()).sain, true);
  const r = await f.synthesize({ text: "Bonjour", language: "fr" });
  assert.ok(r.chemin);
  assert.equal(f.demandesRecues.length, 1);
  assert.equal(f.demandesRecues[0].language, "fr");
  assert.equal(f.getMetrics().succes, 1);
});

test("le double sait echouer sur commande, et l'echec est nomme", async () => {
  // Sans cela, impossible d'eprouver le comportement en cas de panne vocale,
  // qui est le cas qui compte.
  const f = new FauxFournisseurVoix({ echouer: true });
  await f.initialize();
  await assert.rejects(() => f.synthesize({ text: "x", language: "fr" }), EchecSynthese);
  assert.equal(f.getMetrics().echecs, 1);
});

test("une langue non chargee est refusee, pas prononcee de travers", async () => {
  const f = new FauxFournisseurVoix({ langues: ["fr"] });
  await f.initialize();
  await assert.rejects(() => f.synthesize({ text: "x", language: "ar" }), /langue non chargee/);
});

test("un arret est idempotent", async () => {
  const f = new FauxFournisseurVoix();
  await f.initialize();
  await f.shutdown();
  await assert.doesNotReject(() => f.shutdown());
  assert.equal((await f.healthCheck()).sain, false);
});

// --- Métriques ------------------------------------------------------------

test("les percentiles se calculent sur une fenetre bornee", () => {
  // Garder toutes les durees d'un processus qui tourne des mois finirait par
  // peser plus que les modeles.
  const m = new Metriques({ fenetre: 5 });
  for (let i = 1; i <= 50; i += 1) m.reussi({ ms: i * 10, caracteres: 10, dureeS: 1 });
  const r = m.resume();
  assert.equal(r.succes, 50);
  assert.ok(r.p50Ms >= 460, `p50 doit refleter la fenetre recente, obtenu ${r.p50Ms}`);
});

test("sans aucune mesure, les percentiles valent null et ne mentent pas", () => {
  const r = new Metriques().resume();
  assert.equal(r.p50Ms, null);
  assert.equal(r.p95Ms, null);
  assert.equal(r.rtf, null);
});

test("le facteur temps reel est calcule, car il se transpose d'une machine a l'autre", () => {
  const m = new Metriques();
  m.reussi({ ms: 1000, caracteres: 100, dureeS: 10 });
  assert.equal(m.resume().rtf, 0.1);
});

// --- Audio : la conversion ------------------------------------------------

test("la commande ffmpeg demande bien de l'Opus mono a 48 kHz", async () => {
  // C'est ce que WhatsApp produit pour ses propres notes vocales ; s'en
  // ecarter fait transcoder le destinataire, ou refuser la lecture.
  let args = null;
  await versOggOpus("in.wav", "out.ogg", { lanceur: (_c, a, _o, cb) => ((args = a), cb(null, "", "")) });
  assert.ok(args.includes("libopus"), "codec opus exige");
  assert.equal(args[args.indexOf("-ar") + 1], String(ECHANTILLONNAGE));
  assert.equal(args[args.indexOf("-ac") + 1], "1");
  assert.equal(args[args.indexOf("-b:a") + 1], DEBIT_OPUS);
  assert.equal(args[args.indexOf("-application") + 1], "voip");
  assert.ok(args.includes("-y"), "une question interactive gelerait l'agent");
});

test("un echec ffmpeg remonte ses dernieres lignes, qui expliquent la cause", async () => {
  // FFmpeg ecrit tout sur stderr : sans elles, l'echec serait muet.
  await assert.rejects(
    () => versOggOpus("in.wav", "out.ogg", { lanceur: (_c, _a, _o, cb) => cb(new Error("exit 1"), "", "a\nb\nInvalid data found") }),
    /Invalid data found/,
  );
});

// --- Audio : la vérification ---------------------------------------------

const sonde = (flux, format = { format_name: "ogg", duration: "4.2", size: "9000" }) => ({
  lanceur: (_c, _a, _o, cb) => cb(null, JSON.stringify({ streams: [flux], format }), ""),
  ffprobe: "ffprobe",
});

async function fichierDe(taille) {
  const d = await dossier();
  const p = join(d, "a.ogg");
  await writeFile(p, Buffer.alloc(taille));
  return p;
}

test("un OGG/Opus conforme est declare valide", async () => {
  const p = await fichierDe(9000);
  const r = await verifierOggOpus(p, sonde({ codec_name: "opus", sample_rate: "48000", channels: 1, duration: "4.2" }));
  assert.equal(r.valide, true, r.griefs.join(" ; "));
  assert.equal(r.codec, "opus");
  assert.equal(r.dureeS, 4.2);
});

test("un audio MUET est refuse : c'est le pire des echecs", async () => {
  // L'utilisateur croirait avoir recu une reponse.
  const p = await fichierDe(9000);
  const r = await verifierOggOpus(p, sonde({ codec_name: "opus", sample_rate: "48000", channels: 1, duration: "0.05" }));
  assert.equal(r.valide, false);
  assert.match(r.griefs.join(" "), /audio vide|duree/);
});

test("un codec ou un conteneur errone est refuse", async () => {
  const p = await fichierDe(9000);
  for (const [flux, format, attendu] of [
    [{ codec_name: "mp3", sample_rate: "48000", channels: 1, duration: "4" }, { format_name: "ogg", duration: "4" }, /codec mp3/],
    [{ codec_name: "opus", sample_rate: "48000", channels: 1, duration: "4" }, { format_name: "mp4", duration: "4" }, /conteneur mp4/],
    [{ codec_name: "opus", sample_rate: "22050", channels: 1, duration: "4" }, { format_name: "ogg", duration: "4" }, /22050 Hz/],
    [{ codec_name: "opus", sample_rate: "48000", channels: 2, duration: "4" }, { format_name: "ogg", duration: "4" }, /2 canaux/],
  ]) {
    const r = await verifierOggOpus(p, sonde(flux, format));
    assert.equal(r.valide, false);
    assert.match(r.griefs.join(" "), attendu);
  }
});

test("un fichier minuscule est refuse meme si la sonde le trouve bon", async () => {
  const p = await fichierDe(100);
  const r = await verifierOggOpus(p, sonde({ codec_name: "opus", sample_rate: "48000", channels: 1, duration: "4" }));
  assert.equal(r.valide, false);
  assert.match(r.griefs.join(" "), /trop petit/);
});

test("un fichier absent est signale avant toute sonde", async () => {
  const absent = join(await dossier(), "rien.ogg");
  await assert.rejects(() => verifierOggOpus(absent, sonde({})), EchecAudio);
});

test("une sonde illisible ne passe pas pour un succes", async () => {
  // Le contrat a change, et la recette avec le VRAI ffprobe en est la cause :
  // sur un fichier nomme `.ogg` qui n'en est pas un, ffprobe sort en erreur
  // avec « End of file ». L'exception remontait alors jusqu'a l'appelant, qui
  // recevait un message de bas niveau au lieu du seul renseignement utile.
  // Cette fonction REND un verdict ; l'intention du test est inchangee —
  // illisible ne doit jamais valoir succes — mais la forme est desormais un
  // refus motive, et non une erreur.
  const p = await fichierDe(9000);
  const r = await verifierOggOpus(p, { lanceur: (_c, _a, _o, cb) => cb(null, "pas du json", "") });
  assert.equal(r.valide, false);
  assert.match(r.griefs.join(" "), /JSON exploitable/);
});

test("un fichier que ffprobe refuse de lire est un refus motive", async () => {
  const p = await fichierDe(9000);
  const r = await verifierOggOpus(p, {
    lanceur: (_c, _a, _o, cb) => cb(new Error("sortie 1"), "", "faux.ogg: End of file"),
  });
  assert.equal(r.valide, false);
  assert.match(r.griefs.join(" "), /illisible par ffprobe/);
  assert.match(r.griefs.join(" "), /End of file/);
  // La taille reste connue : c'est ce qui distingue « fichier vide » de
  // « fichier plein mais illisible ».
  assert.equal(r.taille, 9000);
});

// --- Audio : le nettoyage -------------------------------------------------

test("effacer ne fait jamais echouer l'appelant", async () => {
  // Lever ici ferait echouer une reponse deja envoyee.
  assert.equal(await effacer(join(await dossier(), "absent.wav")), false);
  assert.equal(await effacer(null), false);
});

test("le WAV est supprime MEME quand la conversion echoue", async () => {
  // Sinon un moteur qui echoue en boucle remplit le volume, et c'est le disque
  // qui finit par arreter l'agent.
  const d = await dossier();
  const wav = join(d, "a.wav");
  await writeFile(wav, Buffer.alloc(2000));
  await assert.rejects(() =>
    preparerNoteVocale(wav, join(d, "a.ogg"), { lanceur: (_c, _a, _o, cb) => cb(new Error("boum"), "", "boum") }),
  );
  const { stat } = await import("node:fs/promises");
  await assert.rejects(() => stat(wav), /ENOENT/);
});

// --- Installation ---------------------------------------------------------

test("le wheel et les voix sont epingles, pas suivis au fil de l'eau", () => {
  // Une version qui change sous nos pieds est un incident, pas une mise a jour.
  assert.match(PIPER_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(VOIX.fr.nom, "fr_FR-siwis-medium");
  assert.equal(VOIX.ar.nom, "ar_JO-kareem-medium");
});

test("une installation qui echoue ne leve pas : l'agent doit demarrer quand meme", async () => {
  const r = await installerPiper({
    racine: await dossier(),
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(r.pret, false);
  assert.match(r.raison, /HTTP 503/);
});

test("un depliage qui ne produit rien est detecte, pas suppose reussi", async () => {
  const { Readable } = await import("node:stream");
  const r = await installerPiper({
    racine: await dossier(),
    fetchImpl: async () => ({ ok: true, status: 200, body: Readable.from([Buffer.alloc(60 * 1024 * 1024)]) }),
    // Un lanceur qui ne fait rien : exactement ce qu'on veut detecter.
    lanceur: (_c, _a, _o, cb) => cb(null, "", ""),
  });
  assert.equal(r.pret, false);
  assert.match(r.raison, /pas deplie/);
});

test("les formats annonces sont ceux que le transport accepte", () => {
  assert.ok(FORMATS.includes("ogg"), "l'ogg est le seul format de note vocale");
});
