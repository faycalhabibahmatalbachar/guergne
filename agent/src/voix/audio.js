/**
 * Conversion et vérification audio pour les notes vocales WhatsApp.
 *
 * POURQUOI L'OGG/OPUS N'EST PAS NÉGOCIABLE
 * -----------------------------------------
 * Vérifié dans le code de whatsapp-web.js 1.34.7 : dans
 * `util/Injected/Utils.js`, le média est téléversé par
 * `OpaqueData.createFromData(mediaData.mediaBlob, …)` — tel quel. La page ne
 * transcode RIEN ; elle calcule seulement une forme d'onde via `AudioContext`,
 * qui sait décoder un WAV et masquerait donc le problème à l'envoi. Un WAV
 * envoyé avec `sendAudioAsVoice` part donc comme une note vocale que les
 * clients destinataires ne savent pas lire.
 *
 * Piper produit du WAV. La conversion est donc obligatoire, et c'est FFmpeg
 * qui la fait — présent sur Altare en version 7.1.5, vérifié par la sonde.
 *
 * POURQUOI 48 kHz MONO
 * --------------------
 * C'est ce que WhatsApp produit lui-même pour ses notes vocales. S'en écarter
 * fait transcoder le destinataire, au mieux, et refuser la lecture au pire.
 * `-application voip` optimise l'encodeur pour la parole plutôt que pour la
 * musique : à débit égal, la voix est plus intelligible.
 */
import { execFile } from "node:child_process";
import { stat, unlink } from "node:fs/promises";

/** Débit suffisant pour une voix de synthèse. Au-delà, on paie des octets pour rien. */
export const DEBIT_OPUS = "24k";

/** Ce que WhatsApp produit pour ses propres notes vocales. */
export const ECHANTILLONNAGE = 48000;

/** Au-delà, la conversion est devenue le goulot d'étranglement et non la synthèse. */
export const DELAI_CONVERSION_MS = 15_000;

export class EchecAudio extends Error {
  constructor(message, { etape = null } = {}) {
    super(message);
    this.name = "EchecAudio";
    this.etape = etape;
  }
}

