/**
 * Recette de la reconnaissance vocale RÉELLE, dans les deux langues.
 *
 * POURQUOI ELLE N'AVAIT JAMAIS ÉTÉ FAITE
 * ---------------------------------------
 * Le STT n'avait jamais été éprouvé sur un vrai média : la seule occasion
 * aurait été une note vocale entrante, et celles-ci échouaient toutes avant
 * d'atteindre le moteur — l'identifiant de message perdu, corrigé depuis.
 *
 * COMMENT ON OBTIENT DE L'AUDIO RÉEL SANS DEMANDER D'ENREGISTREMENT
 * ------------------------------------------------------------------
 * Piper le fabrique. On synthétise un texte connu, on le convertit dans le
 * format exact des notes vocales WhatsApp (OGG/Opus), on l'envoie au moteur de
 * transcription, et on compare ce qui revient au texte de départ. Ce n'est pas
 * une simulation : l'audio est un vrai signal, la requête un vrai appel
 * réseau, et la transcription une vraie reconnaissance. Un texte connu rend
 * même le contrôle plus sévère qu'un enregistrement humain, puisqu'on sait
 * exactement ce qui devait être entendu.
 *
 *   . infra/local/profil-ia.sh
 *   bash infra/local/lancer.sh node scripts/recette-stt-reelle.mjs
 *
 * Aucune clé n'est affichée, ni consignée, ni écrite où que ce soit.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MoteurIA, codeLangue, configurerDepuisEnv } from "../src/ia.js";
import { FournisseurPiper } from "../src/voix/piper.js";
import { preparerNoteVocale } from "../src/voix/audio.js";
import { resumerErreur } from "../src/erreurs.js";

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

/** Proportion de mots attendus réellement retrouvés dans la transcription. */
function recouvrement(attendu, obtenu) {
  const normaliser = (s) =>
    String(s ?? "")
      .toLowerCase()
      // Les diacritiques et la ponctuation varient d'une transcription à
      // l'autre sans changer le sens : les comparer serait injuste.
      .normalize("NFD")
      .replace(/[̀-ًͯ-ْ]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((m) => m.length > 2);
  const a = normaliser(attendu);
  const b = new Set(normaliser(obtenu));
  if (a.length === 0) return 0;
  return a.filter((m) => b.has(m)).length / a.length;
}

const EPREUVES = [
  {
    langue: "fr",
    nom: "francais",
    texte: "Bonjour, ceci est un test du systeme vocal du lycee Guergne La Renaissance.",
    // Les mots qui DOIVENT revenir : « Guergné » est un nom propre tchadien
    // qu'aucun modèle ne connaît, l'exiger serait déloyal.
    motsCles: ["bonjour", "test", "systeme", "vocal", "lycee"],
  },
  {
    langue: "ar",
    nom: "arabe",
    texte: "مرحبا، هذا اختبار للنظام الصوتي في المدرسة.",
    motsCles: ["اختبار", "الصوتي"],
  },
];

async function principal() {
  mkdirSync(TRAVAIL, { recursive: true });

  bleu("== Fournisseurs de transcription configures ==");
  // La configuration est lue par le MEME code que la production : eprouver une
  // autre facon de lire les cles n'eprouverait pas la production.
  const conf = configurerDepuisEnv(process.env);
  for (const a of conf.avertissements) gris(`  avertissement : ${a}`);
  const ia = new MoteurIA({
    cles: conf.cles,
    modeles: conf.modeles,
    ordre: conf.ordre,
    desactives: conf.desactives,
    // Le journal ne porte jamais de cle : `src/ia.js` ne journalise que des
    // noms de fournisseurs, des modeles et des durees.
    journal: (e) => gris(`  [ia] ${JSON.stringify(e)}`),
  });
  const transcripteurs = ia.transcripteurs;
  gris(`  fournisseurs presents : ${conf.presents.join(", ") || "aucun"}`);
  // On ne verifie JAMAIS la valeur d'une cle, seulement sa presence.
  for (const nom of ["GROQ_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY"]) {
    const presente = Boolean(process.env[nom]);
    gris(`  ${nom.padEnd(20)} ${presente ? "presente" : "absente"}`);
  }
  controler("au moins un moteur de transcription", transcripteurs.length > 0, transcripteurs.join(", ") || "aucun");
  if (transcripteurs.length === 0) {
    rouge("\nAucun fournisseur n'expose de point de transcription.");
    gris("Chargez les cles : . infra/local/profil-ia.sh");
    process.exit(1);
  }

  // Une requete reelle AVANT les transcriptions : si la cle est refusee,
  // autant le savoir maintenant qu'au milieu d'un diagnostic audio.
  bleu("\n== La cle fonctionne-t-elle reellement ? ==");
  try {
    const r = await ia.completerJson([
      { role: "system", content: 'Reponds exactement {"ok":true} et rien d\'autre.' },
      { role: "user", content: "ping" },
    ]);
    controler("appel LLM reel", Boolean(r?.texte), `${r?.fournisseur ?? "?"} / ${r?.modele ?? "?"} en ${r?.dureeMs ?? "?"} ms`);
  } catch (e) {
    controler("appel LLM reel", false, resumerErreur(e));
  }

  bleu("\n== Fabrication d'audio REEL avec Piper ==");
  const voix = new FournisseurPiper({
    python: process.env.PYTHON_BIN ?? "python3",
    modeles: { fr: join(VOIX, "fr_FR-siwis-medium.onnx"), ar: join(VOIX, "ar_JO-kareem-medium.onnx") },
    dossierTemporaire: TRAVAIL,
    journal: () => {},
  });
  const amorce = await voix.initialize();
  controler("moteur de synthese pret", Boolean(amorce?.pret), amorce?.raison ?? (amorce?.langues ?? []).join(", "));
  if (!amorce?.pret) process.exit(1);

  const aEffacer = [];
  try {
    for (const e of EPREUVES) {
      const s = await voix.synthesize({ text: e.texte, language: e.langue, outputFormat: "wav" });
      // Le format EXACT des notes vocales WhatsApp : transcrire autre chose
      // ne prouverait rien sur le cas réel.
      const ogg = join(TRAVAIL, `stt-${e.langue}-${Date.now()}.ogg`);
      const rapport = await preparerNoteVocale(s.chemin, ogg, outils);
      aEffacer.push(ogg);
      e.media = { chemin: ogg, octets: await readFile(ogg), dureeS: rapport.dureeS };
      gris(`  ${e.langue} : ${rapport.dureeS} s, ${e.media.octets.length} octets, ${rapport.conteneur}/${rapport.codec}`);
    }

    bleu("\n== Transcription reelle ==");
    for (const e of EPREUVES) {
      const t = Date.now();
      try {
        const r = await ia.transcrire(e.media.octets, { nomFichier: `vocal-${e.langue}.ogg` });
        const ms = Date.now() - t;
        const taux = recouvrement(e.motsCles.join(" "), r.texte);
        console.log(`  ${e.langue} entendu : « ${String(r.texte).slice(0, 110)} »`);
        gris(`     ${ms} ms, ${r.fournisseur}/${r.modele}, langue lue « ${r.langueBrute ?? "?"} » -> ${r.langue ?? "null"}`);
        controler(`transcription ${e.nom} non vide`, String(r.texte ?? "").trim().length > 0);
        // Le seuil est volontairement bas : l'enjeu est que le modèle ait
        // RECONNU la langue et le propos, pas qu'il transcrive à la lettre.
        controler(`mots cles retrouves (${e.nom})`, taux >= 0.6, `${Math.round(taux * 100)} % des mots cles`);
        controler(`langue detectee (${e.nom})`, r.langue === e.langue, `attendu ${e.langue}, lu ${r.langue ?? "null"}`);
      } catch (err) {
        controler(`transcription ${e.nom}`, false, resumerErreur(err));
      }
    }

    // --- Ce qui doit ECHOUER, et echouer PROPREMENT ----------------------
    bleu("\n== Les cas d'echec ==");

    {
      // Un fichier qui n'est pas de l'audio. Le moteur doit refuser, et
      // l'erreur doit nommer la cause — pas remonter une exception obscure.
      const faux = join(TRAVAIL, `stt-invalide-${Date.now()}.ogg`);
      writeFileSync(faux, "ceci n'est pas un conteneur audio");
      aEffacer.push(faux);
      let refuse = false;
      let raison = "";
      try {
        const r = await ia.transcrire(await readFile(faux), { nomFichier: "invalide.ogg" });
        // Certains moteurs rendent une chaine vide plutot qu'une erreur : les
        // deux sont des refus acceptables, un texte inventé ne l'est pas.
        refuse = String(r?.texte ?? "").trim().length === 0;
        raison = `texte rendu : « ${String(r?.texte ?? "").slice(0, 60)} »`;
      } catch (err) {
        refuse = true;
        raison = resumerErreur(err, { max: 120 });
      }
      controler("un media invalide est REFUSE", refuse, raison);
    }

    {
      const vide = join(TRAVAIL, `stt-vide-${Date.now()}.ogg`);
      writeFileSync(vide, Buffer.alloc(0));
      aEffacer.push(vide);
      let refuse = false;
      let raison = "";
      try {
        const r = await ia.transcrire(await readFile(vide), { nomFichier: "vide.ogg" });
        refuse = String(r?.texte ?? "").trim().length === 0;
        raison = `texte rendu : « ${String(r?.texte ?? "").slice(0, 60)} »`;
      } catch (err) {
        refuse = true;
        raison = resumerErreur(err, { max: 120 });
      }
      controler("un fichier vide est REFUSE", refuse, raison);
    }

    {
      // UN FOURNISSEUR MUET NE DOIT PAS BLOQUER L'AGENT.
      //
      // C'est deja arrive, et cela a coute sept heures de silence. On ne peut
      // pas demander a Groq de se taire : on injecte donc un `fetch` qui ne
      // repond jamais mais honore le signal d'abandon. Le delai eprouve est
      // le VRAI, celui du module — c'est tout l'interet.
      const muet = new MoteurIA({
        cles: conf.cles,
        ordre: conf.ordre,
        journal: () => {},
        fetch: (_url, { signal } = {}) =>
          new Promise((_, rejeter) => {
            signal?.addEventListener("abort", () => rejeter(new Error("AbortError : requete abandonnee")));
          }),
      });
      const t = Date.now();
      let abandonne = false;
      let raison = "";
      try {
        await muet.transcrire(EPREUVES[0].media.octets, { nomFichier: "vocal.ogg" });
      } catch (err) {
        abandonne = true;
        raison = `${resumerErreur(err, { max: 110 })} apres ${Math.round((Date.now() - t) / 1000)} s`;
      }
      controler("un fournisseur muet est ABANDONNE", abandonne, raison);
    }

    {
      // Taille excessive : 25 Mo, au-dela de ce qu'accepte le point de
      // transcription. L'echec doit etre nomme, pas subi.
      const gros = Buffer.alloc(25 * 1024 * 1024, 0x41);
      let refuse = false;
      let raison = "";
      try {
        const r = await ia.transcrire(gros, { nomFichier: "enorme.ogg" });
        refuse = String(r?.texte ?? "").trim().length === 0;
        raison = "texte vide rendu";
      } catch (err) {
        refuse = true;
        raison = resumerErreur(err, { max: 140 });
      }
      controler("un media trop volumineux est REFUSE", refuse, raison);
    }

    bleu("\n== La transcription normalisee ==");
    controler("« french » devient fr", codeLangue("french") === "fr");
    controler("« arabic » devient ar", codeLangue("arabic") === "ar");
    controler("une langue hors perimetre rend null", codeLangue("spanish") === null);
  } finally {
    await voix.shutdown().catch(() => {});
    for (const f of aEffacer) await unlink(f).catch(() => {});
  }

  console.log(`\n--- ${echoues === 0 ? "tout est passe" : `${echoues} echec(s)`} ---`);
  process.exit(echoues === 0 ? 0 : 1);
}

principal().catch((e) => {
  rouge(`Recette interrompue : ${resumerErreur(e, { max: 300 })}`);
  process.exit(1);
});
