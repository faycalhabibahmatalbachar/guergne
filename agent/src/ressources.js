/**
 * Ressources réelles du conteneur, lues depuis l'intérieur.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Le 2 novembre 2026, Chromium s'est effondré au démarrage en laissant un
 * fichier `core` de 1,16 Go. Pour savoir POURQUOI, il fallait trois chiffres :
 * le plafond mémoire du conteneur, la mémoire disponible, et l'espace disque
 * libre.
 *
 * Aucun des trois n'était observable. SFTP refuse `statvfs`
 * (« operation unsupported ») et n'expose pas `/sys`. Le diagnostic s'est donc
 * fait par sondage : une écriture d'essai a prouvé que le volume acceptait les
 * données — écartant le disque — mais la mémoire est restée inconnue.
 *
 * Un espace d'adressage de 1,16 Go au moment de la mort ressemble beaucoup à
 * une limite de conteneur atteinte. « Ressemble » n'est pas « est » : ce
 * module relève le chiffre, pour que la prochaine fois la question soit
 * tranchée au lieu d'être supposée.
 *
 * CE QU'IL NE FAIT PAS
 * --------------------
 * Il ne décide rien et ne change aucun réglage. Baisser la consommation de
 * Chromium à l'aveugle — `--single-process`, un tas JS réduit — change
 * plusieurs variables à la fois sans pouvoir en mesurer l'effet, et le repli
 * existant du projet le dit déjà : « à n'activer que si la mémoire manque
 * réellement ». Il faut donc d'abord savoir.
 */
import { readFileSync, statfsSync } from "node:fs";

/** Lecture tolérante : un fichier absent n'est pas une panne, c'est un noyau différent. */
function lireNombre(chemin, lire) {
  try {
    const brut = String(lire(chemin, "utf8")).trim();
    if (brut === "max" || brut === "") return null;
    const n = Number(brut);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Une valeur de `/proc/meminfo`, en octets (le fichier est en kibioctets). */
function lireMeminfo(cle, lire) {
  try {
    const texte = String(lire("/proc/meminfo", "utf8"));
    const m = texte.match(new RegExp("^" + cle + ":\\s+(\\d+) kB", "m"));
    return m ? Number(m[1]) * 1024 : null;
  } catch {
    return null;
  }
}

const Mo = (n) => (n === null ? null : Math.round(n / 1048576));

/**
 * Relève mémoire et disque.
 *
 * Les lecteurs sont injectés pour que ce module s'éprouve sans conteneur :
 * autrement il ne serait testable que là où il n'y a personne pour lire le
 * résultat.
 *
 * @param {object} [o]
 * @param {(c:string, e:string) => string} [o.lire]      `readFileSync`
 * @param {(c:string) => object} [o.statFs]              `statfsSync`
 * @param {string} [o.cheminVolume]                      volume à mesurer
 */
export function releverRessources({ lire = readFileSync, statFs = statfsSync, cheminVolume = "/" } = {}) {
  // cgroup v2 d'abord (les conteneurs récents), puis v1. Les deux coexistent
  // selon l'hôte, et supposer l'un des deux rend le relevé muet sur l'autre.
  const plafond =
    lireNombre("/sys/fs/cgroup/memory.max", lire) ??
    lireNombre("/sys/fs/cgroup/memory/memory.limit_in_bytes", lire);
  const utilise =
    lireNombre("/sys/fs/cgroup/memory.current", lire) ??
    lireNombre("/sys/fs/cgroup/memory/memory.usage_in_bytes", lire);

  // Un plafond v1 absent vaut souvent 2^63 arrondi : au-dela de la memoire de
  // la machine, ce n'est pas une limite, c'est son absence.
  const memTotale = lireMeminfo("MemTotal", lire);
  const plafondReel = plafond !== null && memTotale !== null && plafond > memTotale * 2 ? null : plafond;

  // POURQUOI CE CHIFFRE NE DIT PAS CE QU'ON CROIT
  //
  // `statfs` interroge le SYSTEME DE FICHIERS. Dans un conteneur Altare, c'est
  // celui de l'hote : il a annonce 70 Go libres sur 188 pendant que la moindre
  // ecriture etait refusee par ENOSPC. Le quota d'un serveur Altare n'est pas
  // une limite de systeme de fichiers — le daemon surveille la taille du
  // dossier et refuse l'ecriture au-dela — donc `statfs` ne peut PAS le voir,
  // quel que soit le chemin interroge.
  //
  // Ce chiffre a induit en erreur : il avait servi a conclure, a tort, que le
  // disque n'etait pas sature. Il est donc nomme pour ce qu'il est, et le
  // champ dit explicitement ce qu'il ne mesure pas.
  let disque = null;
  try {
    const st = statFs(cheminVolume);
    disque = {
      hoteLibreMo: Mo(st.bavail * st.bsize),
      hoteTotalMo: Mo(st.blocks * st.bsize),
      // Les inodes : un volume peut etre « plein » sans l'etre en octets.
      hoteInodesLibres: Number.isFinite(st.ffree) ? st.ffree : null,
      quotaConteneurMo: null,
      avertissement:
        "Chiffres de l'HOTE. Le quota du conteneur est applique par le daemon " +
        "Altare, hors systeme de fichiers : il n'est pas observable ici, et un " +
        "ENOSPC peut survenir alors que ces valeurs paraissent confortables.",
    };
  } catch {
    disque = null;
  }

  const rss = (() => {
    try {
      return process.memoryUsage().rss;
    } catch {
      return null;
    }
  })();

  return {
    memoirePlafondMo: Mo(plafondReel),
    memoireUtiliseeMo: Mo(utilise),
    memoireDisponibleMo: Mo(lireMeminfo("MemAvailable", lire)),
    memoireMachineMo: Mo(memTotale),
    processusRssMo: Mo(rss),
    disque,
    // Chromium a besoin de plusieurs centaines de mebioctets pour charger
    // WhatsApp Web. Sous ce seuil, son effondrement cesse d'etre une surprise.
    memoireSuspecte: plafondReel !== null && plafondReel < 600 * 1048576,
  };
}

/** Une ligne de journal, lisible d'un coup d'oeil, sans aucun secret. */
export function resumerRessources(r) {
  const p = r.memoirePlafondMo === null ? "inconnu" : `${r.memoirePlafondMo} Mo`;
  const u = r.memoireUtiliseeMo === null ? "?" : `${r.memoireUtiliseeMo} Mo`;
  const d =
    r.disque === null
      ? "inconnu"
      : `${r.disque.hoteLibreMo} Mo libres sur ${r.disque.hoteTotalMo} (HOTE, pas le quota du conteneur)`;
  const alerte = r.memoireSuspecte ? "  ATTENTION : plafond memoire tres bas pour Chromium" : "";
  return `memoire plafond=${p} utilisee=${u} rss=${r.processusRssMo ?? "?"} Mo | disque ${d}${alerte}`;
}
