/**
 * Recette audio RÉELLE : FFmpeg et FFprobe, pas des faux.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Toute la chaîne audio a été écrite et « validée » sur une machine où FFmpeg
 * n'était pas installé. Les tests unitaires remplaçaient le lanceur par un
 * espion : ils prouvaient que la bonne ligne de commande était composée, et
 * rien de plus. Qu'elle produise un OGG/Opus qu'un téléphone sait lire n'avait
 * jamais été vérifié ailleurs que sur le serveur de production — c'est-à-dire
 * au pire endroit possible.
 *
 * Ce script exécute les VRAIS outils sur de VRAIS fichiers. Il n'a besoin ni
 * de Piper, ni d'une session WhatsApp, ni du réseau : FFmpeg sait synthétiser
 * lui-même une onde sonore. Il tourne donc aussi en intégration continue.
 *
 *   node agent/scripts/recette-audio-reelle.mjs
 *
 * Variables : FFMPEG_BIN, FFPROBE_BIN (défaut : ffmpeg, ffprobe du PATH).
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { assemblerWavs, preparerNoteVocale, verifierOggOpus, versOggOpus } from "../src/voix/audio.js";

const lancer = promisify(execFile);
const ffmpeg = process.env.FFMPEG_BIN ?? "ffmpeg";
const ffprobe = process.env.FFPROBE_BIN ?? "ffprobe";
const options = { ffmpeg, ffprobe };

let reussis = 0;
let echoues = 0;
const cas = [];

function controler(nom, condition, detail = "") {
  if (condition) {
    reussis += 1;
    cas.push(`  OK   ${nom}${detail ? ` — ${detail}` : ""}`);
  } else {
    echoues += 1;
    cas.push(`  ECHEC ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Fabrique un WAV réel, de durée et de hauteur choisies.
 *
 * Une onde sinusoïdale, et non du silence : `verifierOggOpus` refuse un audio
 * muet, et à juste titre — une note vocale silencieuse est un échec qui se
 * présente comme un succès.
 */
