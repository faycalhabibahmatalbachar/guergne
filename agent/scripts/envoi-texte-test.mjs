/**
 * UN message texte de contrôle, pour isoler le défaut.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * La note vocale existe dans la conversation en type `ptt`, avec son
 * identifiant, et son acquittement reste à 0. Le diagnostic montre une socket
 * et un flux `CONNECTED`, une page saine, un seul client — et un média resté à
 * l'étape `PREPARING`.
 *
 * Deux lectures restent possibles, et une seule mesure les sépare :
 *   soit cette session n'émet rien du tout,
 *   soit elle émet, et seul le chemin des médias est rompu.
 *
 * Un message texte tranche. S'il obtient un acquittement, le défaut est
 * circonscrit aux médias — ce qui est une bonne nouvelle, car c'est alors une
 * seule étape à corriger et non une session à réappairer.
 *
 * CE QUI REND CET ENVOI IMPOSSIBLE PAR ACCIDENT
 * ----------------------------------------------
 * Sans `--je-confirme`, le script fait tout sauf envoyer. Le texte est figé
 * ici, il annonce ce qu'il est dès le premier mot, et il dit explicitement
 * qu'aucun traitement scolaire n'est attendu — pour qu'un destinataire qui le
 * lit sans contexte ne croie pas à une demande.
 *
 *   node scripts/envoi-texte-test.mjs --numero 23568663737             (a blanc)
 *   node scripts/envoi-texte-test.mjs --numero 23568663737 --je-confirme
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { jidUtilisateur } from "../src/jid.js";
import { decrireErreur, resumerErreur } from "../src/erreurs.js";
import { partieIdMessage } from "../src/providers/identifiant-message.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");

/** Le texte, composé ici et nulle part ailleurs. */
const TEXTE =
  "TEST TECHNIQUE — Vérification de la transmission WhatsApp de l'assistant " +
  "scolaire. Aucun traitement scolaire à effectuer.";

const argv = process.argv.slice(2);
const option = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const numero = String(option("--numero", "")).replace(/\D/g, "");
const confirme = argv.includes("--je-confirme");
if (!numero) {
  console.error("usage : node envoi-texte-test.mjs --numero <chiffres> [--je-confirme]");
  process.exit(2);
}

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

const ACK = { "-1": "erreur", 0: "en attente sur l'appareil", 1: "parti du serveur", 2: "LIVRE", 3: "LU", 4: "ECOUTE" };
const masque = (n) => `${n.slice(0, 3)}${"•".repeat(Math.max(0, n.length - 7))}${n.slice(-4)}`;

