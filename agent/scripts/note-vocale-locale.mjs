/**
 * Envoi d'UNE note vocale bilingue depuis une session WhatsApp LOCALE.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Le nœud Altare ne répond plus à son panneau. Le conteneur tourne, mais on ne
 * peut plus y redémarrer le processus Node, donc plus y charger le correctif du
 * transport audio. La preuve attendue — une vraie note vocale reçue sur un
 * téléphone — ne peut donc plus venir de la production.
 *
 * Ce script la produit depuis le poste de développement, avec le vrai
 * whatsapp-web.js, le vrai Chromium, le vrai Piper et le vrai FFmpeg. Aucun
 * faux, à aucune étape.
 *
 * CE QU'IL NE FAIT PAS, ET C'EST ESSENTIEL
 * -----------------------------------------
 * Il n'enregistre AUCUN gestionnaire de message. Il n'écoute pas, ne répond à
 * personne, ne touche à aucune donnée scolaire. C'est un appareil lié
 * supplémentaire, en écriture seule, le temps d'un envoi — pas un second
 * agent. Deux agents répondant aux mêmes messages enverraient deux réponses à
 * de vraies familles.
 *
 * Il n'utilise PAS la session d'Altare. `donnees/wwebjs_auth` reste là-bas,
 * intacte : ce script crée sa propre session, dans son propre répertoire, et
 * demande son propre appairage. Réutiliser la session de production, c'est
 * exactement ce qui fait bannir un numéro.
 *
 *   node agent/scripts/note-vocale-locale.mjs --numero 23568663737
 *   node agent/scripts/note-vocale-locale.mjs --numero 23568663737 --blanc
 *
 * `--blanc` fait tout sauf l'envoi : synthèse, assemblage, conversion,
 * vérification ffprobe, résolution du destinataire. C'est le mode à utiliser
 * d'abord, puisqu'un seul envoi réel est autorisé.
 *
 * Variables attendues (le profil de `infra/local/environnement.sh` les pose) :
 *   PYTHON_BIN, VOIX_DOSSIER, FFMPEG_BIN, FFPROBE_BIN
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FournisseurPiper } from "../src/voix/piper.js";
import { assemblerWavs, preparerNoteVocale } from "../src/voix/audio.js";
import { PARTIES_BILINGUES } from "../src/voix/diagnostic-voix.js";
import { chaineIdentifiant, partieIdMessage, serialiserIdMessage } from "../src/providers/identifiant-message.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Arguments --------------------------------------------------------------
const argv = process.argv.slice(2);
const valeur = (nom) => {
  const i = argv.indexOf(nom);
  return i >= 0 ? argv[i + 1] : null;
};
const numero = (valeur("--numero") ?? "").replace(/[^\d]/g, "");
const blanc = argv.includes("--blanc");

if (!numero) {
  console.error("usage : node note-vocale-locale.mjs --numero <chiffres> [--blanc]");
  process.exit(2);
}

const PYTHON = process.env.PYTHON_BIN ?? "python3";
const VOIX = process.env.VOIX_DOSSIER ?? join(racine, "donnees", "voix", "voix");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");
const TRAVAIL = process.env.TMPDIR ?? join(racine, "donnees-locales", "tmp");
const outils = {
  ffmpeg: process.env.FFMPEG_BIN ?? "ffmpeg",
  ffprobe: process.env.FFPROBE_BIN ?? "ffprobe",
};

/** Masque un numéro : aucun journal de ce script n'en écrit un en clair. */
const masque = (n) => `${n.slice(0, 3)}${"•".repeat(Math.max(0, n.length - 7))}${n.slice(-4)}`;

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

const etapes = {};
const chrono = () => Date.now();

