/**
 * Que montre l'historique de la conversation, après un envoi ?
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * L'envoi a été accepté — « voie direct » — mais la passerelle a rendu un
 * objet `Message` sans identifiant exploitable : `messageId: null`, `ack:
 * null`. « Accepté » n'est pas « livré », et sans identifiant il est
 * impossible de relire l'acquittement. Affirmer la livraison serait une
 * invention.
 *
 * Reste une source, et une seule : l'historique de la conversation, tel que
 * la page le détient.
 *
 * POURQUOI IL N'UTILISE PAS `getChatById`
 * ----------------------------------------
 * `Chat.fetchMessages` et `getChatModel` échouent sur cette conversation —
 * adressée par LID, elle déclenche la même erreur minifiée d'une lettre.
 * Mais `WWebJS.getChat(id, { getAsModel: false })` fonctionne, c'est mesuré :
 * il rend le modèle vivant de la page, dont on lit `msgs` directement. On
 * contourne donc la couche cassée au lieu de l'attendre.
 *
 *   node scripts/verifier-envoi.mjs --numero 23568663737
 *
 * IL NE FAIT QUE LIRE. Aucun envoi, aucune modification.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");

const argv = process.argv.slice(2);
const i = argv.indexOf("--numero");
const numero = (i >= 0 ? argv[i + 1] : "").replace(/\D/g, "");
/**
 * Combien de secondes rester en ligne, pour laisser WhatsApp vider sa file.
 *
 * Un appareil lié doit rester connecté le temps que le message parte. Le
 * premier envoi est ressorti en `ack: 0` parce que le navigateur avait été
 * fermé quinze secondes après — l'envoi était fait, la transmission non.
 */
const attendreS =
  Number(
    (() => {
      const j = argv.indexOf("--attendre");
      return j >= 0 ? argv[j + 1] : 0;
    })(),
  ) || 0;
if (!numero) {
  console.error("usage : node verifier-envoi.mjs --numero <chiffres>");
  process.exit(2);
}

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