async function principal() {
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

  // Le registre, comme pour le vocal : notre propre trace est la seule source
  // autoritative sur ce que NOUS avons envoye.
  const registre = join(racine, "donnees-locales", "envois-texte.json");
  let passes = [];
  try {
    passes = JSON.parse(readFileSync(registre, "utf8"));
  } catch {
    /* premier envoi */
  }
  const recent = passes.find((e) => Date.now() - (e.le ?? 0) < 30 * 60 * 1000);
  if (recent) {
    rouge("  Un texte de controle a DEJA ete envoye dans la demi-heure.");
    gris(`  id ${recent.idPartie ?? "?"}, ack ${recent.ack ?? "?"}`);
    process.exit(3);
  }

  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    journal: { info: (...m) => gris(`  ${m.join(" ")}`), warn: () => {}, error: (...m) => rouge(`  ${m.join(" ")}`), log: () => {} },
  });

  const acquittements = [];
  try {
    bleu("== Session ==");
    await provider.connect();
    const debut = Date.now();
    while (provider.getConnectionStatus().state !== "ready") {
      if (Date.now() - debut > 8 * 60 * 1000) throw new Error("session non prete");
      await new Promise((r) => setTimeout(r, 2000));
    }
    vert("  prete");
    provider._client.on("message_ack", (m, ack) => {
      const p = partieIdMessage(m?.id);
      acquittements.push({ idPartie: p, ack });
      vert(`  [ack] ${p ?? "?"} -> ${ack} (${ACK[String(ack)] ?? "inconnu"})`);
    });

    const jid = jidUtilisateur(numero);
    bleu("\n== Destinataire ==");
    gris(`  ${masque(numero)} -> @${jid.split("@")[1]}`);

    bleu("\n== Texte ==");
    console.log(`  « ${TEXTE} »`);
    gris(`  ${TEXTE.length} caracteres`);

    if (!confirme) {
      bleu("\n== A blanc : AUCUN envoi ==");
      gris("  Relancez avec --je-confirme pour envoyer ce message, une fois.");
      return;
    }

    bleu("\n== Envoi ==");
    const r = await provider.sendText(jid, TEXTE);
    const id = r?.id ?? null;
    vert(`  accepte — id ${r?.idPartie ?? "null"}, ack a l'acceptation ${r?.ack ?? "null"}`);
    passes.push({ le: Date.now(), idPartie: r?.idPartie ?? null, ack: r?.ack ?? null });
    writeFileSync(registre, `${JSON.stringify(passes, null, 2)}\n`);

    bleu("\n== Acquittement, 90 s ==");
    // On RESTE en ligne : un appareil lie doit l'etre le temps que le message
    // parte. Le vocal avait ete coupe quinze secondes apres l'envoi.
    let dernier = r?.ack ?? null;
    for (let i = 0; i < 18; i++) {
      await new Promise((x) => setTimeout(x, 5000));
      if (!id) continue;
      const relu = await provider.acquittement(id);
      if (relu.ack !== null && relu.ack !== dernier) {
        dernier = relu.ack;
        vert(`  ack=${relu.ack} (${relu.etat})`);
      }
      if ((relu.ack ?? -99) >= 2) break;
    }

    bleu("\n== Verdict ==");
    // L'EVENEMENT, ET NON LA RELECTURE.
    //
    // Ma premiere version jugeait sur `provider.acquittement(id)`. Or cet `id`
    // est null : la passerelle rend un `Message` sans identifiant exploitable.
    // Le verdict annoncait donc « le texte ne part pas » alors que les
    // evenements `message_ack` montraient ack 1 puis ack 2, LIVRE. Une mesure
    // qui interroge une source vide ne rend pas « inconnu » : elle rend faux,
    // et un faux negatif coute aussi cher qu'un faux positif.
    const parEvenement = acquittements.reduce((m, a) => Math.max(m, a.ack ?? -99), -99);
    if (parEvenement > (dernier ?? -99)) dernier = parEvenement;
    if (dernier !== null && dernier < -1) dernier = null;
    if ((dernier ?? 0) >= 1) {
      vert(`  LE TEXTE PART : ack ${dernier} (${ACK[String(dernier)] ?? "inconnu"}).`);
      gris("  La session emet. Le defaut est donc circonscrit au chemin des medias.");
    } else {
      rouge(`  Le texte NE part pas non plus : ack ${dernier ?? "null"}.`);
      gris("  Ce n'est pas le chemin des medias : c'est la session qui n'emet rien.");
    }
    console.log(
      `\n${JSON.stringify(
        { destinataire: masque(numero), messageId: r?.idPartie ?? null, ack: dernier, acquittementsObserves: acquittements },
        null,
        2,
      )}`,
    );
  } catch (e) {
    rouge(`\n  Echec : ${resumerErreur(e, { max: 200 })}`);
    console.error(JSON.stringify(decrireErreur(e), null, 2));
    process.exitCode = 1;
  } finally {
    bleu("\n== Fermeture ==");
    await provider.disconnect().catch((e) => gris(`  ${resumerErreur(e)}`));
    vert("  ferme");
  }
}

principal().catch((e) => {
  rouge(`Interrompu : ${resumerErreur(e, { max: 300 })}`);
  process.exit(1);
});
