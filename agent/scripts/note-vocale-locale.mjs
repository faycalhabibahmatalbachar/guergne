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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { jidUtilisateur } from "../src/jid.js";
import { FournisseurPiper } from "../src/voix/piper.js";
import { assemblerWavs, preparerNoteVocale } from "../src/voix/audio.js";
import { PARTIES_BILINGUES } from "../src/voix/diagnostic-voix.js";
import { chaineIdentifiant } from "../src/providers/identifiant-message.js";
import { decrireErreur, resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Arguments --------------------------------------------------------------
const argv = process.argv.slice(2);
const valeur = (nom) => {
  const i = argv.indexOf(nom);
  return i >= 0 ? argv[i + 1] : null;
};
const numero = (valeur("--numero") ?? "").replace(/[^\d]/g, "");
const blanc = argv.includes("--blanc");
/**
 * Type MIME du media, reglable.
 *
 * POURQUOI C'EST UNE OPTION ET NON UNE CONSTANTE
 * -----------------------------------------------
 * `processMediaData` appelle `getOrCreateMediaObject(mediaData.filehash)`
 * AVANT de verifier que `filehash` existe. Quand WhatsApp Web ne reconnait pas
 * le media comme de l'audio, `filehash` vaut `undefined`, et le getter
 * memoise leve « Data passed to getter must include an id property ».
 *
 * La reconnaissance depend du type MIME. WhatsApp etiquette ses propres notes
 * vocales `audio/ogg; codecs=opus` — avec le parametre. J'avais justement
 * DEPOUILLE ce parametre en production, sur une hypothese inverse, et l'envoi
 * echouait toujours. C'est donc la premiere variable a eprouver, et une
 * option permet de le faire sans toucher au transport.
 */
const mimetype = valeur("--mimetype") ?? "audio/ogg; codecs=opus";

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
/** Chemin de la copie conservee, renseigne apres la conversion. */
let copie = null;

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
  copie = join(racine, "donnees-locales", "derniere-note.ogg");
  writeFileSync(copie, octets);
  gris(`  copie conservee : ${copie}`);

  // --- 4. Session WhatsApp, par le transport de PRODUCTION ----------------
  //
  // POURQUOI LE VRAI TRANSPORT, ET NON UN CHEMIN PARALLELE
  // -------------------------------------------------------
  // La premiere version appelait `client.sendMessage` directement. C'etait un
  // second chemin d'envoi, et il ne prouvait rien du premier : tout ce qui a
  // ete corrige dans `src/providers/wwebjs.js` — la reparation des
  // identifiants, les trois voies d'envoi, le controle de doublon par
  // l'historique, la relecture de l'acquittement — restait non eprouve.
  //
  // Ce script utilise donc `WwebjsProvider`, exactement comme l'agent. Il
  // n'enregistre AUCUN gestionnaire de message : le transport trace alors
  // « handler_absent » et n'appelle personne. C'est un appareil lie en
  // ecriture seule, le temps d'un envoi.
  const sessionExistante = existsSync(join(SESSION, "session-guergne-local"));
  if (blanc && !sessionExistante) {
    bleu("== Essai a blanc : la chaine audio est validee ==");
    console.log(JSON.stringify({ etapes, audio: rapport, fichier: copie }, null, 2));
    gris("\nAucune session locale appairee : WhatsApp n'a pas ete lance.");
    await voix.shutdown().catch(() => {});
    for (const f of [...morceaux, assemble, ogg]) await unlink(f).catch(() => {});
    return;
  }

  bleu("== 4. Session WhatsApp locale ==");
  gris("  Cette session est DISTINCTE de celle d'Altare, qui n'est pas touchee.");
  // Puppeteer cherche Chromium dans son cache par defaut ; le laboratoire
  // l'installe ailleurs. Le transport lit `PUPPETEER_EXECUTABLE_PATH`.
  if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
    try {
      process.env.PUPPETEER_EXECUTABLE_PATH = readFileSync(
        join(process.env.GUERGNE_LOCAL ?? "", "chemin-chromium.txt"),
        "utf8",
      ).trim();
    } catch {
      /* Puppeteer cherchera lui-meme */
    }
  }
  gris(`  navigateur : ${process.env.PUPPETEER_EXECUTABLE_PATH ?? "celui que Puppeteer trouvera"}`);

  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    surQr: async (qr) => {
      bleu("\n  APPAIRAGE REQUIS");
      const { default: qrcode } = await import("qrcode");
      const png = join(racine, "donnees-locales", "qr-local.png");
      await qrcode.toFile(png, qr, { width: 512, margin: 2 });
      console.log(await qrcode.toString(qr, { type: "terminal", small: true }));
      gris(`  Image : ${png}`);
      console.log("  Telephone de l'etablissement : WhatsApp > Appareils lies > Lier un appareil");
    },
    journal: {
      info: (...m) => gris(`  ${m.join(" ")}`),
      warn: (...m) => gris(`  ${m.join(" ")}`),
      error: (...m) => rouge(`  ${m.join(" ")}`),
      log: () => {},
    },
  });
  // AUCUN `provider.onMessage(...)`. Ce client n'ecoute pas.

  try {
    await provider.connect();
    const FENETRE_MS = Number(process.env.FENETRE_APPAIRAGE_MS ?? 10 * 60 * 1000);
    const debutAttente = chrono();
    // `.state`, ET NON L'OBJET LUI-MEME.
    //
    // `getConnectionStatus()` rend `{ state, reconnexions, machine }`. Compare
    // a la chaine « ready », cet objet ne l'egale jamais : la boucle tournait
    // indefiniment alors que la session etait prete depuis la premiere
    // seconde. Faute de ma part, et elle a coute dix minutes d'attente sur une
    // session qui fonctionnait.
    while (provider.getConnectionStatus().state !== "ready") {
      if (chrono() - debutAttente > FENETRE_MS) {
        throw new Error(`session non prete apres ${Math.round(FENETRE_MS / 1000)} s`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    etapes.session_ms = chrono() - debutAttente;
    vert(`  session prete en ${etapes.session_ms} ms`);

    // --- 5. Destinataire : deux adresses, et la bonne en premier ----------
    bleu("== 5. Destinataire ==");
    // `getNumberId` CONFIRME que le numero est inscrit sur WhatsApp. Mais il
    // rend aujourd'hui une adresse « @lid », et `createWid` la REFUSE :
    // `getChatById` et l'envoi levent alors la meme erreur minifiee d'une
    // lettre. C'est ce qui a interrompu la tentative precedente.
    //
    // On envoie donc au JID TELEPHONIQUE, construit par le constructeur
    // canonique du projet a partir du numero que WhatsApp vient de confirmer
    // — ce n'est pas une adresse inventee. Le LID reste en second recours.
    const resolu = await provider._client.getNumberId(numero);
    const lid = chaineIdentifiant(resolu);
    if (!lid) {
      rouge(`  ${masque(numero)} : WhatsApp n'a rendu aucun identifiant exploitable.`);
      gris(`  champs recus : ${resolu ? Object.keys(resolu).join(", ") : "aucune reponse"}`);
      process.exit(1);
    }
    vert(`  ${masque(numero)} inscrit sur WhatsApp`);
    gris(`  serveur rendu par getNumberId : ${lid.split("@")[1]}`);

    const telephonique = jidUtilisateur(numero);
    const adresses = [telephonique];
    if (lid !== telephonique) adresses.push(lid);
    gris(`  adresses a essayer : ${adresses.map((x) => x.split("@")[1]).join(" puis ")}`);
    gris(`  type MIME annonce : ${mimetype}`);

    // --- 6. Doublon : notre propre registre, qui ne depend de rien --------
    bleu("== 6. Controle de doublon ==");
    // L'HISTORIQUE DE WHATSAPP N'EST PAS UNE SOURCE FIABLE ICI.
    //
    // Le lire exige `getChatById`, qui echoue sur une adresse LID. Un
    // garde-fou qui depend du defaut qu'il surveille n'en est pas un. Notre
    // registre, lui, est autoritatif sur ce que NOUS avons envoye, et c'est
    // la seule question qui compte pour ne pas doubler.
    const registre = join(racine, "donnees-locales", "envois.json");
    let passes = [];
    try {
      passes = JSON.parse(readFileSync(registre, "utf8"));
    } catch {
      /* premier envoi */
    }
    const recent = passes.find((e) => chrono() - (e.le ?? 0) < 30 * 60 * 1000);
    if (recent) {
      rouge("  Un envoi figure DEJA dans la demi-heure ecoulee.");
      gris(`  identifiant : ${recent.idPartie ?? "?"}, voie : ${recent.voie ?? "?"}, ack : ${recent.ack ?? "?"}`);
      gris("  Aucun second envoi. Verifiez le telephone avant de relancer.");
      process.exit(3);
    }
    vert(`  aucun envoi recent enregistre (${passes.length} dans l'historique du registre)`);

    if (blanc) {
      bleu("\n== Essai a blanc : AUCUN envoi ==");
      console.log(
        JSON.stringify(
          { etapes, audio: rapport, destinataire: masque(numero), adresses: adresses.map((x) => x.split("@")[1]) },
          null,
          2,
        ),
      );
      return;
    }

    // --- 7. L'envoi, par `sendAudio` du transport -------------------------
    bleu("== 7. Envoi ==");
    let envoi = null;
    let derniere = null;
    for (const adresse of adresses) {
      try {
        gris(`  tentative sur @${adresse.split("@")[1]}`);
        envoi = await provider.sendAudio(adresse, { data: octets, mimetype });
        if (envoi?.ok) {
          etapes.adresse_retenue = adresse.split("@")[1];
          break;
        }
      } catch (e) {
        derniere = e;
        rouge(`  @${adresse.split("@")[1]} : ${resumerErreur(e, { max: 160 })}`);
        // `sendAudio` consulte lui-meme l'historique entre ses voies : s'il
        // leve, c'est qu'aucune note n'est partie par cette adresse.
      }
    }
    if (!envoi?.ok) {
      rouge("\n  Aucune adresse n'a abouti.");
      console.error(JSON.stringify(decrireErreur(derniere), null, 2));
      process.exit(5);
    }
    vert(`  accepte par la voie « ${envoi.voie} » sur @${etapes.adresse_retenue}`);

    // Le registre AVANT toute autre chose : si le processus mourait ici, un
    // second lancement ne doit pas renvoyer.
    passes.push({
      le: chrono(),
      idPartie: envoi.idPartie,
      voie: envoi.voie,
      ack: envoi.ack,
      adresse: etapes.adresse_retenue,
    });
    writeFileSync(registre, `${JSON.stringify(passes, null, 2)}\n`);
    gris(`  envoi consigne dans ${registre}`);

    // --- 8. Acquittement : relu, jamais deduit ---------------------------
    bleu("== 8. Acquittement ==");
    const NOMS_ACK = { "-1": "erreur", 0: "en attente", 1: "parti du serveur", 2: "livre", 3: "lu", 4: "ecoute" };
    let dernierAck = typeof envoi.ack === "number" ? envoi.ack : null;
    gris(`  a l'acceptation : ack=${dernierAck} (${NOMS_ACK[String(dernierAck)] ?? "inconnu"})`);
    // WhatsApp rend `ack: 0` a l'instant de l'acceptation : relire tout de
    // suite ne prouverait rien. On observe donc pendant quelques secondes.
    if (envoi.id) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const relu = await provider.acquittement(envoi.id);
        if (relu.ack !== null && relu.ack !== dernierAck) {
          dernierAck = relu.ack;
          vert(`  ack=${relu.ack} (${relu.etat})`);
        }
        if ((relu.ack ?? -99) >= 2) break;
      }
    }

    console.log(
      `\n${JSON.stringify(
        {
          destinataire: masque(numero),
          adresse: `@${etapes.adresse_retenue}`,
          voieEnvoi: envoi.voie,
          messageId: envoi.idPartie,
          ack: dernierAck,
          ackLecture: NOMS_ACK[String(dernierAck)] ?? "inconnu",
          doublonEvite: Boolean(envoi.doublonEvite),
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
    // Le transport se ferme TOUJOURS : un Chromium laisse ouvert garde la
    // session locale active, donc un appareil lie connecte pour rien.
    await provider.disconnect().catch((e) => gris(`  fermeture : ${resumerErreur(e)}`));
    await voix.shutdown().catch(() => {});
    for (const f of [...morceaux, assemble, ogg]) await unlink(f).catch(() => {});
    vert("  ferme");
  }
}


principal().catch((e) => {
  // La description COMPLETE, et non le resume. « Interrompu : r » ne dit pas
  // d'ou : c'est exactement ce qui a coute une soiree de diagnostic, et cela
  // s'est reproduit deux fois sur ce script avant que la trace le dise.
  rouge(`\nInterrompu : ${resumerErreur(e, { max: 400 })}`);
  console.error(JSON.stringify(decrireErreur(e), null, 2));
  process.exit(1);
});
