/**
 * Installation de Piper et de ses voix, depuis l'intérieur du conteneur.
 *
 * POURQUOI L'INSTALLATION SE FAIT ICI ET NON PAR SFTP
 * ----------------------------------------------------
 * Le wheel pèse 34 Mo et chaque voix 63 Mo, soit environ 160 Mo. Sur le lien
 * SFTP d'Altare, un envoi de 48 Mo a déjà expiré au bout de neuf minutes :
 * pousser 160 Mo serait long et fragile. Le conteneur, lui, a une bande
 * passante de centre de données — il joint déjà WhatsApp, Vercel et les
 * fournisseurs d'IA. C'est donc lui qui télécharge.
 *
 * POURQUOI ON DÉPLIE AU LIEU D'INSTALLER
 * ---------------------------------------
 * `pip3` est absent du conteneur — relevé par la sonde. Mais un wheel est une
 * archive ZIP : la déplier dans un dossier et pointer `PYTHONPATH` dessus
 * suffit. Aucune installation, aucun droit root, aucun réseau au moment de
 * l'exécution.
 *
 * POURQUOI C'EST IDEMPOTENT
 * --------------------------
 * Cette fonction tourne à CHAQUE démarrage de l'agent. Si elle retéléchargeait
 * 160 Mo chaque fois, un redémarrage coûterait plusieurs minutes et de la bande
 * passante pour rien. Elle vérifie donc ce qui est déjà là, et ne fait que ce
 * qui manque.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

/** Le wheel officiel, épinglé : une version qui change sous nos pieds est un incident. */
export const PIPER_VERSION = "1.8.0";

const BASE_WHEEL = `https://github.com/OHF-Voice/piper1-gpl/releases/download/v${PIPER_VERSION}`;

/**
 * Un wheel PAR PLATE-FORME, et pourquoi il en faut plusieurs.
 *
 * Piper embarque une bibliothèque native : son wheel n'est pas portable. Le
 * projet n'en connaissait qu'un, celui de Linux x86_64 — celui du conteneur
 * Altare. C'était suffisant tant que la voix ne tournait qu'en production.
 *
 * Mais la recette locale a révélé un environnement coupé en deux : la session
 * WhatsApp vit dans un profil Chrome **Windows**, tandis que Piper et ses deux
 * voix étaient installés **dans WSL**. Deux moitiés, et donc aucun aller-retour
 * vocal possible : le transport ne pouvait pas appeler le moteur.
 *
 * On ne déplace donc pas la session — elle est précieuse et authentifiée. On
 * rend l'installation capable de poser Piper là où tourne le transport.
 *
 * Les noms viennent des publications réelles de `v1.8.0`, relevées sur le
 * dépôt amont ; ils ne sont pas devinés.
 */
export const WHEELS = Object.freeze({
  "linux-x64": `${BASE_WHEEL}/piper_tts-${PIPER_VERSION}-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.manylinux_2_28_x86_64.whl`,
  "linux-arm64": `${BASE_WHEEL}/piper_tts-${PIPER_VERSION}-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.manylinux_2_28_aarch64.whl`,
  "win32-x64": `${BASE_WHEEL}/piper_tts-${PIPER_VERSION}-cp39-abi3-win_amd64.whl`,
  "darwin-x64": `${BASE_WHEEL}/piper_tts-${PIPER_VERSION}-cp39-abi3-macosx_10_9_x86_64.whl`,
  "darwin-arm64": `${BASE_WHEEL}/piper_tts-${PIPER_VERSION}-cp39-abi3-macosx_11_0_arm64.whl`,
});

/**
 * Le wheel de la plate-forme courante, ou une erreur qui la NOMME.
 *
 * Retomber silencieusement sur le wheel Linux installerait une bibliothèque
 * native inutilisable, et l'échec surviendrait beaucoup plus loin — à la
 * première synthèse, sous la forme d'un démon Python qui ne démarre pas.
 */
export function wheelPour(plateforme = process.platform, architecture = process.arch) {
  const clef = `${plateforme}-${architecture}`;
  const url = WHEELS[clef];
  if (!url) {
    throw new Error(
      `aucun wheel Piper ${PIPER_VERSION} publie pour ${clef} ` +
        `(connus : ${Object.keys(WHEELS).join(", ")})`,
    );
  }
  return url;
}

/** Conservé pour la compatibilité : le wheel de la plate-forme courante. */
export const PIPER_WHEEL = WHEELS[`${process.platform}-${process.arch}`] ?? WHEELS["linux-x64"];

/**
 * Les voix retenues, et pourquoi celles-là.
 *
 * `fr_FR-siwis-medium` a été choisie sur mesure : `fr_FR-gilles-low` perd le
 * tilde combinant et écorche donc les voyelles nasales françaises — seize
 * phonèmes manquants sur une seule phrase d'essai — tout en générant plus
 * lentement par caractère.
 */
export const VOIX = Object.freeze({
  fr: {
    nom: "fr_FR-siwis-medium",
    base: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium",
    tailleMinimale: 50 * 1024 * 1024,
  },
  ar: {
    nom: "ar_JO-kareem-medium",
    base: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium",
    tailleMinimale: 50 * 1024 * 1024,
  },
});

/** Au-delà, le réseau du conteneur a un problème qu'un délai plus long ne réglera pas. */
const DELAI_TELECHARGEMENT_MS = 10 * 60 * 1000;

/** Un fichier présent ET de taille plausible. Un téléchargement interrompu ne compte pas. */
async function presentEtComplet(chemin, tailleMinimale = 1) {
  try {
    const s = await stat(chemin);
    return s.isFile() && s.size >= tailleMinimale;
  } catch {
    return false;
  }
}

