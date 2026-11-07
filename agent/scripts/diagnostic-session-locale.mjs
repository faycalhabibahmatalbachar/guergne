/**
 * Diagnostic de la session WhatsApp locale, STRICTEMENT EN LECTURE.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Une note vocale a été créée, elle figure dans la conversation en type `ptt`
 * avec un identifiant réel — et son acquittement reste à 0 après deux minutes
 * et demie de session maintenue. Le message existe donc sans avoir été
 * transmis. Il faut savoir pourquoi avant de rien renvoyer.
 *
 * Ce script n'envoie rien, ne supprime rien, ne modifie rien. Il observe :
 * Chromium, la page, la socket de WhatsApp Web, l'appareil lié, et le message
 * déjà émis. Il écoute aussi les acquittements pendant un moment, parce qu'un
 * acquittement n'est pas une valeur qu'on lit une fois : c'est un événement
 * qui arrive, ou qui n'arrive jamais.
 *
 *   node scripts/diagnostic-session-locale.mjs --message 3EB0696B8C0E9C7F6A0312
 *
 * Options : --numero <chiffres>   la conversation à inspecter
 *           --ecouter <secondes>  durée d'écoute des acquittements (défaut 60)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");

const argv = process.argv.slice(2);
const option = (nom, defaut = null) => {
  const i = argv.indexOf(nom);
  return i >= 0 ? argv[i + 1] : defaut;
};
const idMessage = option("--message", "3EB0696B8C0E9C7F6A0312");
const numero = String(option("--numero", "23568663737")).replace(/\D/g, "");
const ecouterS = Number(option("--ecouter", "60")) || 60;

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);
const ligne = (c, v) => console.log(`  ${String(c).padEnd(26)} ${v}`);

const ACK = {
  "-1": "erreur",
  0: "en attente sur l'appareil",
  1: "parti du serveur",
  2: "LIVRE",
  3: "LU",
  4: "ECOUTE",
};

/** Taille d'un dossier, sans suivre les liens. */
function poids(chemin) {
  let total = 0;
  let fichiers = 0;
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (e.isFile()) {
        total += statSync(p).size;
        fichiers += 1;
      }
    }
  };
  try {
    parcourir(chemin);
  } catch {
    return null;
  }
  return { octets: total, fichiers };
}

