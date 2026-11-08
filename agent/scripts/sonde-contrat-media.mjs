/**
 * Le CONTRAT de `downloadAndMaybeDecrypt`, lu dans la page plutôt que deviné.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * La session précédente a fini par nommer la vraie panne :
 *
 *   InvalidMediaFileType: Unexpected mimetype application/octet-stream
 *                         for media type ptt
 *
 * WhatsApp Web VALIDE donc le type du média qu'il vient de télécharger, et il
 * voit `application/octet-stream` là où il attend un type audio. Deux causes
 * sont possibles, et elles n'appellent pas la même correction :
 *
 *   a) le message annonce lui-même `application/octet-stream` — alors c'est
 *      notre couche qui doit présenter un type cohérent ;
 *   b) le message annonce un vrai type audio, mais l'appel ne le TRANSMET
 *      pas — alors la correction est de transmettre ce que le message dit
 *      déjà, et non d'inventer un type.
 *
 * Tant qu'on ne sait pas laquelle, toute correction est une rustine. Ce script
 * ne corrige rien : il rapporte le type annoncé par le message, la SOURCE
 * réelle de la fonction appelée, et le résultat de chaque tentative avec le
 * nom, le message et la pile de l'exception.
 *
 *   node scripts/sonde-contrat-media.mjs
 *
 * Il n'envoie rien, ne supprime rien, ne modifie rien. Aucune clé de
 * chiffrement n'est journalisée : seules leur PRÉSENCE et leur longueur.
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
    journal: {
      info: (...m) => gris(`  ${m.join(" ")}`),
      warn: () => {},
      error: (...m) => rouge(`  ${m.join(" ")}`),
      log: () => {},
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

    bleu("\n== Le contrat, tel que la page le detient ==");
    const rapport = await provider._client.pupPage.evaluate(async () => {
      // Une exception qui traverse `evaluate` revient minifiee. On la decrit
      // ICI, ou les noms sont encore lisibles, et on la REND comme donnee.
      const dire = (e) => ({
        nom: e?.name ?? null,
        classe: e?.constructor?.name ?? null,
        message: String(e?.message ?? e).slice(0, 400),
        pile: String(e?.stack ?? "").slice(0, 1200),
        cause: e?.cause ? String(e.cause?.message ?? e.cause).slice(0, 200) : null,
      });
      const taille = (v) =>
        v == null ? null : typeof v === "string" ? v.length : (v.byteLength ?? v.length ?? "objet");
      const mesures = {
        addAnnotations() {
          return this;
        },
        addPoint() {
          return this;
        },
      };

      const sortie = { etapes: {} };
      try {
        const Msg = window.require("WAWebCollections").Msg;
        const tous = Msg?.getModelsArray?.() ?? [];
        const vocales = tous.filter((m) => m?.type === "ptt" || m?.type === "audio");
        sortie.magasin = {
          messagesCharges: tous.length,
          vocales: vocales.length,
          detail: vocales.slice(-8).map((m) => ({
            idPartie: m?.id?.id ?? null,
            fromMe: m?.id?.fromMe ?? null,
            type: m?.type ?? null,
            mimetype: m?.mimetype ?? null,
            instant: m?.t ? new Date(m.t * 1000).toISOString() : null,
            aDirectPath: Boolean(m?.directPath),
          })),
        };

        // ON PRIVILEGIE UNE NOTE RECUE, PAS UNE DES NOTRES.
        //
        // Le parcours a valider est l'ENTRANT. Une note sortante se
        // telecharge peut-etre sans peine et ne prouverait rien.
        const avecChemin = vocales.filter((m) => m?.directPath);
        const recues = avecChemin.filter((m) => m?.id?.fromMe === false);
        const ptt =
          recues.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).at(-1) ??
          avecChemin.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).at(-1) ??
          null;
        if (!ptt) return { erreur: "aucune note vocale exploitable dans le magasin", ...sortie };

        sortie.choisi = {
          idPartie: ptt.id?.id ?? null,
          fromMe: ptt.id?.fromMe ?? null,
          recue: ptt.id?.fromMe === false,
        };

        // (a) OU (b) ? C'est CE champ qui tranche.
        sortie.message = {
          type: ptt.type ?? null,
          mimetype: ptt.mimetype ?? null,
          mimetypeMediaData: ptt.mediaData?.mimetype ?? null,
          mediaStage: ptt.mediaData?.mediaStage ?? null,
          dureeS: ptt.duration ?? null,
          taille: ptt.size ?? null,
          mediaDataChamps: ptt.mediaData ? Object.keys(ptt.mediaData).slice(0, 40) : null,
          champs: {
            directPath: taille(ptt.directPath),
            encFilehash: taille(ptt.encFilehash),
            filehash: taille(ptt.filehash),
            mediaKey: taille(ptt.mediaKey),
            mediaKeyTimestamp: ptt.mediaKeyTimestamp ?? null,
          },
        };

        const gestionnaire = window.require("WAWebDownloadManager")?.downloadManager ?? null;
        if (!gestionnaire) return { erreur: "downloadManager absent", ...sortie };

        // LA SOURCE, PLUTOT QUE LA SUPPOSITION.
        //
        // La fonction dit elle-meme quels arguments elle lit et quelle
        // validation elle applique. C'est moins cher qu'un essai au hasard,
        // et c'est la seule facon de corriger a la bonne couche.
        try {
          sortie.source = String(gestionnaire.downloadAndMaybeDecrypt).slice(0, 8000);
        } catch (e) {
          sortie.source = `illisible : ${dire(e).message}`;
        }
        sortie.autresMethodes = Object.keys(gestionnaire).slice(0, 25);

        const argsBase = () => ({
          directPath: ptt.directPath,
          encFilehash: ptt.encFilehash,
          filehash: ptt.filehash,
          mediaKey: ptt.mediaKey,
          mediaKeyTimestamp: ptt.mediaKeyTimestamp,
          type: ptt.type,
          signal: new AbortController().signal,
          downloadQpl: mesures,
        });

        // TENTATIVE 1 — exactement ce que fait la bibliotheque installee.
        try {
          const octets = await gestionnaire.downloadAndMaybeDecrypt(argsBase());
          sortie.etapes.telLibrairie = { ok: true, octets: taille(octets) };
          sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
        } catch (e) {
          sortie.etapes.telLibrairie = { ok: false, erreur: dire(e) };
        }

        // TENTATIVE 2 — les MEMES champs, plus le `mimetype` que le message
        // annonce deja. On ne fabrique aucun type : on transmet le sien.
        if (!sortie.base64 && ptt.mimetype) {
          try {
            const octets = await gestionnaire.downloadAndMaybeDecrypt({
              ...argsBase(),
              mimetype: ptt.mimetype,
            });
            sortie.etapes.telAvecMimetypeDuMessage = { ok: true, octets: taille(octets) };
            sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
          } catch (e) {
            sortie.etapes.telAvecMimetypeDuMessage = { ok: false, erreur: dire(e) };
          }
        }

        // TENTATIVE 3 — laisser le MESSAGE resoudre son propre media, comme
        // le fait WhatsApp Web quand l'utilisateur appuie sur « lire », puis
        // relire ses champs : ils ont peut-etre change.
        if (!sortie.base64 && typeof ptt.downloadMedia === "function") {
          try {
            await ptt.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
            sortie.etapes.resolutionParLeMessage = {
              ok: true,
              mediaStage: ptt.mediaData?.mediaStage ?? null,
              mimetypeApres: ptt.mimetype ?? null,
              mediaDataChampsApres: ptt.mediaData ? Object.keys(ptt.mediaData).slice(0, 40) : null,
            };
          } catch (e) {
            sortie.etapes.resolutionParLeMessage = { ok: false, erreur: dire(e) };
          }

          // 3a — les octets que la page detient peut-etre deja, sans
          // retelecharger : c'est ce que lit le lecteur audio de WhatsApp.
          try {
            const porteur =
              ptt.mediaData?.mediaBlob ?? ptt.mediaData?.mediaObject ?? ptt.mediaData?.blob ?? null;
            sortie.etapes.blobDansLaPage = {
              present: Boolean(porteur),
              champs: porteur ? Object.keys(porteur).slice(0, 20) : null,
              methodes: porteur
                ? ["forceToBlob", "toBlob", "arrayBuffer", "forceToData"].filter(
                    (n) => typeof porteur[n] === "function",
                  )
                : null,
            };
            if (porteur && !sortie.base64) {
              const blob =
                typeof porteur.forceToBlob === "function"
                  ? await porteur.forceToBlob()
                  : typeof porteur.toBlob === "function"
                    ? await porteur.toBlob()
                    : porteur;
              if (blob && typeof blob.arrayBuffer === "function") {
                const octets = await blob.arrayBuffer();
                sortie.etapes.blobDansLaPage.octets = taille(octets);
                sortie.etapes.blobDansLaPage.typeBlob = blob.type ?? null;
                sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
                sortie.voie = "blob_de_la_page";
              }
            }
          } catch (e) {
            sortie.etapes.blobDansLaPage = { ok: false, erreur: dire(e) };
          }

          // 3b — et, apres resolution, le telechargement a nouveau.
          if (!sortie.base64) {
            try {
              const octets = await gestionnaire.downloadAndMaybeDecrypt(argsBase());
              sortie.etapes.telApresResolution = { ok: true, octets: taille(octets) };
              sortie.base64 = await window.WWebJS.arrayBufferToBase64Async(octets);
            } catch (e) {
              sortie.etapes.telApresResolution = { ok: false, erreur: dire(e) };
            }
          }
        }

        return sortie;
      } catch (e) {
        return { erreur: dire(e), etapes: sortie.etapes, magasin: sortie.magasin ?? null };
      }
    });

    const { base64, source, ...sansOctets } = rapport;
    console.log(JSON.stringify(sansOctets, null, 2));

    if (source) {
      bleu("\n== Source reelle de downloadAndMaybeDecrypt ==");
      const chemin = join(racine, "donnees-locales", "contrat-downloadAndMaybeDecrypt.js");
      writeFileSync(chemin, source);
      console.log(source.slice(0, 4000));
      gris(`\n  (source complete : ${chemin})`);
    }

    if (base64) {
      const octets = Buffer.from(base64, "base64");
      const chemin = join(racine, "donnees-locales", "entrant", `ptt-recu-${Date.now()}.bin`);
      writeFileSync(chemin, octets);
      bleu("\n== LES OCTETS SONT LA ==");
      vert(`  ${octets.length} octets`);
      vert(`  sha256 ${createHash("sha256").update(octets).digest("hex")}`);
      vert(`  premiers octets : ${octets.subarray(0, 8).toString("hex")}`);
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
