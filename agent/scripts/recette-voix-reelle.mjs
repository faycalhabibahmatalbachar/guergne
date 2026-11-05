/**
 * Recette de la synthèse vocale RÉELLE, dans les deux langues.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * La voix française avait été générée une fois sur Altare. L'arabe, jamais :
 * la seule route capable de synthétiser envoyait aussi, et un seul envoi était
 * autorisé. « Le modèle est présent » n'est pas « le modèle fonctionne » — un
 * fichier ONNX tronqué se charge sans erreur et rend du bruit.
 *
 * Ce script charge les deux modèles, synthétise de vrais textes, convertit, et
 * mesure. Aucun faux, aucune session WhatsApp, aucun réseau.
 *
 *   bash infra/local/lancer.sh node scripts/recette-voix-reelle.mjs
 *
 * Il sert aussi de banc de mesure : le goulot de la production n'était pas la
 * mémoire mais le processeur — 22 512 ms pour 17 s de parole sur un cœur
 * partagé. C'est ici qu'on sait ce que vaut un cœur réel.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FournisseurPiper } from "../src/voix/piper.js";
import { assemblerWavs, preparerNoteVocale } from "../src/voix/audio.js";
import { PARTIES_BILINGUES } from "../src/voix/diagnostic-voix.js";
import { detecterLangue, preparerPourVoix } from "../src/voix/texte-oral.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VOIX = process.env.VOIX_DOSSIER ?? join(racine, "donnees", "voix", "voix");
const TRAVAIL = process.env.TMPDIR ?? join(racine, "donnees-locales", "tmp");
const outils = { ffmpeg: process.env.FFMPEG_BIN ?? "ffmpeg", ffprobe: process.env.FFPROBE_BIN ?? "ffprobe" };

const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

let echoues = 0;
const controler = (nom, ok, detail = "") => {
  if (ok) vert(`  OK    ${nom}${detail ? ` — ${detail}` : ""}`);
  else {
    echoues += 1;
    rouge(`  ECHEC ${nom}${detail ? ` — ${detail}` : ""}`);
  }
};

/** Les textes d'épreuve : de vraies phrases, dans les deux écritures. */
const EPREUVES = [
  {
    langue: "fr",
    nom: "francais court",
    texte: "Bonjour. L'assistant du Lycée Guergné La Renaissance vous écoute.",
  },
  {
    langue: "fr",
    nom: "francais avec chiffres et accents",
    // Les nombres, les dates et les accents sont ce que l'agent dit vraiment :
    // « 3 absences le 05/11/2026 » ne se lit pas comme il s'écrit.
    texte: "La classe de 2nde B compte 35 élèves. Il y a eu 3 absences le 05/11/2026, dont 2 justifiées.",
  },
  {
    langue: "ar",
    nom: "arabe",
    texte: "مرحباً، هذا اختبار للنظام الصوتي لثانوية قرقني النهضة.",
  },
  {
    langue: "ar",
    nom: "arabe plus long",
    texte: "عدد الطلاب في هذا الفصل خمسة وثلاثون طالباً. تم تسجيل ثلاث حالات غياب اليوم.",
  },
];