/**
 * Télécharge vers un fichier temporaire, puis renomme.
 *
 * Écrire directement à la destination laisserait, en cas de coupure, un
 * fichier partiel que le prochain démarrage prendrait pour une installation
 * réussie — et le moteur échouerait alors sans qu'on sache pourquoi.
 */
async function telecharger(url, destination, { fetchImpl = fetch } = {}) {
  const partiel = `${destination}.partiel`;
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(DELAI_TELECHARGEMENT_MS), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url.split("/").pop()}`);
  if (!r.body) throw new Error(`reponse sans corps pour ${url.split("/").pop()}`);
  await pipeline(r.body, createWriteStream(partiel));
  const { rename } = await import("node:fs/promises");
  await rename(partiel, destination);
  return (await stat(destination)).size;
}

/** Déplie un ZIP sans dépendance : `unzip` n'est pas garanti dans le conteneur. */
async function deplierZip(archive, destination, { lanceur = null, python = "python3" } = {}) {
  // Python est présent — relevé par la sonde — et son module `zipfile` est
  // dans la bibliothèque standard. L'utiliser évite d'ajouter une dépendance
  // npm pour une opération faite une fois par déploiement.
  const { execFile } = await import("node:child_process");
  const exec = lanceur ?? execFile;
  await mkdir(destination, { recursive: true });
  await new Promise((resoudre, rejeter) => {
    exec(
      // `python3` n'existe pas sous Windows : l'executable s'y nomme `python`.
      // Un nom code en dur rendait cette etape impossible hors Linux.
      python,
      ["-c", "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", archive, destination],
      { timeout: 120_000 },
      (err, _out, stderr) => (err ? rejeter(new Error(`depliage impossible : ${String(stderr || err.message).slice(0, 200)}`)) : resoudre()),
    );
  });
}

/**
 * Installe ce qui manque, et rien de plus.
 *
 * @param {object} o
 * @param {string} o.racine  dossier persistant, sur le volume (jamais /tmp)
 * @param {(e:object)=>void} [o.journal]
 * @returns {Promise<{pret:boolean, pythonpath:string, modeles:object, faits:string[], raison?:string}>}
 */
export async function installerPiper({
  racine,
  journal = null,
  fetchImpl = fetch,
  lanceur = null,
  plateforme = process.platform,
  architecture = process.arch,
  python = process.platform === "win32" ? "python" : "python3",
} = {}) {
  const tracer = (champs) => journal?.({ type: "voix_installation", ...champs });
  const faits = [];
  const dossierPiper = join(racine, "piper");
  const dossierVoix = join(racine, "voix");

  try {
    await mkdir(dossierVoix, { recursive: true });

    // 1. Le moteur. Présence constatée par le module `piper/` déplié, et non
    //    par le wheel : un wheel conservé sans être déplié ne sert à rien.
    const marqueur = join(dossierPiper, "piper", "__init__.py");
    if (!(await presentEtComplet(marqueur))) {
      const wheel = join(racine, `piper-${PIPER_VERSION}.whl`);
      if (!(await presentEtComplet(wheel, 20 * 1024 * 1024))) {
        const url = wheelPour(plateforme, architecture);
        tracer({ evenement: "telechargement", quoi: "moteur", plateforme: `${plateforme}-${architecture}` });
        const o = await telecharger(url, wheel, { fetchImpl });
        faits.push(`moteur telecharge pour ${plateforme}-${architecture} (${Math.round(o / 1048576)} Mo)`);
      }
      tracer({ evenement: "depliage", quoi: "moteur" });
      await deplierZip(wheel, dossierPiper, { lanceur, python });
      faits.push("moteur deplie");
      // Le wheel ne sert plus : le garder occupe 34 Mo du volume pour rien.
      await rm(wheel, { force: true }).catch(() => {});
    }

    // 2. Les voix.
    const modeles = {};
    for (const [langue, v] of Object.entries(VOIX)) {
      const onnx = join(dossierVoix, `${v.nom}.onnx`);
      const config = `${onnx}.json`;
      if (!(await presentEtComplet(onnx, v.tailleMinimale))) {
        tracer({ evenement: "telechargement", quoi: v.nom });
        const o = await telecharger(`${v.base}/${v.nom}.onnx`, onnx, { fetchImpl });
        faits.push(`${v.nom} telechargee (${Math.round(o / 1048576)} Mo)`);
      }
      if (!(await presentEtComplet(config, 500))) {
        await telecharger(`${v.base}/${v.nom}.onnx.json`, config, { fetchImpl });
        faits.push(`${v.nom} configuree`);
      }
      modeles[langue] = onnx;
    }

    // 3. Le chemin d'import. `espeak-ng-data` voyage avec le module et n'a
    //    donc rien à déclarer de plus.
    const pythonpath = dossierPiper;
    const contenu = await readdir(dossierPiper).catch(() => []);
    if (!contenu.includes("piper")) {
      return { pret: false, pythonpath, modeles, faits, raison: "le moteur n'est pas deplie correctement" };
    }
    tracer({ evenement: faits.length ? "installe" : "deja_present", faits });
    return { pret: true, pythonpath, modeles, faits };
  } catch (e) {
    const raison = String(e?.message ?? e).slice(0, 240);
    tracer({ evenement: "echec", raison });
    // On ne lève pas : une installation vocale qui échoue ne doit pas empêcher
    // l'agent de démarrer et de répondre par écrit.
    return { pret: false, pythonpath: dossierPiper, modeles: {}, faits, raison };
  }
}
