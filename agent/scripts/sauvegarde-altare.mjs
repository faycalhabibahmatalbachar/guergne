/**
 * Sauvegarde par SFTP de ce qui ne se régénère pas.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * Le nœud Altare a cessé de répondre à son panneau. Le conteneur tournait
 * encore, mais nous n'avions aucune copie locale de la session WhatsApp ni des
 * associations d'identité : deux fichiers qui ne se reconstituent pas, et dont
 * la perte signifie réappairer par QR et ressaisir tous les comptes.
 *
 * CE QU'IL COPIE, ET CE QU'IL LAISSE
 * -----------------------------------
 * Il ne copie que l'irremplaçable. Ni `node_modules`, ni Chromium (352 Mo),
 * ni les modèles de voix (120 Mo), ni les paquets Python : tout cela se
 * retélécharge, et sur cette liaison, le transférer coûterait des heures pour
 * rien. Il ne copie pas non plus les vidages mémoire.
 *
 *   node agent/scripts/sauvegarde-altare.mjs [--sortie ./sauvegardes]
 *
 * Chaque fichier est relu et son empreinte comparée : un `get` qui ne lève pas
 * n'est pas une preuve. Cette leçon a déjà été payée sur ce projet.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

/**
 * L'irremplaçable, dans l'ordre d'importance.
 *
 * `obligatoire` distingue ce dont l'absence est un échec de ce dont l'absence
 * est normale : la file de notifications peut être vide, la session non.
 */
const CIBLES = [
  { chemin: "donnees/wwebjs_auth", type: "dossier", obligatoire: true, role: "session WhatsApp appairee" },
  { chemin: "identites.json", type: "fichier", obligatoire: true, role: "numeros, comptes et roles" },
  { chemin: "notifications.json", type: "fichier", obligatoire: false, role: "file d'avis sortants" },
  { chemin: "donnees/dedup.json", type: "fichier", obligatoire: false, role: "idempotence des messages" },
  { chemin: "donnees/compteurs.json", type: "fichier", obligatoire: false, role: "quotas journaliers" },
  { chemin: ".env", type: "fichier", obligatoire: true, role: "secrets — NE JAMAIS COMMITER" },
];

function configuration() {
  const texte = readFileSync(resolve(racine, "altare.env"), "utf8").replace(/^﻿/, "");
  const d = {};
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^([A-Za-z_]+)=(.*)$/);
    if (m) d[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return {
    host: String(d.ALTARE_SFTP_HOST || "").replace(/^sftp:\/\//, "").split(":")[0],
    port: Number(d.ALTARE_SFTP_PORT || 2022),
    username: d.ALTARE_SFTP_USER,
    password: d.ALTARE_SFTP_PASSWORD,
    distant: d.ALTARE_REMOTE_DIR || "/home/container",
  };
}

const arguments_ = process.argv.slice(2);
const indexSortie = arguments_.indexOf("--sortie");
const baseSortie = indexSortie >= 0 ? arguments_[indexSortie + 1] : join(racine, "sauvegardes");
const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const sortie = join(baseSortie, horodatage);

async function principal() {
  const conf = configuration();
  const sftp = new SftpClient();
  const manifeste = { date: new Date().toISOString(), source: `${conf.host}:${conf.distant}`, fichiers: [] };
  let obligatoiresManquants = 0;
  let octets = 0;

  console.log(`Sauvegarde depuis ${conf.host}:${conf.distant}`);
  console.log(`Vers ${sortie}\n`);
  mkdirSync(sortie, { recursive: true });

  await sftp.connect({ host: conf.host, port: conf.port, username: conf.username, password: conf.password, readyTimeout: 30_000 });

  /** Rapatrie un fichier et compare son empreinte a la relecture distante. */
  async function rapatrier(relatif, role) {
    const distant = posix.join(conf.distant, relatif);
    const local = join(sortie, relatif);
    mkdirSync(dirname(local), { recursive: true });
    const contenu = await sftp.get(distant);
    const tampon = Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu);
    writeFileSync(local, tampon);

    // La relecture : la seule facon de savoir qu'on a bien ce qui est la-bas.
    const relu = await sftp.get(distant);
    const tamponRelu = Buffer.isBuffer(relu) ? relu : Buffer.from(relu);
    const conforme = sha(tampon) === sha(tamponRelu);

    manifeste.fichiers.push({ chemin: relatif, octets: tampon.length, sha256: sha(tampon), role, conforme });
    octets += tampon.length;
    console.log(`  ${conforme ? "copie+verifie" : "DIVERGENT   "}  ${relatif}  (${tampon.length} o)`);
    return conforme;
  }

  async function rapatrierDossier(relatif, role) {
    const distant = posix.join(conf.distant, relatif);
    let entrees;
    try {
      entrees = await sftp.list(distant);
    } catch (e) {
      throw new Error(`${relatif} illisible : ${e.message}`);
    }
    for (const e of entrees) {
      const enfant = posix.join(relatif, e.name);
      if (e.type === "d") await rapatrierDossier(enfant, role);
      else if (e.type === "-") await rapatrier(enfant, role);
      // Les liens symboliques ne sont pas suivis : ils pourraient pointer
      // hors du dossier, et une sauvegarde ne doit pas elargir sa portee.
    }
  }

  try {
    for (const cible of CIBLES) {
      try {
        if (cible.type === "dossier") await rapatrierDossier(cible.chemin, cible.role);
        else await rapatrier(cible.chemin, cible.role);
      } catch (e) {
        const message = `  ABSENT        ${cible.chemin} — ${e.message}`;
        if (cible.obligatoire) {
          console.error(`\x1b[1;31m${message}\x1b[0m`);
          obligatoiresManquants += 1;
        } else {
          console.log(`\x1b[0;90m${message}\x1b[0m`);
        }
      }
    }
  } finally {
    await sftp.end().catch(() => {});
  }

  writeFileSync(join(sortie, "MANIFESTE.json"), `${JSON.stringify(manifeste, null, 2)}\n`);
  const divergents = manifeste.fichiers.filter((f) => !f.conforme).length;

  console.log(`\n--- ${manifeste.fichiers.length} fichier(s), ${Math.round(octets / 1024)} Ko ---`);
  console.log(`Manifeste : ${join(sortie, "MANIFESTE.json")}`);
  if (divergents > 0) console.error(`\x1b[1;31m${divergents} fichier(s) divergent(s) a la relecture.\x1b[0m`);
  if (obligatoiresManquants > 0) {
    console.error(`\x1b[1;31m${obligatoiresManquants} element(s) OBLIGATOIRE(S) manquant(s).\x1b[0m`);
    console.error("Cette sauvegarde ne permet PAS une migration sans reappairage.");
  }
  // Le rappel qui compte le plus : cette archive porte des secrets et des
  // numeros de telephone. Elle n'a rien a faire dans Git.
  console.log("\nCette sauvegarde contient .env et la session WhatsApp.");
  console.log("Ne la commitez jamais. `sauvegardes/` est dans .gitignore.");
  process.exit(obligatoiresManquants > 0 || divergents > 0 ? 1 : 0);
}

principal().catch((e) => {
  console.error(`Sauvegarde interrompue : ${e?.message ?? e}`);
  process.exit(1);
});