/** Les codes d'acquittement de WhatsApp, et ce qu'ils constatent vraiment. */
const ACK = {
  "-1": "erreur",
  0: "en attente sur l'appareil",
  1: "parti du serveur",
  2: "LIVRE au destinataire",
  3: "LU",
  4: "ECOUTE",
};

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

  bleu("== Ce que notre registre a consigne ==");
  try {
    const registre = JSON.parse(readFileSync(join(racine, "donnees-locales", "envois.json"), "utf8"));
    for (const e of registre) {
      console.log(`  ${new Date(e.le).toISOString()}  voie ${e.voie}  @${e.adresse}  id ${e.idPartie ?? "null"}  ack ${e.ack ?? "null"}`);
    }
  } catch {
    gris("  aucun registre");
  }

  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    journal: { info: (...m) => gris(`  ${m.join(" ")}`), warn: () => {}, error: (...m) => rouge(`  ${m.join(" ")}`), log: () => {} },
  });

  try {
    bleu("\n== Session ==");
    await provider.connect();
    const debut = Date.now();
    while (provider.getConnectionStatus().state !== "ready") {
      if (Date.now() - debut > 10 * 60 * 1000) throw new Error("session non prete");
      await new Promise((r) => setTimeout(r, 2000));
    }
    vert("  prete");

    bleu("\n== Les derniers messages de la conversation ==");
    const lire = async () => provider._client.pupPage.evaluate(async (num) => {
      const dire = (e) => (e && e.message ? `${e.name ?? "Error"}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200));
      try {
        // `getAsModel: false` : on veut le modele vivant, sans passer par
        // `getChatModel`, qui echoue sur une conversation adressee par LID.
        const chat = await window.WWebJS.getChat(`${num}@c.us`, { getAsModel: false });
        if (!chat) return { erreur: "conversation introuvable" };
        const tous = chat.msgs?.getModelsArray?.() ?? [];
        return {
          nombre: tous.length,
          derniers: tous.slice(-8).map((m) => ({
            deNous: Boolean(m.id?.fromMe),
            type: m.type ?? null,
            // La fraction opaque seulement : l'identifiant complet porte le
            // numero du correspondant.
            idPartie: typeof m.id?.id === "string" ? m.id.id : null,
            ack: typeof m.ack === "number" ? m.ack : null,
            instant: m.t ? new Date(m.t * 1000).toISOString() : null,
            dureeS: m.duration ?? null,
            octets: m.size ?? null,
            mimetype: m.mimetype ?? null,
          })),
        };
      } catch (e) {
        return { erreur: dire(e) };
      }
    }, numero);

    let messages = await lire();

    // RESTER EN LIGNE NE RENVOIE RIEN.
    //
    // Le premier envoi est ressorti avec `ack: 0` — « en attente sur
    // l'appareil ». Ce n'etait pas un echec, mais la consequence d'avoir ferme
    // le navigateur quinze secondes apres l'envoi : un appareil lie doit
    // rester connecte le temps que WhatsApp vide sa file. C'est le MEME
    // message, avec le meme identifiant, qui finit de partir — aucun risque de
    // doublon.
    if (attendreS > 0 && !messages.erreur) {
      const fin = Date.now() + attendreS * 1000;
      let precedent = null;
      while (Date.now() < fin) {
        const notres = (messages.derniers ?? []).filter((m) => m.deNous && (m.type === "ptt" || m.type === "audio"));
        const ack = notres.length ? notres[notres.length - 1].ack : null;
        if (ack !== precedent) {
          gris(`  ack ${ack ?? "null"} — ${ACK[String(ack)] ?? "inconnu"}  (${Math.round((fin - Date.now()) / 1000)} s restantes)`);
          precedent = ack;
        }
        if ((ack ?? -99) >= 2) break;
        await new Promise((r) => setTimeout(r, 5000));
        messages = await lire();
      }
    }

    if (messages.erreur) {
      rouge(`  historique illisible : ${messages.erreur}`);
      return;
    }

    console.log(`  ${messages.nombre} message(s) dans la conversation\n`);
    for (const m of messages.derniers) {
      const sens = m.deNous ? "NOUS ->" : "    <-";
      const acq = m.ack === null ? "" : `  ack ${m.ack} (${ACK[String(m.ack)] ?? "inconnu"})`;
      const media = m.type === "ptt" || m.type === "audio" ? `  ${m.dureeS ?? "?"} s  ${m.mimetype ?? "?"}` : "";
      console.log(`  ${sens}  ${String(m.type).padEnd(9)} ${m.instant ?? "?"}  id ${m.idPartie ?? "null"}${acq}${media}`);
    }

    bleu("\n== Verdict ==");
    const notres = messages.derniers.filter((m) => m.deNous && (m.type === "ptt" || m.type === "audio"));
    if (notres.length === 0) {
      rouge("  AUCUNE note vocale de nous dans l'historique.");
      gris("  L'envoi a ete accepte par la passerelle, mais rien n'en subsiste :");
      gris("  il n'a donc PAS abouti. Ne pas le presenter comme envoye.");
      return;
    }
    const derniere = notres[notres.length - 1];
    if (derniere.type === "ptt") {
      vert("  Une NOTE VOCALE (« ptt ») de nous figure dans l'historique.");
    } else {
      rouge("  Un fichier audio de nous figure, mais son type est « audio » et non « ptt ».");
      rouge("  WhatsApp l'a traite comme une piece jointe, pas comme une note vocale.");
    }
    console.log(`  identifiant ${derniere.idPartie ?? "null"}`);
    console.log(`  acquittement ${derniere.ack ?? "null"} — ${ACK[String(derniere.ack)] ?? "inconnu"}`);
    if ((derniere.ack ?? -99) >= 2) {
      vert("  LIVRAISON CONSTATEE par WhatsApp.");
    } else {
      gris("  La livraison n'est pas encore constatee : ack inferieur a 2.");
      gris("  Seul le telephone du destinataire tranche a ce stade.");
    }
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
