/**
 * Que contient réellement `mediaData` quand l'envoi audio échoue ?
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * L'envoi d'une note vocale échoue sur « Data passed to getter must include an
 * id property (it's how we memoize) but got undefined ». Ce message vient de
 * `getOrCreateMediaObject(mediaData.filehash)` dans `processMediaData` : la
 * garde `if (!mediaData.filehash)` arrive APRÈS l'appel, donc l'erreur qu'on
 * lit n'est pas la cause, c'est un symptôme deux lignes trop tard.
 *
 * J'ai déjà perdu deux tentatives à supposer la cause — d'abord que le
 * paramètre `codecs` du type MIME empêchait la reconnaissance, puis l'inverse.
 * Les deux étaient fausses. Ce script arrête les hypothèses : il refait les
 * étapes de `processMediaData` DANS la page, une par une, et rend ce que
 * chacune produit.
 *
 *   bash infra/local/lancer.sh node scripts/diagnostic-media-page.mjs
 *
 * IL N'ENVOIE RIEN. Il prépare un média et s'arrête avant tout envoi.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");
const AUDIO = process.env.AUDIO_TEST ?? join(racine, "donnees-locales", "derniere-note.ogg");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

async function principal() {
  if (!existsSync(AUDIO)) {
    rouge(`Audio introuvable : ${AUDIO}`);
    gris("Lancez d'abord : node scripts/note-vocale-locale.mjs --numero <n> --blanc");
    process.exit(2);
  }
  const octets = readFileSync(AUDIO);
  bleu(`== Media d'epreuve ==`);
  gris(`  ${AUDIO}`);
  gris(`  ${octets.length} octets`);

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

    bleu("\n== Les etapes de processMediaData, une par une ==");
    const rapport = await provider._client.pupPage.evaluate(
      async (base64, mimetype) => {
        const etapes = {};
        const dire = (e) => (e && e.message ? `${e.name ?? "Error"}: ${e.message}`.slice(0, 220) : String(e).slice(0, 220));
        try {
          // 1. Le fichier, tel que la bibliotheque le fabrique.
          const file = window.WWebJS.mediaInfoToFile({ data: base64, mimetype, filename: "note.ogg" });
          etapes.fichier = { type: file?.type ?? null, taille: file?.size ?? null, nom: file?.name ?? null };

          // 2. Les donnees opaques. `createFromData` televerse les octets TELS
          //    QUELS : aucune conversion n'a lieu dans la page.
          const OpaqueData = window.require("WAWebMediaOpaqueData");
          const opaqueData = await OpaqueData.createFromData(file, mimetype);
          etapes.opaque = { ok: Boolean(opaqueData), type: opaqueData?.type ?? null };

          // 3. La preparation. C'est ici que `type` et `filehash` naissent.
          const prep = window.require("WAWebPrepRawMedia").prepRawMedia(opaqueData, { isPtt: true });
          etapes.prep = { ok: Boolean(prep) };
          const mediaData = await prep.waitForPrep();
          etapes.mediaData = {
            cles: mediaData ? Object.keys(mediaData).slice(0, 40) : null,
            type: mediaData?.type ?? null,
            mimetype: mediaData?.mimetype ?? null,
            filehash: mediaData?.filehash ? "present" : null,
            encFilehash: mediaData?.encFilehash ? "present" : null,
            taille: mediaData?.size ?? null,
            duree: mediaData?.duration ?? null,
            isGif: mediaData?.isGif ?? null,
            mediaStage: mediaData?.mediaStage ?? null,
          };

          // 4. Le type de media, d'ou depend tout le reste.
          try {
            etapes.mediaType = window.require("WAWebMmsMediaTypes").msgToMediaType({
              type: mediaData?.type,
              isGif: mediaData?.isGif,
            });
          } catch (e) {
            etapes.mediaTypeErreur = dire(e);
          }

          // 5. Le getter memoise, celui qui leve l'erreur illisible.
          let objet = null;
          try {
            objet = window.require("WAWebMediaStorage").getOrCreateMediaObject(mediaData?.filehash);
            etapes.mediaObject = { ok: Boolean(objet), type: objet?.type ?? null, aUnId: Boolean(objet?.id) };
          } catch (e) {
            etapes.mediaObjectErreur = dire(e);
          }

          // 6. LA CONSOLIDATION, puis l'identifiant de l'objet media.
          //
          // C'est le dernier maillon avant `uploadMedia({ mimetype,
          // mediaObject, mediaType })`. Si l'objet ressort sans `id`, le
          // televersement interroge son getter memoise avec `undefined` — et
          // c'est exactement le message qu'on lit. On s'arrete AVANT le
          // televersement : ce releve ne doit rien envoyer.
          if (objet) {
            try {
              objet.consolidate(mediaData.toJSON());
              etapes.apresConsolidation = {
                aUnId: Boolean(objet.id),
                type: objet.type ?? null,
                filehash: objet.filehash ? "present" : null,
                taille: objet.size ?? null,
                aContentInfo: Boolean(objet.contentInfo),
                aUneWaveform: Boolean(objet.contentInfo?.waveform),
              };
            } catch (e) {
              etapes.consolidationErreur = dire(e);
            }
          }

          // 7. La forme d'onde, exigee pour un « ptt ».
          //
          // Elle passe par `AudioContext.decodeAudioData`. Dans un Chromium
          // sans peripherique audio, ce decodage peut echouer — et l'echec
          // serait alors la cause reelle, non le getter.
          if (mediaData?.type === "ptt") {
            try {
              const forme = objet?.contentInfo?.waveform ?? (await window.WWebJS.generateWaveform(file));
              etapes.waveform = { ok: Boolean(forme), longueur: forme?.length ?? null };
            } catch (e) {
              etapes.waveformErreur = dire(e);
            }
          }
        } catch (e) {
          etapes.erreur = dire(e);
          etapes.pile = String(e?.stack ?? "").slice(0, 600);
        }
        return etapes;
      },
      octets.toString("base64"),
      "audio/ogg; codecs=opus",
    );

    console.log(JSON.stringify(rapport, null, 2));

    // --- Qui sommes-nous, et comment WhatsApp nous adresse-t-il ? --------
    //
    // `sendMessage` fait, dans Utils.js :
    //     let from = chat.id.isLid() ? lidUser : meUser;
    // avec `meUser = getMaybeMePnUser()`. Un compte adresse par LID n'a pas
    // forcement d'identite telephonique : `meUser` vaut alors `undefined`, et
    // ce `from` indefini se propage jusqu'a un getter memoise — exactement le
    // message qu'on lit. C'est une hypothese a eprouver, non a supposer :
    // j'en ai deja soutenu deux, fausses, sur ce meme envoi.
    bleu("\n== Notre propre identite, et l'adressage ==");
    const identite = await provider._client.pupPage.evaluate(async (numero) => {
      const dire = (e) => (e && e.message ? `${e.name ?? "Error"}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200));
      const r = {};
      try {
        const { getMaybeMeLidUser, getMaybeMePnUser } = window.require("WAWebUserPrefsMeUser");
        // Jamais la valeur : seulement sa presence et son serveur. Ces objets
        // portent notre propre numero.
        const pn = getMaybeMePnUser();
        const lid = getMaybeMeLidUser();
        r.mePn = pn ? { present: true, serveur: pn.server ?? null } : { present: false };
        r.meLid = lid ? { present: true, serveur: lid.server ?? null } : { present: false };
      } catch (e) {
        r.meErreur = dire(e);
      }
      const fabrique = window.require("WAWebWidFactory");
      for (const [nom, adresse] of [["telephonique", `${numero}@c.us`], ["lid", `${numero}@lid`]]) {
        try {
          const wid = fabrique.createWid(adresse);
          r[nom] = { createWid: "ok", serveur: wid?.server ?? null, estLid: typeof wid?.isLid === "function" ? wid.isLid() : null };
        } catch (e) {
          r[nom] = { createWid: "ECHEC", erreur: dire(e) };
        }
      }
      try {
        const chat = await window.WWebJS.getChat(`${numero}@c.us`, { getAsModel: false });
        r.conversation = chat
          ? {
              trouvee: true,
              serveur: chat.id?.server ?? null,
              estLid: typeof chat.id?.isLid === "function" ? chat.id.isLid() : null,
              aUnSerialized: Boolean(chat.id?._serialized),
            }
          : { trouvee: false };
      } catch (e) {
        r.conversation = { trouvee: false, erreur: dire(e) };
      }
      return r;
    }, process.env.NUMERO_TEST ?? "23568663737");
    console.log(JSON.stringify(identite, null, 2));

    if (identite.mePn && identite.mePn.present === false) {
      rouge("  NOTRE compte n'a PAS d'identite telephonique.");
      gris("  `from = chat.id.isLid() ? lidUser : meUser` vaut donc `undefined`");
      gris("  pour une conversation adressee @c.us : ce serait la cause.");
    }

    bleu("\n== Lecture ==");
    if (rapport.mediaData?.filehash === null) {
      rouge("  `filehash` est ABSENT : c'est bien la cause, et elle est en amont.");
      gris("  Regardez `mediaData.type` et `mediaData.mediaStage` : si `type` est");
      gris("  nul, la preparation n'a pas reconnu l'audio.");
    } else if (rapport.mediaData?.filehash === "present") {
      vert("  `filehash` est present : la preparation reussit DANS la page.");
      gris("  L'echec vient donc d'une etape ulterieure — televersement ou envoi.");
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
