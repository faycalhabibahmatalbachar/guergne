/**
 * Ménage des fichiers « core » laissés par les effondrements de Chromium.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Chaque effondrement de Chromium dépose un fichier `core.<pid>` dans le
 * dossier de travail. Trois s'étaient accumulés — 1,21 Go, 0,30 Go et 0,09 Go,
 * soit 1,60 Go — et deux datent d'un seul redémarrage. Ils ne servent à rien
 * après lecture de leur en-tête, et ils grossissent sans fin.
 *
 * POURQUOI PAS `ulimit -c 0` DANS LE PANNEAU
 * -------------------------------------------
 * C'est la parade propre : empêcher le noyau d'écrire le fichier plutôt que de
 * le balayer après coup. Mais l'en-tête d'`index.js` le dit depuis longtemps —
 * le champ « commande de démarrage » du panneau Altare « s'est révélé
 * impossible à modifier de façon fiable », et c'est précisément pour cela que
 * toute la préparation a été déplacée dans le code. Nous balayons donc là où
 * nous avons la main, et la parade du panneau reste une amélioration possible,
 * pas une dépendance.
 *
 * CE QUE CE MODULE NE SUPPRIME JAMAIS
 * ------------------------------------
 * Il n'efface que des fichiers du dossier donné dont le nom correspond
 * exactement à `core.<chiffres>` ET dont l'en-tête est un ELF de type CORE. Il
 * ne descend dans aucun sous-dossier, ne suit aucun lien, et ne touche ni les
 * modèles, ni la session, ni les données scolaires. Un fichier qu'un
 * utilisateur aurait nommé `core.txt` ou un dossier `core.1` sont ignorés.
 */
import { open, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Exactement `core.` suivi de chiffres. Rien d'autre. */
const NOM_CORE = /^core\.\d+$/;

/**
 * Un fichier core est-il assez vieux pour être balayé ?
 *
 * On laisse passer quelques minutes : un fichier en cours d'écriture par le
 * noyau ne doit pas être effacé sous la plume, au risque de laisser le
 * processus bloqué.
 */
export const AGE_MINIMAL_MS = 2 * 60 * 1000;

/** Lit les vingt premiers octets et dit si c'est un vidage mémoire ELF. */
async function estCoreElf(chemin) {
  let fd = null;
  try {
    fd = await open(chemin, "r");
    const tampon = Buffer.alloc(20);
    const { bytesRead } = await fd.read(tampon, 0, 20, 0);
    if (bytesRead < 20) return false;
    const elf = tampon[0] === 0x7f && tampon.subarray(1, 4).toString("latin1") === "ELF";
    // e_type, à l'offset 16 : 4 signifie ET_CORE.
    return elf && tampon.readUInt16LE(16) === 4;
  } catch {
    return false;
  } finally {
    await fd?.close().catch(() => {});
  }
}

/**
 * Balaye les vidages mémoire d'un dossier.
 *
 * Ne lève jamais : un ménage qui échoue ne doit pas empêcher l'agent de
 * démarrer ni de répondre. Il rend ce qu'il a fait, pour que ce soit
 * consignable.
 *
 * @param {object} o
 * @param {string} o.dossier
 * @param {() => number} [o.horloge]
 * @returns {Promise<{supprimes:string[], octets:number, ignores:number, erreurs:string[]}>}
 */
export async function balayerCoreDumps({ dossier, horloge = () => Date.now(), journal = null } = {}) {
  const rapport = { supprimes: [], octets: 0, ignores: 0, erreurs: [] };
  let entrees;
  try {
    entrees = await readdir(dossier, { withFileTypes: true });
  } catch (e) {
    rapport.erreurs.push(`lecture de ${dossier} impossible : ${String(e?.message ?? e).slice(0, 120)}`);
    return rapport;
  }

  for (const e of entrees) {
    if (!NOM_CORE.test(e.name)) continue;
    // Un dossier ou un lien portant ce nom n'est pas un vidage memoire.
    if (!e.isFile()) {
      rapport.ignores += 1;
      continue;
    }
    const chemin = join(dossier, e.name);
    try {
      const s = await stat(chemin);
      if (horloge() - s.mtimeMs < AGE_MINIMAL_MS) {
        rapport.ignores += 1;
        continue;
      }
      if (!(await estCoreElf(chemin))) {
        rapport.ignores += 1;
        continue;
      }
      await unlink(chemin);
      rapport.supprimes.push(e.name);
      rapport.octets += s.size;
    } catch (err) {
      rapport.erreurs.push(`${e.name} : ${String(err?.message ?? err).slice(0, 120)}`);
    }
  }

  if (rapport.supprimes.length > 0) {
    journal?.({
      type: "menage",
      evenement: "core_dumps_balayes",
      nombre: rapport.supprimes.length,
      mo: Math.round(rapport.octets / 1048576),
    });
  }
  return rapport;
}