async function wavDeTest(chemin, { secondes = 2, hz = 440, echantillonnage = 22050 } = {}) {
  await lancer(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${secondes}:sample_rate=${echantillonnage}`,
    "-ac", "1", "-c:a", "pcm_s16le", chemin,
  ]);
  return chemin;
}

async function principal() {
  // Le temporaire est posé explicitement : la production a appris ce que coûte
  // un `/tmp` dont on ignore la taille.
  const base = process.env.TMPDIR ?? tmpdir();
  const d = await mkdtemp(join(base, "recette-audio-"));
  console.log(`Recette audio reelle — ${ffmpeg} / ${ffprobe}`);
  console.log(`Dossier de travail : ${d}\n`);

  try {
    const v = await lancer(ffmpeg, ["-version"]);
    console.log(`  ${v.stdout.split("\n")[0]}`);
    const p = await lancer(ffprobe, ["-version"]);
    console.log(`  ${p.stdout.split("\n")[0]}\n`);
  } catch (e) {
    console.error(`FFmpeg introuvable : ${e.message}`);
    console.error("Installez-le, ou posez FFMPEG_BIN et FFPROBE_BIN.");
    process.exit(2);
  }

  // --- 1. Conversion d'un WAV en note vocale -------------------------------
  {
    const wav = await wavDeTest(join(d, "simple.wav"), { secondes: 3 });
    const ogg = join(d, "simple.ogg");
    const t0 = Date.now();
    await versOggOpus(wav, ogg, options);
    const ms = Date.now() - t0;
    const rapport = await verifierOggOpus(ogg, options);
    const taille = (await stat(ogg)).size;

    controler("conteneur ogg", rapport.conteneur === "ogg", `rendu : ${rapport.conteneur}`);
    controler("codec opus", rapport.codec === "opus", `rendu : ${rapport.codec}`);
    controler("48 kHz", rapport.echantillonnage === 48000, `rendu : ${rapport.echantillonnage}`);
    controler("mono", rapport.canaux === 1, `rendu : ${rapport.canaux}`);
    controler("duree conservee", Math.abs(rapport.dureeS - 3) < 0.3, `${rapport.dureeS?.toFixed(2)} s pour 3 s`);
    controler("fichier non vide", taille > 1000, `${taille} octets`);
    controler("verdict valide", rapport.valide === true, (rapport.griefs ?? []).join(" ; "));
    console.log(`  (conversion de 3 s d'audio en ${ms} ms, ${taille} octets)\n`);
  }

  // --- 2. L'assemblage bilingue, pour de vrai ------------------------------
  {
    // Deux échantillonnages DIFFÉRENTS exprès : le filtre `concat` refuse des
    // flux dissemblables, et rien ne garantit que deux modèles Piper rendent
    // la même fréquence. C'est précisément ce que l'alignement doit absorber.
    const a = await wavDeTest(join(d, "part-fr.wav"), { secondes: 2, hz: 440, echantillonnage: 22050 });
    const b = await wavDeTest(join(d, "part-ar.wav"), { secondes: 2, hz: 330, echantillonnage: 16000 });
    const assemble = join(d, "bilingue.wav");
    const r = await assemblerWavs([a, b], assemble, options);
    controler("assemblage effectue", r.assemble === true && r.parties === 2);

    const ogg = join(d, "bilingue.ogg");
    const rapport = await preparerNoteVocale(assemble, ogg, options);
    // 2 s + 0,5 s de silence + 2 s = 4,5 s attendues.
    controler(
      "duree de l'assemblage",
      Math.abs(rapport.dureeS - 4.5) < 0.4,
      `${rapport.dureeS?.toFixed(2)} s pour 4,5 s attendues`,
    );
    controler("assemblage valide", rapport.valide === true, (rapport.griefs ?? []).join(" ; "));
    controler("assemblage en opus", rapport.codec === "opus" && rapport.conteneur === "ogg");
  }

  // --- 3. Ce qui doit ÉCHOUER ---------------------------------------------
  {
    // Un audio muet est le piège le plus dangereux : tout réussit, et le
    // destinataire n'entend rien. La vérification doit le refuser.
    const muet = join(d, "muet.wav");
    await lancer(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0.1",
      "-c:a", "pcm_s16le", muet,
    ]);
    const ogg = join(d, "muet.ogg");
    await versOggOpus(muet, ogg, options);
    const rapport = await verifierOggOpus(ogg, options);
    controler(
      "un audio quasi muet est REFUSE",
      rapport.valide === false,
      `duree ${rapport.dureeS?.toFixed(3)} s, griefs : ${(rapport.griefs ?? []).join(" ; ") || "aucun"}`,
    );
  }
  {
    // Une extension n'est pas un format : un fichier nommé `.ogg` qui n'en est
    // pas un doit être refusé, pas envoyé.
    const faux = join(d, "faux.ogg");
    await writeFile(faux, "ceci n'est pas un conteneur ogg");
    const rapport = await verifierOggOpus(faux, options);
    controler("un faux .ogg est REFUSE", rapport.valide === false, (rapport.griefs ?? []).join(" ; ") || "aucun grief");
  }
  {
    const absent = join(d, "inexistant.wav");
    let leve = false;
    try {
      await versOggOpus(absent, join(d, "rien.ogg"), options);
    } catch {
      leve = true;
    }
    controler("un fichier absent leve une erreur nommee", leve);
  }

  // --- 4. Le temporaire est-il nettoye ? ----------------------------------
  {
    // `preparerNoteVocale` efface le WAV même quand la conversion échoue :
    // sans cela, un moteur qui boucle remplit le volume, et c'est le disque
    // qui finit par arrêter l'agent.
    const wav = await wavDeTest(join(d, "ephemere.wav"), { secondes: 1 });
    await preparerNoteVocale(wav, join(d, "ephemere.ogg"), options);
    let encoreLa = true;
    try {
      await stat(wav);
    } catch {
      encoreLa = false;
    }
    controler("le WAV source est efface apres conversion", encoreLa === false);
  }

  console.log(cas.join("\n"));
  console.log(`\n--- ${reussis} reussi(s), ${echoues} echec(s) ---`);
  await rm(d, { recursive: true, force: true });
  process.exit(echoues === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error(`Recette interrompue : ${e?.message ?? e}`);
  process.exit(1);
});
