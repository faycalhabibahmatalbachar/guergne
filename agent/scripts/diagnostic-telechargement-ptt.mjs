/**
 * Pourquoi le téléchargement d'une note vocale échoue — sans en redemander une.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Deux notes vocales ont été perdues sur une erreur minifiée d'une seule
 * lettre, « t ». La sonde de surface a établi que rien ne manque :
 * `WAWebDownloadManager` existe, `downloadManager` aussi,
 * `downloadAndMaybeDecrypt` est bien une fonction, `arrayBufferToBase64Async`
 * également. L'échec est donc dans L'APPEL, pas dans ce qu'il appelle.
 *
 * Et il n'y a aucune raison d'en demander une troisième au SUPER_ADMIN :
 * ses deux notes vocales sont déjà dans la conversation, donc dans le magasin
 * de la page. On les relit là où elles sont.
 *
 * Ce script n'envoie rien, ne supprime rien, ne modifie rien. Il lit un
 * message existant, inspecte ses champs média, puis tente le téléchargement
 * en rapportant CHAQUE étape depuis l'intérieur de la page — là où les noms
 * sont encore lisibles.
 *
 *   node scripts/diagnostic-telechargement-ptt.mjs --numero 23568663737
 *
 * Aucune clé de chiffrement n'est journalisée : seules leur PRÉSENCE et leur
 * longueur sont rapportées.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { WwebjsProvider } from "../src/providers/wwebjs.js";
import { resumerErreur } from "../src/erreurs.js";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = process.env.SESSION_LOCALE ?? join(racine, "donnees-locales", "wwebjs_auth_local");

const argv = process.argv.slice(2);
const i = argv.indexOf("--numero");
const numero = String(i >= 0 ? argv[i + 1] : "23568663737").replace(/\D/g, "");

const bleu = (s) => console.log(`\x1b[1;34m${s}\x1b[0m`);
const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

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

  const provider = new WwebjsProvider({
    dossierSession: SESSION,
    clientId: "guergne-local",
    journal: { info: (...m) => gris(`  ${m.join(" ")}`), warn: () => {}, error: (...m) => rouge(`  ${m.join(" ")}`), log: () => {} },
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

    bleu("\n== La derniere note vocale RECUE, telle que la page la detient ==");
    const rapport = await provider._client.pupPage.evaluate(async (num) => {
      const dire = (e) =>
        e && e.message ? `${e.name ?? "Error"}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300);
      const sortie = { etapes: {} };
      try {
        // ON CHERCHE DANS LA COLLECTION GLOBALE, PAS DANS UNE CONVERSATION.
        //
        // `getChat('<num>@c.us')` ne rend qu'un message : les notes vocales
        // sont arrivees par une adresse LID, donc dans une autre conversation
        // du point de vue du magasin. La collection `Msg`, elle, contient tous
        // les messages charges, quelle que soit leur conversation — c'est la
        // seule vue qui ne depend pas d'une resolution d'adresse.
        const Msg = window.require("WAWebCollections").Msg;
        const tous = Msg?.getModelsArray?.() ?? [];
        // ON NE FILTRE PLUS SUR `fromMe` AVANT D'AVOIR REGARDE.
        //
        // Le releve precedent annoncait « 0 note vocale recue » alors que le
        // magasin contient bien des `ptt`. Filtrer sur une propriete qu'on n'a
        // pas inspectee, c'est se cacher la reponse : on liste d'abord, on
        // choisit ensuite.
        const vocales = tous.filter((m) => m?.type === "ptt" || m?.type === "audio");
        sortie.magasin = {
          messagesCharges: tous.length,
          vocales: vocales.length,
          types: [...new Set(tous.map((m) => m?.type).filter(Boolean))].slice(0, 12),
          detailVocales: vocales.slice(-6).map((m) => ({
            idPartie: m?.id?.id ?? null,
            fromMe: m?.id?.fromMe ?? null,
            type: m?.type ?? null,
            instant: m?.t ? new Date(m.t * 1000).toISOString() : null,
            aDirectPath: Boolean(m?.directPath),
          })),
        };
        // La plus recente qui porte un directPath : c'est celle qu'on peut
        // tenter de telecharger, qu'elle vienne de nous ou d'eux.
        const ptt =
          vocales.filter((m) => m?.directPath).sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).at(-1) ??
          vocales.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).at(-1);
        if (!ptt) return { erreur: "aucune note vocale dans le magasin", ...sortie };
        sortie.choisi = { idPartie: ptt?.id?.id ?? null, fromMe: ptt?.id?.fromMe ?? null };

        // Les champs media, sans jamais rendre une cle : seulement sa
        // presence et sa longueur.
        const taille = (v) => (v == null ? null : typeof v === "string" ? v.length : (v.byteLength ?? v.length ?? "objet"));
        sortie.message = {
          type: ptt.type,
          idPartie: ptt.id?.id ?? null,
          mimetype: ptt.mimetype ?? null,
          dureeS: ptt.duration ?? null,
          taille: ptt.size ?? null,
          mediaStage: ptt.mediaData?.mediaStage ?? null,
          champs: {
            directPath: taille(ptt.directPath),
            encFilehash: taille(ptt.encFilehash),
            filehash: taille(ptt.filehash),
            mediaKey: taille(ptt.mediaKey),
            mediaKeyTimestamp: ptt.mediaKeyTimestamp ?? null,
            type: ptt.type ?? null,
          },
        };

        const mesures = {
          addAnnotations() {
            return this;
          },
          addPoint() {
            return this;
          },
        };
        const gestionnaire = window.require("WAWebDownloadManager").downloadManager;

        // TENTATIVE 1 : les champs tels quels, comme le fait la bibliotheque.
        try {
          const octets = await gestionnaire.downloadAndMaybeDecrypt({
            directPath: ptt.directPath,
            encFilehash: ptt.encFilehash,
            filehash: ptt.filehash,
            mediaKey: ptt.mediaKey,
            mediaKeyTimestamp: ptt.mediaKeyTimestamp,
            type: ptt.type,
            signal: new AbortController().signal,
            downloadQpl: mesures,
          });
          sortie.etapes.telechargement = { ok: true, octets: octets?.byteLength ?? octets?.length ?? null };
          sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
        } catch (e) {
          sortie.etapes.telechargement = { ok: false, erreur: dire(e) };
        }

        // TENTATIVE 2 : passer par le message lui-meme, qui sait resoudre son
        // propre media. C'est ce que fait WhatsApp Web quand l'utilisateur
        // appuie sur « lire ».
        if (!sortie.etapes.telechargement?.ok) {
          try {
            if (typeof ptt.downloadMedia === "function") {
              await ptt.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
              sortie.etapes.resolutionParLeMessage = {
                ok: true,
                mediaStage: ptt.mediaData?.mediaStage ?? null,
              };
              const octets = await gestionnaire.downloadAndMaybeDecrypt({
                directPath: ptt.directPath,
                encFilehash: ptt.encFilehash,
                filehash: ptt.filehash,
                mediaKey: ptt.mediaKey,
                mediaKeyTimestamp: ptt.mediaKeyTimestamp,
                type: ptt.type,
                signal: new AbortController().signal,
                downloadQpl: mesures,
              });
              sortie.etapes.telechargementApresResolution = {
                ok: true,
                octets: octets?.byteLength ?? octets?.length ?? null,
              };
              sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
            } else {
              sortie.etapes.resolutionParLeMessage = { ok: false, erreur: "downloadMedia absent du modele" };
            }
          } catch (e) {
            sortie.etapes.resolutionParLeMessage = { ok: false, erreur: dire(e) };
          }
        }
        // LIRE LA SIGNATURE PLUTOT QUE DEVINER LE PARAMETRE.
        //
        // L'erreur dit « Unexpected mimetype application/octet-stream for
        // media type ptt » : la fonction VALIDE le type de ce qu'elle
        // telecharge. Reste a savoir quel argument gouverne cette validation.
        // Son propre code le dit, et c'est moins cher qu'un essai au hasard.
        if (!sortie.etapes.telechargement?.ok) {
          try {
            const source = String(gestionnaire.downloadAndMaybeDecrypt);
            sortie.signature = source.slice(0, 1200);
          } catch (e) {
            sortie.signature = `illisible : ${dire(e)}`;
          }
          // LE MEDIA EXISTE-T-IL ENCORE SUR LE SERVEUR ?
          //
          // `mediaStage` vaut « FETCHING », et le gestionnaire expose
          // `checkExistence` et `rmr`. `rmr` signifie « request media
          // reupload » : c'est le mecanisme par lequel WhatsApp redemande au
          // telephone de l'expediteur de reteleverser un media que le serveur
          // ne detient plus. Avant d'accuser notre appel, il faut savoir si
          // l'octet est encore quelque part.
          try {
            const existe = await gestionnaire.checkExistence({
              directPath: ptt.directPath,
              encFilehash: ptt.encFilehash,
              filehash: ptt.filehash,
              mediaKey: ptt.mediaKey,
              mediaKeyTimestamp: ptt.mediaKeyTimestamp,
              type: ptt.type,
            });
            sortie.etapes.existence = { ok: true, reponse: typeof existe === "object" ? Object.keys(existe) : String(existe) };
          } catch (e) {
            sortie.etapes.existence = { ok: false, erreur: dire(e) };
          }

          // Le meme appel, mais en annoncant « audio » : si la validation
          // porte sur ce champ, la difference sera immediate.
          try {
            const octets = await gestionnaire.downloadAndMaybeDecrypt({
              directPath: ptt.directPath,
              encFilehash: ptt.encFilehash,
              filehash: ptt.filehash,
              mediaKey: ptt.mediaKey,
              mediaKeyTimestamp: ptt.mediaKeyTimestamp,
              type: "audio",
              signal: new AbortController().signal,
              downloadQpl: mesures,
            });
            sortie.etapes.enTypeAudio = { ok: true, octets: octets?.byteLength ?? octets?.length ?? null };
            sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
          } catch (e) {
            sortie.etapes.enTypeAudio = { ok: false, erreur: dire(e) };
          }
        }
        return sortie;
      } catch (e) {
        return { erreur: dire(e), etapes: sortie.etapes };
      }
    }, numero);

    const { base64, ...sansOctets } = rapport;
    console.log(JSON.stringify(sansOctets, null, 2));

    if (base64) {
      const octets = Buffer.from(base64, "base64");
      const chemin = join(racine, "donnees-locales", "entrant", `ptt-recu-${Date.now()}.ogg`);
      writeFileSync(chemin, octets);
      bleu("\n== LES OCTETS SONT LA ==");
      vert(`  ${octets.length} octets`);
      vert(`  sha256 ${createHash("sha256").update(octets).digest("hex")}`);
      vert(`  ecrit : ${chemin}`);
    } else {
      rouge("\n  Aucun octet obtenu. L'etape fautive est nommee ci-dessus.");
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
