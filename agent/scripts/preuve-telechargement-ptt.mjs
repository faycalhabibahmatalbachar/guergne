/**
 * La PREUVE que le téléchargement d'une note vocale passe par notre
 * fournisseur corrigé — octets, empreinte, en-tête.
 *
 * La sonde `sonde-contrat-media.mjs` a établi le contrat : il manquait
 * `mimetype` à l'appel. Mais prouver l'appel nu ne prouve pas le CHEMIN :
 * ce script appelle `WwebjsProvider.getMedia()`, celui que l'agent utilise,
 * sur une note vocale déjà présente dans la page. Rien n'est envoyé, rien
 * n'est supprimé, aucune nouvelle note n'est demandée.
 *
 *   node scripts/preuve-telechargement-ptt.mjs
 *
 * Il écrit le média dans `donnees-locales/entrant/` et rapporte sa taille,
 * son empreinte SHA-256 et ses premiers octets, pour que FFprobe puisse
 * ensuite l'inspecter. Aucune clé n'est journalisée.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

/**
 * LE BRUIT QUI MASQUAIT LA VRAIE ERREUR.
 *
 * whatsapp-web.js relance periodiquement son injection dans la page. Quand on
 * ferme le navigateur, cette promesse est rejetee — « Target closed » — et ce
 * rejet non gere tuait le processus AVANT que notre propre message d'erreur
 * s'affiche. On le nomme, sans tomber, mais seulement pendant la fermeture.
 */
