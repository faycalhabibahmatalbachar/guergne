/**
 * Amorçage du service — le fichier que le panneau Altare lance réellement.
 *
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------
 * Le panneau exécute `node /home/container/index.js`, et ce champ s'est révélé
 * impossible à modifier de façon fiable. Une commande de démarrage élaborée
 * (installation conditionnelle des dépendances, téléchargement de Chromium)
 * n'était donc jamais appliquée, et le service échouait sur
 * `ERR_MODULE_NOT_FOUND: Cannot find package 'qrcode'`.
 *
 * La préparation est donc déplacée là où nous avons réellement la main : dans
 * le code lui-même, déposé par SFTP. L'amorçage installe ce qui manque, vérifie
 * que c'est vraiment là, puis passe la main à l'application (`app.js`).
 *
 * CONTRAINTE : ce fichier ne peut importer AUCUNE dépendance npm — elles ne
 * sont pas encore garanties présentes. Uniquement des modules Node natifs.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[amorcage] ${m}`);
const erreur = (m) => console.error(`[amorcage] ${m}`);

/** Charge les secrets locaux hors Git (Altare ne présente pas ces variables dans son egg). */
const fichierEnv = join(racine, ".env");
if (existsSync(fichierEnv)) {
  try {
    process.loadEnvFile(fichierEnv);
    log("configuration privee .env chargee");
  } catch (e) {
    erreur(`chargement de .env impossible : ${e.message}`);
    process.exit(1);
  }
}

/** Dépendances sans lesquelles l'application ne peut pas démarrer. */
const REQUISES = ["qrcode", "whatsapp-web.js", "puppeteer"];

const manquantes = () => REQUISES.filter((d) => !existsSync(join(racine, "node_modules", d)));

/**
 * Installation conditionnelle, pilotée par l'empreinte du lockfile.
 *
 * Réinstaller à chaque redémarrage coûterait plusieurs minutes et retarderait
 * d'autant la reconnexion WhatsApp. Un témoin `.deps-<empreinte>` mémorise
 * l'état déjà installé ; l'installation ne se refait que si le lockfile change.
 */
function installerDependances() {
  const lock = join(racine, "package-lock.json");
  if (!existsSync(lock)) {
    erreur("package-lock.json introuvable : installation impossible");
    process.exit(1);
  }
  const empreinte = createHash("sha256").update(readFileSync(lock)).digest("hex").slice(0, 16);
  const temoin = join(racine, `.deps-${empreinte}`);

  if (existsSync(temoin) && manquantes().length === 0) {
    log("dependances deja installees (lockfile inchange)");
    return;
  }

  log(`installation des dependances (lockfile ${empreinte})...`);
  // `--omit=dev` : pas de dépendances de test en production.
  // `--ignore-scripts` : le postinstall de Puppeteer est bloqué de toute façon ;
  // le navigateur est installé juste après par son binaire dédié, ce qui
  // n'autorise que ce téléchargement précis.
  const r = spawnSync("npm", ["ci", "--omit=dev", "--ignore-scripts"], {
    cwd: racine,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    erreur(`npm ci a echoue (code ${r.status})`);
    process.exit(1);
  }

  // On purge les anciens témoins : un retour arrière doit réinstaller.
  for (const f of readdirSync(racine)) {
    if (f.startsWith(".deps-")) {
      try {
        unlinkSync(join(racine, f));
      } catch {
        /* sans importance */
      }
    }
  }
  writeFileSync(temoin, empreinte, "utf8");
}

/**
 * Chromium. La présence du dossier ne prouve rien : on vérifie qu'un exécutable
 * existe réellement, sinon `whatsapp-web.js` échouera au premier message.
 */
function cheminChromium(cache) {
  const base = join(cache, "chrome");
  if (!existsSync(base)) return null;
  for (const version of readdirSync(base)) {
    for (const rel of [
      ["chrome-linux64", "chrome"],
      ["chrome-linux", "chrome"],
      ["chrome-win64", "chrome.exe"],
    ]) {
      const p = join(base, version, ...rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function installerChromium() {
  const cache = process.env.PUPPETEER_CACHE_DIR || join(racine, ".cache", "puppeteer");
  process.env.PUPPETEER_CACHE_DIR = cache;

  let chemin = cheminChromium(cache);
  if (chemin) {
    log(`Chromium deja present : ${chemin}`);
    process.env.PUPPETEER_EXECUTABLE_PATH ||= chemin;
    return;
  }

  log("telechargement de Chromium (une seule fois)...");
  const bin = join(racine, "node_modules", ".bin", process.platform === "win32" ? "puppeteer.cmd" : "puppeteer");
  const r = spawnSync(bin, ["browsers", "install", "chrome"], {
    cwd: racine,
    stdio: "inherit",
    env: { ...process.env, PUPPETEER_CACHE_DIR: cache },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    erreur(`installation de Chromium echouee (code ${r.status})`);
    process.exit(1);
  }

  chemin = cheminChromium(cache);
  if (!chemin) {
    erreur("Chromium introuvable apres installation");
    process.exit(1);
  }
  log(`Chromium installe : ${chemin}`);
  process.env.PUPPETEER_EXECUTABLE_PATH ||= chemin;
}

// --- Séquence d'amorçage ----------------------------------------------------
log(`Node ${process.version} — ${racine}`);

installerDependances();

/**
 * Les rustines de whatsapp-web.js, à CHAQUE démarrage.
 *
 * `npm ci` efface `node_modules`, et `--ignore-scripts` empêche le
 * `postinstall` qui les posait. Sans cette étape, le premier changement de
 * verrou réinstallait une bibliothèque nue : la réception des notes vocales
 * retombait sur `InvalidMediaFileType`, sans rien qui le signale au déploiement.
 *
 * Le script est idempotent (chaque rustine a un témoin). Un échec ne bloque
 * pas le démarrage — le texte fonctionne sans elles — mais il est dit.
 */
function appliquerRustines() {
  const r = spawnSync(process.execPath, [join(racine, "scripts", "rustine-wwebjs.mjs")], {
    cwd: racine,
    stdio: "inherit",
  });
  if (r.status === 0) log("rustines whatsapp-web.js en place");
  else erreur(`rustines whatsapp-web.js NON appliquees (code ${r.status}) : la reception des notes vocales peut echouer`);
}
appliquerRustines();

const restantes = manquantes();
if (restantes.length > 0) {
  // On refuse de démarrer une application incomplète : mieux vaut un échec
  // explicite qu'un crash obscur au premier message reçu.
  erreur(`dependances toujours absentes apres installation : ${restantes.join(", ")}`);
  process.exit(1);
}
log(`dependances verifiees : ${REQUISES.join(", ")}`);

installerChromium();

log("demarrage de l'application");
await import("./app.js");