/** Exécution bornée d'un outil, sans shell : aucune interpolation n'est possible. */
function lancer(cmd, args, { ms = DELAI_CONVERSION_MS, lanceur = execFile } = {}) {
  return new Promise((resoudre, rejeter) => {
    lanceur(cmd, args, { timeout: ms, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // FFmpeg écrit tout sur stderr, y compris quand il réussit : la
        // dernière ligne utile y est, et c'est elle qui explique un échec.
        const detail = String(stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-3).join(" | ");
        return rejeter(new EchecAudio(`${cmd} a echoue : ${detail || err.message}`.slice(0, 400), { etape: cmd }));
      }
      resoudre({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

/**
 * Convertit un WAV en OGG/Opus propre à devenir une note vocale.
 *
 * @param {string} entree  chemin du WAV
 * @param {string} sortie  chemin du OGG à produire
 */
export async function versOggOpus(entree, sortie, { ffmpeg = "ffmpeg", debit = DEBIT_OPUS, lanceur } = {}) {
  const t0 = Date.now();
  await lancer(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel", "error",
      // Écraser sans demander : le chemin est le nôtre, et une question
      // interactive gèlerait le processus de l'agent.
      "-y",
      "-i", entree,
      "-c:a", "libopus",
      "-b:a", debit,
      "-ar", String(ECHANTILLONNAGE),
      "-ac", "1",
      "-application", "voip",
      "-vbr", "on",
      "-f", "ogg",
      sortie,
    ],
    { lanceur },
  );
  return { chemin: sortie, msConversion: Date.now() - t0 };
}

/**
 * Fréquence d'échantillonnage imposée à l'assemblage.
 *
 * Les voix Piper « medium » rendent du 22 050 Hz, mais le filtre `concat` de
 * FFmpeg refuse des flux de formats différents. On aligne donc explicitement,
 * au lieu de supposer que deux modèles se ressemblent.
 */
export const ECHANTILLONNAGE_ASSEMBLAGE = 22050;

/** Silence inséré entre deux parties, pour que l'oreille les sépare. */
export const SILENCE_ENTRE_PARTIES_S = 0.5;

/**
 * Assemble plusieurs WAV en un seul, dans l'ordre donné.
 *
 * POURQUOI UN ASSEMBLAGE PLUTÔT QUE PLUSIEURS NOTES
 * --------------------------------------------------
 * Éprouver les deux voix de l'établissement demandait deux audios ; envoyer
 * deux notes vocales au même destinataire pour un test en aurait fait une
 * campagne. Un seul fichier, deux langues : un seul envoi à justifier.
 *
 * @param {string[]} entrees  chemins des WAV, dans l'ordre de lecture
 * @param {string} sortie     chemin du WAV à produire
 */
export async function assemblerWavs(entrees, sortie, { ffmpeg = "ffmpeg", lanceur, silenceS = SILENCE_ENTRE_PARTIES_S } = {}) {
  const parties = (entrees ?? []).filter(Boolean);
  if (parties.length === 0) throw new EchecAudio("assemblage sans aucune partie", { etape: "assemblage" });
  if (parties.length === 1) return { chemin: parties[0], parties: 1, assemble: false };

  const t0 = Date.now();
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const p of parties) args.push("-i", p);

  // Un silence par intervalle : réutiliser une même entrée deux fois dans
  // `concat` exigerait un `asplit`, plus fragile que N entrées bon marché.
  const silences = parties.length - 1;
  for (let i = 0; i < silences; i++) {
    args.push("-f", "lavfi", "-t", String(silenceS), "-i", `anullsrc=r=${ECHANTILLONNAGE_ASSEMBLAGE}:cl=mono`);
  }

  const format = `aformat=sample_fmts=s16:sample_rates=${ECHANTILLONNAGE_ASSEMBLAGE}:channel_layouts=mono`;
  const chaines = [];
  const ordre = [];
  parties.forEach((_, i) => {
    chaines.push(`[${i}:a]${format}[p${i}]`);
  });
  for (let i = 0; i < silences; i++) {
    chaines.push(`[${parties.length + i}:a]${format}[s${i}]`);
  }
  parties.forEach((_, i) => {
    ordre.push(`[p${i}]`);
    if (i < silences) ordre.push(`[s${i}]`);
  });
  const total = parties.length + silences;
  const filtre = `${chaines.join(";")};${ordre.join("")}concat=n=${total}:v=0:a=1[sortie]`;

  args.push("-filter_complex", filtre, "-map", "[sortie]", "-c:a", "pcm_s16le", "-f", "wav", sortie);
  // L'assemblage lit plusieurs fichiers : il mérite plus de temps qu'une
  // conversion simple, sans pour autant être illimité.
  await lancer(ffmpeg, args, { lanceur, ms: DELAI_CONVERSION_MS * 2 });
  return { chemin: sortie, parties: parties.length, assemble: true, msAssemblage: Date.now() - t0 };
}

/** Un nombre, ou `null` si la sonde n'a rien dit d'exploitable. */
const nombre = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Vérifie qu'un fichier est réellement une note vocale valide.
 *
 * On ne se contente pas de l'existence du fichier : `ffmpeg` peut rendre un
 * code de succès et laisser un conteneur vide si l'entrée était du silence.
 * C'est exactement le genre d'échec qui arrive chez l'utilisateur sous forme
 * d'un vocal muet, le pire des cas — il croit avoir reçu une réponse.
 */
export async function verifierOggOpus(chemin, { ffprobe = "ffprobe", lanceur } = {}) {
  const taille = await stat(chemin).then((s) => s.size).catch(() => null);
  if (taille === null) throw new EchecAudio(`fichier absent : ${chemin}`, { etape: "stat" });

  const { stdout } = await lancer(
    ffprobe,
    [
      "-hide_banner",
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,sample_rate,channels,duration:format=format_name,duration,size",
      "-of", "json",
      chemin,
    ],
    { lanceur },
  );

  let sonde;
  try {
    sonde = JSON.parse(stdout);
  } catch {
    throw new EchecAudio("ffprobe n'a pas rendu de JSON exploitable", { etape: "ffprobe" });
  }
  const flux = sonde.streams?.[0] ?? {};
  const format = sonde.format ?? {};
  const rapport = {
    taille,
    codec: flux.codec_name ?? null,
    echantillonnage: nombre(flux.sample_rate),
    canaux: nombre(flux.channels),
    dureeS: nombre(flux.duration) ?? nombre(format.duration),
    conteneur: format.format_name ?? null,
  };

  const griefs = [];
  if (rapport.codec !== "opus") griefs.push(`codec ${rapport.codec ?? "inconnu"} au lieu d'opus`);
  if (!String(rapport.conteneur ?? "").includes("ogg")) griefs.push(`conteneur ${rapport.conteneur ?? "inconnu"} au lieu d'ogg`);
  if (rapport.canaux !== 1) griefs.push(`${rapport.canaux ?? "?"} canaux au lieu de 1`);
  if (rapport.echantillonnage !== ECHANTILLONNAGE) griefs.push(`${rapport.echantillonnage ?? "?"} Hz au lieu de ${ECHANTILLONNAGE}`);
  // Un vocal muet est le pire des echecs : l'utilisateur croit avoir recu une
  // reponse. Un demi-dixieme de seconde ne contient aucune parole.
  if (rapport.dureeS === null || rapport.dureeS < 0.3) griefs.push(`duree ${rapport.dureeS ?? "inconnue"} s : audio vide ou illisible`);
  if (taille < 512) griefs.push(`${taille} octets : trop petit pour porter de la parole`);

  return { ...rapport, valide: griefs.length === 0, griefs };
}

/** Supprime un fichier sans jamais faire échouer l'appelant pour autant. */
export async function effacer(chemin) {
  if (!chemin) return false;
  try {
    await unlink(chemin);
    return true;
  } catch {
    // Un temporaire déjà disparu n'est pas un incident : c'est le résultat
    // voulu. Lever ici ferait échouer une réponse déjà envoyée.
    return false;
  }
}

/**
 * Chaîne complète : convertit, vérifie, et nettoie l'entrée.
 *
 * Le WAV est supprimé même en cas d'échec de la conversion : sans cela, un
 * moteur qui échoue en boucle remplit le volume, et c'est le disque qui
 * finirait par arrêter l'agent.
 */
export async function preparerNoteVocale(wav, ogg, options = {}) {
  try {
    const { msConversion } = await versOggOpus(wav, ogg, options);
    const rapport = await verifierOggOpus(ogg, options);
    if (!rapport.valide) {
      await effacer(ogg);
      throw new EchecAudio(`audio invalide : ${rapport.griefs.join(" ; ")}`, { etape: "verification" });
    }
    return { chemin: ogg, msConversion, ...rapport };
  } finally {
    await effacer(wav);
  }
}