let fermeture = false;
process.on("unhandledRejection", (e) => {
  if (fermeture) {
    gris(`  (rejet ignore apres fermeture : ${resumerErreur(e, { max: 120 })})`);
    return;
  }
  rouge(`Rejet non gere : ${resumerErreur(e, { max: 300 })}`);
  process.exit(1);
});

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

  const traces = [];
  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    journal: {
      info: (...m) => gris(`  ${m.join(" ")}`),
      warn: () => {},
      error: (...m) => rouge(`  ${m.join(" ")}`),
      log: (ligne) => traces.push(ligne),
    },
  });

  try {
    bleu("== Session ==");
    await provider.connect();
    const debut = Date.now();
    while (provider.getConnectionStatus().state !== "ready") {
      if (Date.now() - debut > 8 * 60 * 1000) throw new Error("session non prete");
      await new Promise((r) => setTimeout(r, 2000));
    }
    vert("  prete");

    bleu("\n== La note vocale a relire ==");
    // DEUX VOIES ESSAYEES, ET POURQUOI IL RESTE CELLE-CI.
    //
    // `client.getChats()` serait la voie propre, mais elle echoue ici sur la
    // meme erreur minifiee d'une lettre — « r » — que `downloadMedia()` : les
    // modeles de la page ne traversent pas la passerelle Puppeteer avec leurs
    // accesseurs. Et interroger le magasin juste apres « ready » est un tirage
    // au sort : un essai y voyait dix notes vocales, le suivant zero.
    //
    // On lit donc, avec patience, les CHAMPS que la page detient, et on les
    // donne a `getMedia()` dans la forme exacte qu'il attend. Le chemin
    // exerce est bien le notre, celui que l'agent emprunte — sa voie directe,
    // avec le `mimetype` desormais transmis.
    const lire = () =>
      provider._client.pupPage.evaluate(async () => {
        try {
          const Msg = window.require("WAWebCollections").Msg;
          // ON CHARGE L'HISTORIQUE, AVEC L'API QUE LA BIBLIOTHEQUE UTILISE.
          //
          // `Chat.fetchMessages` (Chat.js) fait exactement ceci dans la page :
          // `loadEarlierMsgs({ chat })`, autant de fois que necessaire. C'est
          // une LECTURE : rien n'est envoye, rien n'est marque lu. Sans cela,
          // le magasin reste a ce que la page a bien voulu charger — un essai
          // voyait dix notes vocales, le suivant zero.
          const charge = window.require("WAWebChatLoadMessages");
          const conversations =
            window.require("WAWebChatCollection")?.ChatCollection?.getModelsArray?.() ?? [];
          for (const chat of conversations) {
            for (let tour = 0; tour < 3; tour += 1) {
              const avant = chat.msgs?.getModelsArray?.()?.length ?? 0;
              const charges = await charge.loadEarlierMsgs({ chat }).catch(() => null);
              if (!charges || charges.length === 0) break;
              if ((chat.msgs?.getModelsArray?.()?.length ?? 0) === avant) break;
            }
          }
          const tous = Msg?.getModelsArray?.() ?? [];
          const vocales = tous.filter(
            (m) => (m?.type === "ptt" || m?.type === "audio") && m?.directPath,
          );
          const recues = vocales.filter((m) => m?.id?.fromMe === false);
          const choisi =
            recues.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).at(-1) ??
            vocales.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).at(-1) ??
            null;
          const etat = {
            conversations: conversations.length,
            charges: tous.length,
            vocales: vocales.length,
            recues: recues.length,
          };
          if (!choisi) return { etat };
          return {
            etat,
            // `_serialized` EST ABSENT DU MODELE DE LA PAGE.
            //
            // C'est le defaut que `identifiant-message.js` corrige deja pour
            // les messages entrants : un accesseur de prototype perdu. On rend
            // donc les TROIS parties, et c'est Node qui reconstitue
            // l'identifiant avec la fonction du projet — pas une
            // concatenation improvisee ici.
            idParts: {
              fromMe: choisi.id?.fromMe ?? null,
              remote: choisi.id?.remote?._serialized ?? String(choisi.id?.remote ?? ""),
              id: choisi.id?.id ?? null,
              participant:
                choisi.id?.participant?._serialized ??
                (choisi.id?.participant ? String(choisi.id.participant) : null),
            },
            idPartie: choisi.id?.id ?? null,
            recue: choisi.id?.fromMe === false,
            type: choisi.type ?? null,
            mimetype: choisi.mimetype ?? null,
            dureeS: choisi.duration ?? null,
            // Les champs que le telechargement demande. `mediaKey` en fait
            // partie : il ne sera JAMAIS journalise, seulement transmis.
            donnees: {
              type: choisi.type ?? null,
              mimetype: choisi.mimetype ?? null,
              directPath: choisi.directPath ?? null,
              encFilehash: choisi.encFilehash ?? null,
              filehash: choisi.filehash ?? null,
              mediaKey: choisi.mediaKey ?? null,
              mediaKeyTimestamp: choisi.mediaKeyTimestamp ?? null,
            },
          };
        } catch (e) {
          // Rendue comme donnee : une exception qui traverse `evaluate`
          // revient minifiee et ne dit plus rien.
          return { erreur: String(e?.message ?? e).slice(0, 200) };
        }
      });

    let vu = null;
    for (let essai = 1; essai <= 6; essai += 1) {
      vu = await lire().catch((e) => ({ erreur: resumerErreur(e, { max: 160 }) }));
      if (vu?.donnees?.directPath) break;
      gris(`  essai ${essai}/6 — ${JSON.stringify(vu?.etat ?? vu)}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!vu?.donnees?.directPath) {
      throw new Error(`aucune note vocale exploitable (${JSON.stringify(vu?.etat ?? vu)})`);
    }
    console.log(
      JSON.stringify(
        {
          idPartie: vu.idPartie,
          recue: vu.recue,
          type: vu.type,
          mimetype: vu.mimetype,
          dureeS: vu.dureeS,
          magasin: vu.etat,
        },
        null,
        2,
      ),
    );
    if (!vu.recue) {
      gris("  (note SORTANTE : elle valide le chemin de telechargement, pas la reception)");
    }

    bleu("\n== getMedia(), le chemin que l'agent emprunte ==");
    // La forme exacte qu'attend `getMedia()` : un message porteur de media,
    // dont la charge brute tient les champs du telechargement.
    const message = {
      hasMedia: true,
      type: vu.type,
      mimetype: vu.mimetype,
      duration: vu.dureeS,
      id: { fromMe: vu.idParts.fromMe, remote: vu.idParts.remote, id: vu.idParts.id },
      _data: vu.donnees,
    };
    const media = await provider.getMedia(message);

    for (const l of traces) console.log(`  ${l}`);

    if (!media?.data?.length) {
      rouge("\n  Aucun octet. Le chemin n'est pas repare.");
      process.exitCode = 1;
      return;
    }

    const chemin = join(racine, "donnees-locales", "entrant", `ptt-${message.id?.id ?? Date.now()}.ogg`);
    writeFileSync(chemin, media.data);
    bleu("\n== LES OCTETS SONT LA ==");
    vert(`  octets      ${media.data.length}`);
    vert(`  mimetype    ${media.mimetype}`);
    vert(`  duree       ${media.dureeS ?? "non annoncee"} s`);
    vert(`  en-tete     ${media.data.subarray(0, 4).toString("ascii")} (${media.data.subarray(0, 8).toString("hex")})`);
    vert(`  sha256      ${createHash("sha256").update(media.data).digest("hex")}`);
    vert(`  ecrit       ${chemin}`);
    if (media.data.subarray(0, 4).toString("ascii") !== "OggS") {
      rouge("  ATTENTION : l'en-tete n'est pas celui d'un conteneur Ogg.");
    }
  } finally {
    fermeture = true;
    bleu("\n== Fermeture ==");
    await provider.disconnect().catch((e) => gris(`  ${resumerErreur(e)}`));
    vert("  ferme");
  }
}

principal().catch((e) => {
  rouge(`Interrompu : ${resumerErreur(e, { max: 300 })}`);
  process.exit(1);
});
