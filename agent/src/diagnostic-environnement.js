/**
 * Relevé de l'outillage réellement présent dans le conteneur.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * La mission de synthèse vocale demande d'installer Piper sur Altare. Piper,
 * dans sa distribution officielle v1.8.0, ne publie QUE des wheels Python :
 * vérifié en listant les fichiers de la version, puis en ouvrant le wheel
 * manylinux x86_64 lui-même — 39 fichiers `.py`, une extension CPython
 * (`espeakbridge.so`), et AUCUN exécutable autonome. Piper exige donc un
 * interpréteur Python.
 *
 * Or Altare ne donne qu'un accès SFTP, sans shell ni gestionnaire de paquets,
 * et cet accès est enfermé dans `/home/container` : `/usr/bin`, `/bin` et
 * `/etc` sont hors de portée. On peut donc constater que Python est absent du
 * dossier de l'application — ce qui est le cas — mais pas savoir s'il existe
 * au niveau du système. Et cette question décide de toute la suite : si
 * `python3` existe, un wheel se déplie dans `/home/container` et se lance avec
 * `PYTHONPATH`, sans pip, sans réseau et sans droits root. S'il n'existe pas,
 * Piper n'est pas déployable ici en l'état.
 *
 * La seule façon de poser la question est de la poser DE L'INTÉRIEUR, depuis
 * le processus Node qui, lui, tourne dans le conteneur.
 *
 * CE QU'IL NE FAIT PAS
 * --------------------
 * Il n'exécute que des commandes de version, prises dans une liste fermée et
 * écrite ici. Rien ne vient de l'appelant : une sonde qui accepterait une
 * commande serait une porte d'exécution à distance, et aucune information de
 * diagnostic ne vaut cela.
 *
 * Il n'installe rien, n'écrit rien, ne télécharge rien.
 */
import { execFile } from "node:child_process";
import { availableParallelism, cpus, freemem, loadavg, totalmem } from "node:os";

/**
 * Les outils cherchés, et la question que chacun tranche.
 *
 * `cmd` et `args` sont écrits ICI, jamais reçus : c'est ce qui distingue une
 * sonde d'une porte d'exécution.
 */
export const OUTILS = Object.freeze([
  { clef: "python3", cmd: "python3", args: ["--version"], pourquoi: "Piper n'existe qu'en wheel Python" },
  { clef: "python", cmd: "python", args: ["--version"], pourquoi: "repli si python3 n'est pas dans le PATH" },
  { clef: "pip3", cmd: "pip3", args: ["--version"], pourquoi: "dit si un wheel peut s'installer au lieu d'être déplié" },
  { clef: "ffmpeg", cmd: "ffmpeg", args: ["-version"], pourquoi: "conversion WAV vers OGG/Opus" },
  { clef: "opusenc", cmd: "opusenc", args: ["--version"], pourquoi: "encodeur Opus seul, bien plus léger que ffmpeg" },
  { clef: "ldd", cmd: "ldd", args: ["--version"], pourquoi: "dit quelle libc, donc quels binaires statiques tourneraient" },
  { clef: "uname", cmd: "uname", args: ["-mrs"], pourquoi: "architecture et noyau" },
]);

/** Délai par sonde. Un outil qui ne répond pas en deux secondes est un outil absent. */
const DELAI_MS = 2000;

/** Première ligne non vide, tronquée : `ffmpeg -version` en rend une vingtaine. */
const premiereLigne = (v) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
    ?.slice(0, 160) ?? null;

/**
 * Teste un outil.
 *
 * Un outil absent n'est pas une erreur du relevé : c'est son résultat. On
 * distingue néanmoins « absent du PATH » (ENOENT) d'un outil présent qui
 * échoue, parce que les deux appellent des décisions différentes.
 */
function sonder({ clef, cmd, args, pourquoi }, lancer) {
  return new Promise((resoudre) => {
    let fini = false;
    const rendre = (r) => {
      if (fini) return;
      fini = true;
      resoudre({ clef, pourquoi, ...r });
    };
    const minuteur = setTimeout(() => rendre({ present: false, raison: "aucune reponse en 2 s" }), DELAI_MS);
    try {
      lancer(cmd, args, { timeout: DELAI_MS, windowsHide: true }, (err, stdout, stderr) => {
        clearTimeout(minuteur);
        // Beaucoup d'outils ecrivent leur version sur stderr : la prendre en
        // compte evite de declarer absent un outil parfaitement present.
        const sortie = premiereLigne(stdout) ?? premiereLigne(stderr);
        if (err && err.code === "ENOENT") return rendre({ present: false, raison: "introuvable dans le PATH" });
        if (err && !sortie) return rendre({ present: false, raison: String(err.message ?? err).slice(0, 120) });
        rendre({ present: Boolean(sortie), version: sortie });
      });
    } catch (e) {
      clearTimeout(minuteur);
      rendre({ present: false, raison: String(e?.message ?? e).slice(0, 120) });
    }
  });
}

/**
 * Relève l'outillage et les ressources de calcul.
 *
 * @param {object} [o]
 * @param {Function} [o.lancer] `execFile`, injecté pour les tests
 */
export async function releverEnvironnement({ lancer = execFile } = {}) {
  const outils = {};
  // En parallele : sept sondes a deux secondes feraient quatorze secondes en
  // serie, et cette route doit repondre vite.
  for (const r of await Promise.all(OUTILS.map((o) => sonder(o, lancer)))) {
    const { clef, ...reste } = r;
    outils[clef] = reste;
  }

  const calcul = (() => {
    try {
      return {
        coeursVisibles: cpus().length,
        parallelismeDisponible: availableParallelism?.() ?? null,
        modele: cpus()[0]?.model?.slice(0, 60) ?? null,
        charge1min: Number(loadavg()[0]?.toFixed(2)),
        memoireMachineMo: Math.round(totalmem() / 1048576),
        memoireLibreMo: Math.round(freemem() / 1048576),
      };
    } catch {
      return null;
    }
  })();

  // La conclusion, enoncee ici plutot que laissee a l'interpretation : c'est
  // la question que la sonde existe pour trancher.
  const python = outils.python3?.present || outils.python?.present;
  const opus = outils.ffmpeg?.present || outils.opusenc?.present;
  return {
    outils,
    calcul,
    verdict: {
      piperDeployable: Boolean(python),
      // `coeursVisibles` est ce que voit le conteneur, pas forcement son quota
      // CPU reel : Altare ne l'expose pas, et le confondre surestimerait la
      // capacite de generation.
      note: python
        ? "Python present : un wheel Piper peut etre deplie dans /home/container et lance via PYTHONPATH, sans pip ni droits root."
        : "Python ABSENT : Piper v1.8.0 ne se distribue qu'en wheel Python, il n'est donc pas deployable ici en l'etat.",
      opusPossible: Boolean(opus),
      noteOpus: opus
        ? "Un encodeur est present : la conversion vers OGG/Opus, exigee par les notes vocales, est possible."
        : "Aucun encodeur : il faudra deposer un binaire statique ou encoder l'Opus en JavaScript.",
    },
  };
}