async function principal() {
  // --- 0. Avant même d'ouvrir : qui tient la session ? --------------------
  bleu("== 0. La session sur le disque ==");
  ligne("dossier", SESSION);
  const p = poids(SESSION);
  ligne("contenu", p ? `${p.fichiers} fichier(s), ${Math.round(p.octets / 1024)} Ko` : "illisible");
  // Un verrou de Chrome encore présent signifie qu'une instance tourne — ou
  // qu'elle est morte en laissant sa trace. Les deux comptent.
  for (const v of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    const chemin = join(SESSION, `session-guergne-local`, v);
    ligne(`verrou ${v}`, existsSync(chemin) ? "PRESENT" : "absent");
  }

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

  const acquittements = [];
  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    journal: { info: (...m) => gris(`  ${m.join(" ")}`), warn: (...m) => gris(`  ${m.join(" ")}`), error: (...m) => rouge(`  ${m.join(" ")}`), log: () => {} },
  });

  try {
    bleu("\n== 1. Chromium et la page ==");
    await provider.connect();
    const debut = Date.now();
    while (provider.getConnectionStatus().state !== "ready") {
      if (Date.now() - debut > 8 * 60 * 1000) throw new Error("session non prete");
      await new Promise((r) => setTimeout(r, 2000));
    }
    const client = provider._client;

    ligne("etat du transport", provider.getConnectionStatus().state);
    ligne("navigateur connecte", String(client.pupBrowser?.isConnected?.() ?? "inconnu"));
    ligne("version du navigateur", await client.pupBrowser.version().catch(() => "inconnue"));
    ligne("page fermee", String(client.pupPage?.isClosed?.() ?? "inconnu"));
    ligne("url de la page", (client.pupPage?.url?.() ?? "inconnue").slice(0, 60));
    const pages = await client.pupBrowser.pages().catch(() => []);
    ligne("onglets ouverts", String(pages.length));

    // L'ECOUTE DES ACQUITTEMENTS COMMENCE ICI, avant toute lecture : un
    // acquittement n'est pas une valeur qu'on consulte, c'est un evenement qui
    // arrive — ou qui n'arrive jamais, et c'est alors cela qu'il faut voir.
    client.on("message_ack", (msg, ack) => {
      const partie = typeof msg?.id?.id === "string" ? msg.id.id : null;
      acquittements.push({ idPartie: partie, ack, le: new Date().toISOString() });
      vert(`  [ack] ${partie ?? "?"} -> ${ack} (${ACK[String(ack)] ?? "inconnu"})`);
    });
    client.on("change_state", (etat) => gris(`  [change_state] ${etat}`));
    client.on("disconnected", (r) => rouge(`  [disconnected] ${r}`));

    bleu("\n== 2. WhatsApp Web : socket, flux et appareil ==");
    const web = await client.pupPage.evaluate(async () => {
      const dire = (e) => (e && e.message ? `${e.name ?? "Error"}: ${e.message}`.slice(0, 180) : String(e).slice(0, 180));
      const r = {};
      try {
        const Socket = window.require("WAWebSocketModel").Socket;
        // `state` est l'etat de la socket, `stream` celui du flux de donnees.
        // Les deux peuvent diverger : une socket ouverte sur un flux ferme
        // explique exactement un message qui ne part pas.
        r.socket = {
          state: Socket?.state ?? null,
          stream: Socket?.stream ?? null,
          hasSynced: Socket?.hasSynced ?? null,
          canSend: typeof Socket?.canSend === "function" ? Socket.canSend() : (Socket?.canSend ?? null),
        };
      } catch (e) {
        r.socketErreur = dire(e);
      }
      try {
        const Conn = window.require("WAWebConnModel").Conn;
        r.connexion = {
          // Jamais le numero : seulement ce qui qualifie l'appareil.
          plateforme: Conn?.platform ?? null,
          versionWeb: Conn?.wid ? "wid present" : "wid absent",
          batterie: Conn?.battery ?? null,
          branche: Conn?.plugged ?? null,
          clientVersion: Conn?.clientVersion ?? null,
          phoneActive: Conn?.phoneActive ?? null,
          lidMode: Conn?.isLidAddressingMode ?? null,
        };
      } catch (e) {
        r.connexionErreur = dire(e);
      }
      try {
        // QUEL COMPTE TIENT CETTE SESSION ? C'est decisif.
        //
        // Si c'est celui du SUPER_ADMIN lui-meme, ses propres messages sont
        // « fromMe » : whatsapp-web.js n'emet alors pas d'evenement `message`
        // pour eux, et l'ecoute ne peut rien recevoir de lui, quoi qu'il
        // envoie. Cela expliquerait une ecoute saine qui ne voit jamais rien.
        //
        // QUATRE CHIFFRES, ET RIEN DE PLUS : de quoi trancher sans exposer le
        // numero.
        const { getMaybeMeLidUser, getMaybeMePnUser } = window.require("WAWebUserPrefsMeUser");
        const fin = (w) => {
          const u = String(w?.user ?? "");
          return u ? `•••${u.slice(-4)}` : null;
        };
        r.compteDeLaSession = {
          telephonique: fin(getMaybeMePnUser()),
          lid: fin(getMaybeMeLidUser()),
        };
      } catch (e) {
        r.compteErreur = dire(e);
      }
      try {
        r.navigateur = {
          enLigne: navigator.onLine,
          visibilite: document.visibilityState,
          // Une page masquee voit ses minuteurs ralentis par Chromium, ce qui
          // peut suffire a retarder une file d'envoi.
          masquee: document.hidden,
        };
      } catch (e) {
        r.navigateurErreur = dire(e);
      }
      return r;
    });
    console.log(JSON.stringify(web, null, 2));

    bleu("\n== 3. Le message deja emis ==");
    const msg = await client.pupPage.evaluate(
      async (num, partieId) => {
        const dire = (e) => (e && e.message ? `${e.name ?? "Error"}: ${e.message}`.slice(0, 180) : String(e).slice(0, 180));
        try {
          const chat = await window.WWebJS.getChat(`${num}@c.us`, { getAsModel: false });
          if (!chat) return { erreur: "conversation introuvable" };
          const tous = chat.msgs?.getModelsArray?.() ?? [];
          const cible = tous.find((m) => m?.id?.id === partieId);
          const r = {
            conversation: {
              serveur: chat.id?.server ?? null,
              messagesEnMemoire: tous.length,
              // Une conversation non chargee n'envoie pas : WhatsApp Web
              // n'emet que depuis un etat synchronise.
              aDesMessagesNonLus: chat.unreadCount ?? null,
              estArchivee: chat.archive ?? null,
            },
            trouve: Boolean(cible),
          };
          if (cible) {
            r.message = {
              type: cible.type ?? null,
              ack: typeof cible.ack === "number" ? cible.ack : null,
              estNouveau: cible.isNewMsg ?? null,
              // `mediaStage` dit ou en est le media. « RESOLVED » signifie
              // televerse ; tout autre etat signifie qu'il n'est pas parti.
              mediaStage: cible.mediaData?.mediaStage ?? null,
              aDirectPath: Boolean(cible.directPath),
              aMediaKey: Boolean(cible.mediaKey),
              aFilehash: Boolean(cible.filehash),
              aEncFilehash: Boolean(cible.encFilehash),
              aClientUrl: Boolean(cible.clientUrl),
              taille: cible.size ?? null,
              dureeS: cible.duration ?? null,
              mimetype: cible.mimetype ?? null,
              instant: cible.t ? new Date(cible.t * 1000).toISOString() : null,
            };
          }
          return r;
        } catch (e) {
          return { erreur: dire(e) };
        }
      },
      numero,
      idMessage,
    );
    console.log(JSON.stringify(msg, null, 2));

    bleu(`\n== 4. Ecoute des acquittements, ${ecouterS} s ==`);
    gris("  Un acquittement est un evenement. S'il n'en arrive aucun, c'est le fait.");
    await new Promise((r) => setTimeout(r, ecouterS * 1000));
    if (acquittements.length === 0) {
      rouge(`  AUCUN acquittement en ${ecouterS} s.`);
    } else {
      vert(`  ${acquittements.length} acquittement(s) observe(s).`);
      for (const a of acquittements) console.log(`    ${a.le}  ${a.idPartie ?? "?"} -> ${a.ack}`);
    }

    bleu("\n== 5. Relecture finale du message ==");
    const apres = await client.pupPage.evaluate(
      async (num, partieId) => {
        try {
          const chat = await window.WWebJS.getChat(`${num}@c.us`, { getAsModel: false });
          const tous = chat?.msgs?.getModelsArray?.() ?? [];
          const cible = tous.find((m) => m?.id?.id === partieId);
          return cible ? { ack: cible.ack ?? null, mediaStage: cible.mediaData?.mediaStage ?? null } : { absent: true };
        } catch {
          return { illisible: true };
        }
      },
      numero,
      idMessage,
    );
    ligne("acquittement", `${apres.ack ?? "null"} — ${ACK[String(apres.ack)] ?? "inconnu"}`);
    ligne("etape du media", apres.mediaStage ?? "null");

    bleu("\n== Lecture ==");
    const s = web.socket ?? {};
    if (s.state !== "CONNECTED") {
      rouge(`  La socket n'est pas CONNECTED mais « ${s.state} » : rien ne peut partir.`);
    } else if (s.stream && s.stream !== "CONNECTED") {
      rouge(`  Socket CONNECTED mais flux « ${s.stream} » : la session ne transmet pas.`);
    } else if ((apres.ack ?? 0) === 0 && apres.mediaStage && apres.mediaStage !== "RESOLVED") {
      rouge(`  Le media est reste a l'etape « ${apres.mediaStage} » : il n'a jamais ete televerse.`);
      gris("  Le message existe donc localement sans contenu transmissible.");
    } else if ((apres.ack ?? 0) === 0) {
      rouge("  Socket et flux sont bons, le media aussi, et l'acquittement reste a 0.");
      gris("  Le defaut est alors dans l'emission elle-meme, non dans la preparation.");
    } else {
      vert(`  Acquittement ${apres.ack} : le message a quitte l'appareil.`);
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