async function principal() {
  mkdirSync(SESSION, { recursive: true, mode: 0o700 });
  mkdirSync(TRAVAIL, { recursive: true });

  bleu("== 1. Moteur vocal local ==");
  const voix = new FournisseurPiper({
    python: PYTHON,
    modeles: {
      fr: join(VOIX, "fr_FR-siwis-medium.onnx"),
      ar: join(VOIX, "ar_JO-kareem-medium.onnx"),
    },
    dossierTemporaire: TRAVAIL,
    journal: (e) => gris(`  [voix] ${JSON.stringify(e)}`),
  });
  const t0 = chrono();
  const amorce = await voix.initialize();
  etapes.demarrage_moteur_ms = chrono() - t0;
  if (!amorce?.pret) {
    rouge(`Moteur vocal indisponible : ${amorce?.raison ?? "raison inconnue"}`);
    gris("Lancez : bash infra/local/environnement.sh verifier");
    process.exit(1);
  }
  vert(`  moteur pret (${(amorce.langues ?? []).join(", ")}) en ${etapes.demarrage_moteur_ms} ms`);

  // --- 2. Les deux voix, séparément ---------------------------------------
  bleu("== 2. Synthese des deux parties ==");
  const morceaux = [];
  etapes.parties = [];
  for (const p of PARTIES_BILINGUES) {
    const t = chrono();
    const s = await voix.synthesize({ text: p.texte, language: p.langue, outputFormat: "wav" });
    const ms = chrono() - t;
    morceaux.push(s.chemin);
    etapes.parties.push({ langue: p.langue, caracteres: p.texte.length, synthese_ms: ms, dureeS: s.dureeS ?? null });
    vert(`  ${p.langue} : ${p.texte.length} caracteres en ${ms} ms${s.dureeS ? ` (${s.dureeS} s d'audio)` : ""}`);
  }

  // --- 3. Assemblage et conversion ----------------------------------------
  bleu("== 3. Assemblage et conversion ==");
  const assemble = join(TRAVAIL, `note-${Date.now()}.wav`);
  const tAssemblage = chrono();
  await assemblerWavs(morceaux, assemble, outils);
  etapes.assemblage_ms = chrono() - tAssemblage;

  const ogg = join(TRAVAIL, `note-${Date.now()}.ogg`);
  const tConversion = chrono();
  const rapport = await preparerNoteVocale(assemble, ogg, outils);
  etapes.conversion_ms = chrono() - tConversion;
  const octets = await readFile(ogg);

  vert(`  ${rapport.conteneur} / ${rapport.codec}, ${rapport.echantillonnage} Hz, ${rapport.canaux} canal`);
  vert(`  ${rapport.dureeS} s, ${octets.length} octets, verdict ffprobe : ${rapport.valide ? "valide" : "INVALIDE"}`);
  if (!rapport.valide) {
    rouge(`  griefs : ${(rapport.griefs ?? []).join(" ; ")}`);
    process.exit(1);
  }
  // Une copie conservée : c'est la pièce à écouter si l'envoi échoue.
  const copie = join(racine, "donnees-locales", "derniere-note.ogg");
  writeFileSync(copie, octets);
  gris(`  copie conservee : ${copie}`);

  // --- 4. Session WhatsApp locale ------------------------------------------
  bleu("== 4. Session WhatsApp locale ==");
  gris("  Cette session est DISTINCTE de celle d'Altare, qui n'est pas touchee.");
  const { default: wweb } = await import("whatsapp-web.js");
  // Le chemin du navigateur est IMPOSE, et non cherche.
  //
  // Puppeteer le cherche dans son cache par defaut ; le laboratoire l'installe
  // ailleurs, pour que tout puisse disparaitre d'un seul rm -rf. Laisser
  // Puppeteer deviner donnerait « Could not find Chrome » alors qu'il est la.
  const chemins = [
    process.env.CHROMIUM_BIN,
    (() => {
      try {
        return readFileSync(join(process.env.GUERGNE_LOCAL ?? "", "chemin-chromium.txt"), "utf8").trim();
      } catch {
        return null;
      }
    })(),
  ].filter(Boolean);
  const navigateur = chemins[0] ?? null;
  gris(navigateur ? `  navigateur : ${navigateur}` : "  navigateur : celui que Puppeteer trouvera");

  const client = new wweb.Client({
    authStrategy: new wweb.LocalAuth({ clientId: "guergne-local", dataPath: SESSION }),
    puppeteer: {
      headless: true,
      ...(navigateur ? { executablePath: navigateur } : {}),
      // `--no-sandbox` : WSL2 n'a pas les espaces de noms utilisateur qu'exige
      // le bac a sable de Chromium. C'est aussi ce que fait la production.
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--mute-audio"],
    },
  });

  // AUCUN `client.on("message", …)`. Ce client n'ecoute pas : il envoie une
  // fois, puis se ferme. Deux agents repondant aux memes messages enverraient
  // deux reponses a de vraies familles.

  const pret = new Promise((resoudre, rejeter) => {
    client.on("qr", async (qr) => {
      bleu("\n  APPAIRAGE REQUIS");
      const { default: qrcode } = await import("qrcode");
      const png = join(racine, "donnees-locales", "qr-local.png");
      await qrcode.toFile(png, qr, { width: 512, margin: 2 });
      console.log(await qrcode.toString(qr, { type: "terminal", small: true }));
      gris(`  Image : ${png}`);
      console.log("  Sur le telephone de l'etablissement : WhatsApp > Appareils lies");
      console.log("  > Lier un appareil, puis scannez ce code.");
      gris("  Ceci ajoute un appareil lie. La session d'Altare reste valide.");
    });
    client.on("authenticated", () => vert("  authentifie"));
    client.on("ready", () => resoudre(true));
    client.on("auth_failure", (m) => rejeter(new Error(`appairage refuse : ${m}`)));
    client.on("disconnected", (r) => rejeter(new Error(`deconnecte : ${r}`)));
  });

  await client.initialize();
  // Trois minutes : le temps d'aller chercher le telephone et de scanner.
  const minuteur = new Promise((_, rejeter) =>
    setTimeout(() => rejeter(new Error("session non prete apres 180 s")), 180_000).unref(),
  );
  await Promise.race([pret, minuteur]);
  vert("  session prete");

  try {
    // --- 5. Résoudre le destinataire, sans fabriquer de JID ---------------
    bleu("== 5. Destinataire ==");
    // On DEMANDE son identifiant a WhatsApp. Composer `numero@c.us` a la main
    // marche souvent et echoue silencieusement depuis la migration vers les
    // LID : l'identifiant que nous composons n'est pas toujours celui qu'il
    // reconnait.
    const resolu = await client.getNumberId(numero);
    // `_serialized` est le nom que WhatsApp Web a renomme `$1` en juillet
    // 2026 — la cause exacte de l'erreur « r ». Le lire ici en dur ferait
    // echouer la resolution du destinataire a l'instant decisif, et le
    // message serait « WhatsApp ne reconnait pas ce numero », qui est faux.
    const jid = chaineIdentifiant(resolu);
    if (!jid) {
      rouge(`  ${masque(numero)} : WhatsApp n'a rendu aucun identifiant exploitable.`);
      gris(`  champs recus : ${resolu ? Object.keys(resolu).join(", ") : "aucune reponse"}`);
      process.exit(1);
    }
    vert(`  ${masque(numero)} resolu`);
    gris(`  serveur du JID : ${jid.split("@")[1]}`);

    // --- 6. L'historique AVANT tout envoi ---------------------------------
    bleu("== 6. Controle de doublon ==");
    // Un echec ambigu n'est pas une preuve de non-envoi. On regarde donc
    // l'historique AVANT, et non apres coup.
    const conversation = await client.getChatById(jid);
    const recents = await conversation.fetchMessages({ limit: 15 });
    const depuis = Date.now() - 30 * 60 * 1000;
    const dejaEnvoye = (recents ?? []).find(
      (m) => m?.fromMe && (m.type === "ptt" || m.type === "audio") && (m.timestamp ?? 0) * 1000 >= depuis,
    );
    if (dejaEnvoye) {
      rouge("  Une note vocale de nous figure DEJA dans la demi-heure ecoulee.");
      gris(`  identifiant : ${partieIdMessage(dejaEnvoye.id)}, ack : ${dejaEnvoye.ack}`);
      gris("  Aucun second envoi. Verifiez le telephone avant de relancer.");
      process.exit(3);
    }
    vert("  aucun envoi recent : la voie est libre");

    if (blanc) {
      bleu("\n== Essai a blanc : AUCUN envoi ==");
      console.log(JSON.stringify({ etapes, audio: rapport, destinataire: masque(numero) }, null, 2));
      return;
    }

    // --- 7. L'envoi, une seule fois ---------------------------------------
    bleu("== 7. Envoi ==");
    // Type MIME DEPOUILLE : `audio/ogg; codecs=opus` faisait rendre un type
    // indefini a WhatsApp Web, et son getter memoise echouait ensuite. Le
    // conteneur et le codec sont deja garantis par ffprobe.
    const media = new wweb.MessageMedia("audio/ogg", octets.toString("base64"), "note.ogg");
    const tEnvoi = chrono();
    const envoye = await client.sendMessage(jid, media, { sendAudioAsVoice: true });
    etapes.envoi_ms = chrono() - tEnvoi;
    const identifiant = serialiserIdMessage(envoye?.id);
    vert(`  accepte en ${etapes.envoi_ms} ms`);

    // --- 8. Acquittement : relu, jamais deduit ----------------------------
    bleu("== 8. Acquittement ==");
    const NOMS_ACK = { "-1": "erreur", 0: "en attente", 1: "parti du serveur", 2: "livre", 3: "lu", 4: "ecoute" };
    let dernier = null;
    // WhatsApp rend `ack: 0` a l'instant de l'acceptation : relire tout de
    // suite ne prouverait rien. On observe donc pendant quelques secondes.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const relu = identifiant ? await client.getMessageById(identifiant).catch(() => null) : null;
      const ack = typeof relu?.ack === "number" ? relu.ack : (envoye?.ack ?? null);
      if (ack !== dernier) {
        dernier = ack;
        vert(`  ack=${ack} (${NOMS_ACK[String(ack)] ?? "inconnu"})`);
      }
      if (ack >= 2) break;
    }

    // --- 9. La note est-elle dans l'historique, et est-ce bien un PTT ? ---
    bleu("== 9. Verification dans l'historique ==");
    const apres = await conversation.fetchMessages({ limit: 5 });
    const trouvee = (apres ?? []).find((m) => partieIdMessage(m.id) === partieIdMessage(envoye?.id));
    if (trouvee) {
      vert(`  presente, type « ${trouvee.type} »`);
      if (trouvee.type !== "ptt") {
        rouge("  ATTENTION : ce n'est pas un « ptt ». WhatsApp l'a traite comme un fichier audio,");
        rouge("  pas comme une note vocale.");
      }
    } else {
      rouge("  introuvable dans l'historique : envoi NON confirme.");
    }

    console.log(
      `\n${JSON.stringify(
        {
          destinataire: masque(numero),
          serveurJid: jid.split("@")[1],
          // La fraction opaque de l'identifiant : elle suffit a retrouver le
          // message, et ne porte aucun numero de telephone.
          messageId: partieIdMessage(envoye?.id),
          typeMedia: trouvee?.type ?? null,
          notesVocale: trouvee?.type === "ptt",
          ack: dernier,
          ackLecture: NOMS_ACK[String(dernier)] ?? "inconnu",
          audio: {
            format: `${rapport.conteneur} / ${rapport.codec}`,
            echantillonnage: rapport.echantillonnage,
            canaux: rapport.canaux,
            dureeS: rapport.dureeS,
            octets: octets.length,
          },
          etapes,
          avertissement:
            "« accepte » n'est pas « livre », et « livre » n'est pas « ecoute ». " +
            "Seul ack=4 constate une ecoute.",
        },
        null,
        2,
      )}`,
    );
  } finally {
    bleu("\n== Fermeture ==");
    // Le client se ferme TOUJOURS : un Chromium laisse ouvert garde la session
    // locale active, donc un appareil lie qui reste connecte pour rien.
    await client.destroy().catch((e) => gris(`  fermeture : ${resumerErreur(e)}`));
    await voix.shutdown().catch(() => {});
    for (const f of [...morceaux, assemble, ogg]) await unlink(f).catch(() => {});
    vert("  ferme");
  }
}

principal().catch((e) => {
  rouge(`\nInterrompu : ${resumerErreur(e, { max: 400 })}`);
  process.exit(1);
});
