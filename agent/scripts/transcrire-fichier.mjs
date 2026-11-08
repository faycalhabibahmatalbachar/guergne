/**
 * Transcrit un fichier audio réel, et dit tout ce qu'on peut en savoir.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Jusqu'ici, le STT n'avait été éprouvé que sur de l'audio fabriqué par Piper.
 * C'est un signal propre, régulier, sans bruit de fond, prononcé par une voix
 * de synthèse — autrement dit le cas le plus facile. Une vraie note vocale
 * humaine, enregistrée au téléphone, est une épreuve différente : débit,
 * accent, bruit, compression de WhatsApp.
 *
 * Ce script prend un fichier tel qu'il est, le sonde, le transcrit, et rend la
 * mesure. Il ne touche à aucune session WhatsApp et n'envoie rien.
 *
 *   . infra/local/profil-ia.sh
 *   node scripts/transcrire-fichier.mjs "/chemin/vers/note.ogg"
 *
 * Le fichier est copié dans le dossier de travail avant toute lecture : un
 * média venu de l'extérieur n'est pas lu depuis l'endroit où il est tombé.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MoteurIA, codeLangue, configurerDepuisEnv } from "../src/ia.js";
import { verifierOggOpus } from "../src/voix/audio.js";
import { detecterLangue } from "../src/voix/texte-oral.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRAVAIL = process.env.TMPDIR ?? join(racine, "donnees-locales", "tmp");
const outils = { ffprobe: process.env.FFPROBE_BIN ?? "ffprobe", ffmpeg: process.env.FFMPEG_BIN ?? "ffmpeg" };

const chemin = process.argv[2];
if (!chemin) {
  console.error('usage : node scripts/transcrire-fichier.mjs "/chemin/vers/audio.ogg"');
  process.exit(2);
}

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);
const ligne = (c, v) => console.log(`  ${String(c).padEnd(20)} ${v}`);

async function principal() {
  mkdirSync(TRAVAIL, { recursive: true });

  bleu("== Le fichier ==");
  let source;
  try {
    source = statSync(chemin);
  } catch {
    rouge(`  introuvable : ${chemin}`);
    process.exit(1);
  }
  // Copie dans le dossier de travail : un media venu de l'exterieur n'est pas
  // lu depuis l'endroit ou il est tombe.
  const local = join(TRAVAIL, `entrant-${Date.now()}-${basename(chemin).replace(/[^\w.-]/g, "_")}`);
  /**
   * L'en-tête d'un Ogg/Opus, lu sans outil externe.
   *
   * Rend `null` dès qu'un octet ne dit pas ce qu'il doit dire : mieux vaut
   * avouer qu'on ne sait pas que décrire un fichier qu'on n'a pas comprIS.
   */
  function lireEnTeteOpus(octets) {
    if (octets.length < 48 || octets.subarray(0, 4).toString("ascii") !== "OggS") return null;
    const tete = octets.indexOf("OpusHead");
    if (tete < 0) return null;
    const canaux = octets[tete + 9];
    const frequence = octets.readUInt32LE(tete + 12);
    // Le granule de la DERNIERE page, en echantillons a 48 kHz : c'est la
    // definition d'Opus, quelle que soit la frequence d'origine.
    let position = 0;
    let granule = 0;
    for (;;) {
      const page = octets.indexOf("OggS", position);
      if (page < 0 || page + 14 > octets.length) break;
      granule = Number(octets.readBigInt64LE(page + 6));
      position = page + 4;
    }
    if (!(canaux > 0) || !(frequence > 0) || !(granule > 0)) return null;
    return { canaux, frequence, dureeS: Math.round((granule / 48000) * 1000) / 1000 };
  }

  copyFileSync(chemin, local);
  ligne("nom", basename(chemin));
  ligne("octets", source.size);
  ligne("copie", local);

  bleu("\n== Ce que ffprobe en dit ==");
  const sonde = await verifierOggOpus(local, outils);
  ligne("conteneur", sonde.conteneur ?? "inconnu");
  ligne("codec", sonde.codec ?? "inconnu");
  ligne("echantillonnage", `${sonde.echantillonnage ?? "?"} Hz`);
  ligne("canaux", sonde.canaux ?? "?");
  ligne("duree", `${sonde.dureeS ?? "?"} s`);
  // `valide` juge selon NOS exigences de sortie (48 kHz mono). Un media
  // ENTRANT n'a aucune raison de les respecter : WhatsApp enregistre ses notes
  // vocales a 16 kHz. Ce n'est donc pas un defaut, et le dire autrement serait
  // un faux negatif.
  if (!sonde.valide) {
    gris(`  verdict de sortie : non conforme — ${(sonde.griefs ?? []).join(" ; ")}`);
    gris("  C'est attendu : ce verdict juge nos ENVOIS (48 kHz mono), pas ce qui entre.");
  }
  let exploitable = sonde.codec === "opus" && (sonde.dureeS ?? 0) > 0.3;
  if (!exploitable) {
    // FFPROBE ABSENT N'EST PAS UN AUDIO INVALIDE.
    //
    // Le 8 novembre, ffprobe avait disparu du poste : la sonde rendait
    // « illisible », et le script refusait un fichier parfaitement bon. Ce
    // n'est pas un verdict sur l'audio, c'est l'absence d'un outil.
    //
    // L'en-tete d'un Ogg/Opus se lit sans outil : « OggS » au premier octet,
    // puis « OpusHead » qui porte les canaux et la frequence d'entree, et le
    // granule de la derniere page qui donne la duree a 48 kHz. On le lit donc
    // nous-memes, et on le DIT, pour que personne ne prenne cette lecture de
    // repli pour une inspection FFprobe.
    const entete = lireEnTeteOpus(readFileSync(local));
    if (entete) {
      gris("  ffprobe indisponible : en-tete Ogg/Opus lu directement (ce n'est PAS une inspection FFprobe)");
      ligne("conteneur lu", "ogg");
      ligne("codec lu", "opus");
      ligne("canaux lus", entete.canaux);
      ligne("frequence d'entree", `${entete.frequence} Hz`);
      ligne("duree lue", `${entete.dureeS} s`);
      exploitable = entete.dureeS > 0.3;
    }
  }
  if (!exploitable) {
    rouge("  Ce fichier n'est pas de l'audio exploitable.");
    process.exit(1);
  }
  vert("  audio exploitable");

  bleu("\n== Transcription reelle ==");
  const conf = configurerDepuisEnv(process.env);
  if (!conf.cles.groq) {
    rouge("  Aucune cle de transcription. Chargez : . infra/local/profil-ia.sh");
    process.exit(1);
  }
  const ia = new MoteurIA({
    cles: conf.cles,
    modeles: conf.modeles,
    ordre: conf.ordre,
    desactives: conf.desactives,
    journal: (e) => gris(`  [ia] ${JSON.stringify(e)}`),
  });

  const octets = readFileSync(local);
  const t0 = Date.now();
  let r;
  try {
    r = await ia.transcrire(octets, { nomFichier: basename(local) });
  } catch (e) {
    rouge(`  echec : ${resumerErreur(e)}`);
    process.exit(1);
  }
  const ms = Date.now() - t0;

  console.log();
  vert(`  « ${r.texte} »`);
  console.log();
  ligne("langue lue", `${r.langueBrute ?? "?"} -> ${r.langue ?? "null"}`);
  ligne("duree annoncee", `${r.dureeAudioS ?? "?"} s`);
  ligne("fournisseur", `${r.fournisseur}/${r.modele}`);
  ligne("temps", `${ms} ms`);
  // Le rapport entre le temps de transcription et la duree de l'audio dit si
  // la reconnaissance tient dans un echange conversationnel.
  if (r.dureeAudioS) ligne("ratio", (ms / 1000 / r.dureeAudioS).toFixed(2));
  ligne("caracteres", String(r.texte ?? "").length);
  ligne("langue du texte", detecterLangue(r.texte) ?? "indecidable");
  ligne("normalisation", `codeLangue(« ${r.langueBrute} ») = ${codeLangue(r.langueBrute) ?? "null"}`);
  gris(`\n  Le fichier de travail reste : ${local}`);
}

principal().catch((e) => {
  rouge(`Interrompu : ${resumerErreur(e, { max: 300 })}`);
  process.exit(1);
});
