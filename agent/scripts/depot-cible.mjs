/**
 * Dépôt SFTP CIBLÉ, vérifié par empreinte.
 *
 * POURQUOI CE SCRIPT EXISTE À CÔTÉ DE `sync-altare.mjs`
 * -----------------------------------------------------
 * La synchronisation complète parcourt tout l'arbre distant et compare chaque
 * empreinte avant d'envoyer quoi que ce soit. C'est la bonne approche quand on
 * ne sait pas ce qui a changé — mais sur ce lien, elle a dépassé neuf minutes
 * trois fois de suite sans aboutir, alors que les fichiers à envoyer tiennent
 * en quelques dizaines de kilo-octets.
 *
 * Ce script ne fait donc que ce qui est demandé : il envoie les chemins qu'on
 * lui nomme, et relit chacun pour comparer son empreinte. Un `put` qui ne lève
 * pas n'est pas une preuve — c'est la leçon déjà apprise par la
 * synchronisation complète, et elle reste vraie ici.
 *
 * Il ne supprime jamais un fichier distant et n'approche ni `node_modules`,
 * ni `.env`, ni `donnees/` — où vit la session WhatsApp.
 *
 *   node agent/scripts/depot-cible.mjs src/voix/piper.js app.js …
 *   node agent/scripts/depot-cible.mjs --voix     (le lot vocal complet)
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** Le lot vocal : tout ce que `--voix` dépose. */
const LOT_VOIX = [
  "src/voix/texte-oral.js",
  "src/voix/fournisseur.js",
  "src/voix/audio.js",
  "src/voix/piper.js",
  "src/voix/installation.js",
  "src/voix/diagnostic-voix.js",
  "src/voix/piper-serveur.py",
  "src/etat-whatsapp.js",
  "src/providers/wwebjs.js",
  "src/diagnostic-environnement.js",
  "app.js",
];

/** Jamais déposés par ce script, quoi qu'on lui demande. */
const INTERDITS = [/^donnees\//, /^node_modules\//, /\.env$/, /\.env\./, /^\.wwebjs/];

function config() {
  const t = readFileSync(resolve(racine, "..", "altare.env"), "utf8").replace(/^﻿/, "");
  const d = {};
  for (const l of t.split(/\r?\n/)) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [k, ...r] = s.split("=");
    d[k.trim()] = r.join("=").trim();
  }
  return {
    host: String(d.ALTARE_SFTP_HOST || "").replace(/^sftp:\/\//, "").split(":")[0],
    port: Number(d.ALTARE_SFTP_PORT || 2022),
    username: d.ALTARE_SFTP_USER,
    password: d.ALTARE_SFTP_PASSWORD,
    readyTimeout: 60_000,
  };
}

const demandes = process.argv.slice(2);
const chemins = demandes.includes("--voix") ? LOT_VOIX : demandes;
if (chemins.length === 0) {
  console.error("Rien à déposer. Donnez des chemins relatifs à agent/, ou --voix.");
  process.exit(1);
}
for (const c of chemins) {
  if (INTERDITS.some((r) => r.test(c))) {
    console.error(`REFUS : ${c} — ce chemin ne se dépose jamais par ce script.`);
    process.exit(1);
  }
}

const sftp = new SftpClient();
await sftp.connect(config());
console.log(`connecte. ${chemins.length} fichier(s) a deposer.\n`);

let envoyes = 0;
let identiques = 0;
let divergents = 0;
for (const rel of chemins) {
  const local = resolve(racine, rel);
  let octets;
  try {
    octets = readFileSync(local);
  } catch (e) {
    console.log(`  ABSENT en local : ${rel} (${e.code})`);
    divergents += 1;
    continue;
  }
  const attendu = sha(octets);
  const distant = posix.join("/", rel.split(/[\\/]/).join("/"));

  // Deja a jour ? On ne renvoie pas pour rien : chaque envoi coute sur ce lien.
  try {
    const dejaLa = await sftp.get(distant);
    if (sha(dejaLa) === attendu) {
      console.log(`  identique  ${rel}`);
      identiques += 1;
      continue;
    }
  } catch {
    /* absent a distance : on envoie */
  }

  await sftp.mkdir(posix.dirname(distant), true).catch(() => {});
  await sftp.put(octets, distant);

  // Relecture : un `put` qui ne leve pas n'est pas une preuve.
  const relu = await sftp.get(distant);
  if (sha(relu) === attendu) {
    console.log(`  depose+verifie  ${rel}  (${statSync(local).size} o)`);
    envoyes += 1;
  } else {
    console.log(`  DIVERGENT apres envoi : ${rel}`);
    divergents += 1;
  }
}

await sftp.end();
console.log(`\n--- ${envoyes} depose(s), ${identiques} deja a jour, ${divergents} en echec ---`);
if (divergents > 0) console.log("Au moins un fichier n'est PAS conforme : ne redemarrez pas encore.");
else console.log("Tous les fichiers demandes sont conformes sur le serveur.");
process.exitCode = divergents ? 1 : 0;