async function principal() {
  mkdirSync(TRAVAIL, { recursive: true });
  bleu("== Chargement des deux modeles ==");
  gris(`  dossier des voix : ${VOIX}`);

  // Un modele tronque se charge sans erreur et rend du bruit : on controle la
  // taille AVANT, puisqu'elle est connue.
  for (const [langue, fichier] of [["fr", "fr_FR-siwis-medium.onnx"], ["ar", "ar_JO-kareem-medium.onnx"]]) {
    const chemin = join(VOIX, fichier);
    let octets = null;
    try {
      octets = statSync(chemin).size;
    } catch {
      /* absent */
    }
    controler(
      `modele ${langue} present et complet`,
      octets !== null && octets > 50_000_000,
      octets === null ? `introuvable : ${chemin}` : `${Math.round(octets / 1048576)} Mo`,
    );
  }
  if (echoues > 0) {
    rouge("\nModeles manquants : bash infra/local/environnement.sh utilisateur");
    process.exit(1);
  }

  const voix = new FournisseurPiper({
    python: process.env.PYTHON_BIN ?? "python3",
    modeles: { fr: join(VOIX, "fr_FR-siwis-medium.onnx"), ar: join(VOIX, "ar_JO-kareem-medium.onnx") },
    dossierTemporaire: TRAVAIL,
    journal: (e) => gris(`  [voix] ${JSON.stringify(e)}`),
  });

  const t0 = Date.now();
  const amorce = await voix.initialize();
  const msDemarrage = Date.now() - t0;
  controler("demon demarre", Boolean(amorce?.pret), amorce?.raison ?? `${msDemarrage} ms`);
  if (!amorce?.pret) {
    rouge("\nLe demon n'a pas demarre : rien d'autre ne peut etre eprouve.");
    process.exit(1);
  }
  // Les DEUX langues doivent etre annoncees : une seule signifie qu'un modele
  // n'a pas pu etre charge, et le demon ne le dirait pas autrement.
  controler("les deux langues sont chargees", (amorce.langues ?? []).length === 2, (amorce.langues ?? []).join(", "));
  gris(`  chargement des deux modeles : ${msDemarrage} ms`);

  const aEffacer = [];
  const mesures = [];
  try {
    bleu("\n== Synthese, langue par langue ==");
    for (const e of EPREUVES) {
      // Le texte passe par la preparation orale, comme en production : c'est
      // elle qui transforme « 05/11/2026 » en une date qui se prononce.
      const prepare = preparerPourVoix(e.texte, { langue: e.langue });
      const aDire = prepare.texteOral;

      const t = Date.now();
      let s;
      try {
        s = await voix.synthesize({ text: aDire, language: e.langue, outputFormat: "wav" });
      } catch (err) {
        controler(e.nom, false, String(err?.message ?? err).slice(0, 180));
        continue;
      }
      const ms = Date.now() - t;
      aEffacer.push(s.chemin);
      const octets = statSync(s.chemin).size;
      const dureeS = s.dureeS ?? null;
      // Le rapport temps de calcul / durée d'audio est LE chiffre qui décide
      // si une réponse vocale est tenable : au-dessus de 1, le serveur met
      // plus de temps à parler que l'auditeur à écouter.
      const ratio = dureeS ? ms / 1000 / dureeS : null;
      mesures.push({ ...e, caracteres: aDire.length, ms, dureeS, octets, ratio });
      controler(
        e.nom,
        octets > 1000 && (dureeS === null || dureeS > 0.3),
        `${ms} ms, ${dureeS ?? "?"} s d'audio, ${octets} octets` + (ratio ? `, ratio ${ratio.toFixed(2)}` : ""),
      );
    }

    // La detection de langue doit retrouver seule ce que nous avons impose :
    // c'est elle qui choisira la voix d'une reponse en production.
    bleu("\n== Detection de langue ==");
    for (const e of EPREUVES) {
      controler(`langue de « ${e.nom} » detectee`, detecterLangue(e.texte) === e.langue, `attendu ${e.langue}, lu ${detecterLangue(e.texte)}`);
    }

    bleu("\n== Note vocale bilingue, de bout en bout ==");
    const morceaux = [];
    let msBilingue = 0;
    for (const p of PARTIES_BILINGUES) {
      const t = Date.now();
      const s = await voix.synthesize({ text: p.texte, language: p.langue, outputFormat: "wav" });
      msBilingue += Date.now() - t;
      morceaux.push(s.chemin);
      aEffacer.push(s.chemin);
    }
    const assemble = join(TRAVAIL, `recette-bilingue-${Date.now()}.wav`);
    aEffacer.push(assemble);
    await assemblerWavs(morceaux, assemble, outils);
    const ogg = join(TRAVAIL, `recette-bilingue-${Date.now()}.ogg`);
    const rapport = await preparerNoteVocale(assemble, ogg, outils);
    aEffacer.push(ogg);

    controler("conteneur et codec", rapport.conteneur === "ogg" && rapport.codec === "opus", `${rapport.conteneur} / ${rapport.codec}`);
    controler("48 kHz mono", rapport.echantillonnage === 48000 && rapport.canaux === 1);
    controler("verdict ffprobe", rapport.valide === true, (rapport.griefs ?? []).join(" ; "));
    controler("duree plausible", rapport.dureeS > 8, `${rapport.dureeS} s`);

    // Conservee : c'est la piece a ecouter, et celle qui partira sur WhatsApp.
    const copie = join(racine, "donnees-locales", "bilingue-recette.ogg");
    mkdirSync(dirname(copie), { recursive: true });
    writeFileSync(copie, await (await import("node:fs/promises")).readFile(ogg));
    gris(`\n  Fichier a ecouter : ${copie}`);

    bleu("\n== Mesures ==");
    console.log("  langue  caracteres   synthese   audio    ratio");
    for (const m of mesures) {
      console.log(
        `  ${m.langue.padEnd(7)} ${String(m.caracteres).padStart(9)}   ${String(m.ms).padStart(6)} ms  ` +
          `${String(m.dureeS ?? "?").padStart(5)} s   ${m.ratio ? m.ratio.toFixed(2) : "?"}`,
      );
    }
    const moyen = mesures.filter((m) => m.ratio).reduce((a, m) => a + m.ratio, 0) / (mesures.filter((m) => m.ratio).length || 1);
    console.log(`\n  ratio moyen calcul/audio : ${moyen.toFixed(2)}`);
    console.log(`  note bilingue : ${msBilingue} ms de synthese pour ${rapport.dureeS} s d'audio`);
    gris("  Pour comparaison, Altare : 22 512 ms pour 17,2 s, soit un ratio de 1,31.");
  } finally {
    await voix.shutdown().catch(() => {});
    for (const f of aEffacer) await unlink(f).catch(() => {});
  }

  console.log(`\n--- ${echoues === 0 ? "tout est passe" : `${echoues} echec(s)`} ---`);
  process.exit(echoues === 0 ? 0 : 1);
}

principal().catch((e) => {
  rouge(`Recette interrompue : ${e?.message ?? e}`);
  if (e?.stack) gris(e.stack.split("\n").slice(1, 4).join("\n"));
  process.exit(1);
});
