/**
 * Copie locale du CODE actuellement déployé sur Altare — le retour arrière.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * `sauvegarde-altare.mjs` copie l'irremplaçable : sessions, identités. Celui-ci
 * copie l'autre chose qu'on ne peut pas reconstituer après un déploiement — la
 * version qui tournait juste avant.
 *
 * On pourrait croire que Git suffit, puisqu'il contient chaque version du code.
 * C'est faux : rien ne garantit que ce qui tourne sur Altare corresponde
 * exactement à un commit. Un dépôt ciblé, une correction à chaud, un transfert
 * interrompu, et l'état déployé n'existe nulle part ailleurs. Sans cette copie,
 * « préserve l'ancienne version » est un vœu.
 *
 * Il ne copie que du texte : ni `node_modules`, ni Chromium, ni les modèles de
 * voix, ni `donnees/`. Chaque fichier est relu et son empreinte comparée — un
 * `get` qui ne lève pas n'est pas une preuve.
 *
 *   node agent/scripts/sauvegarde-code-altare.mjs [--sortie <dossier>]
 *
 * Pour restaurer, déposer le contenu du dossier avec `depot-cible.mjs`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

function conf() {
  const t = readFileSync(resolve(racine, "altare.env"), "utf8").replace(/^﻿/, "");
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
    distant: d.ALTARE_REMOTE_DIR || "/home/container",
  };
}

/** Jamais parcourus : rien d'irremplaçable n'y vit, et leur taille rendrait la copie impossible. */
const EXCLUS = new Set([
  "node_modules",
  ".npm",
  ".cache",
  "donnees",
  ".git",
  ".wwebjs_auth",
  ".wwebjs_cache",
  "tmp",
  "voix",
  "voix-tmp",
]);
/** Seuls ces fichiers sont du code ou de la configuration versionnable. */
const EXTENSIONS = /\.(js|mjs|cjs|json|py|md|txt|sh|yml|yaml)$/i;
/** Un fichier de code ne pèse pas 5 Mo : au-delà, c'est autre chose. */
const TAILLE_MAX = 5 * 1024 * 1024;

const arg = process.argv.indexOf("--sortie");
const sortie = resolve(
  racine,
  arg > 0 && process.argv[arg + 1]
    ? process.argv[arg + 1]
    : `sauvegardes/altare-code-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);

const c = conf();
const sftp = new SftpClient();
await sftp.connect({ host: c.host, port: c.port, username: c.username, password: c.password });

const aCopier = [];
async function parcourir(rel) {
  const chemin = rel ? `${c.distant}/${rel}` : c.distant;
  let entrees;
  try {
    entrees = await sftp.list(chemin);
  } catch {
    return;
  }
  for (const e of entrees) {
    if (EXCLUS.has(e.name) || e.name.startsWith(".deps-")) continue;
    const suivant = rel ? `${rel}/${e.name}` : e.name;
    if (e.type === "d") await parcourir(suivant);
    else if (EXTENSIONS.test(e.name) && e.size <= TAILLE_MAX) aCopier.push({ rel: suivant, taille: e.size });
  }
}
await parcourir("");

console.log(`${aCopier.length} fichier(s) de code a copier vers :`);
console.log(`  ${sortie}`);

let ok = 0;
const echecs = [];
for (const f of aCopier) {
  try {
    const octets = await sftp.get(`${c.distant}/${f.rel}`);
    const local = join(sortie, f.rel);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, octets);
    // Relecture : la seule facon de savoir que l'octet est bien arrive.
    if (sha(readFileSync(local)) !== sha(octets)) throw new Error("empreinte divergente apres ecriture");
    ok += 1;
  } catch (e) {
    echecs.push({ rel: f.rel, raison: e?.message ?? String(e) });
  }
}
await sftp.end();

const manifeste = {
  le: new Date().toISOString(),
  base: c.distant,
  fichiers: ok,
  echecs,
};
mkdirSync(sortie, { recursive: true });
writeFileSync(join(sortie, "_MANIFESTE.json"), JSON.stringify(manifeste, null, 2));

console.log(`copies : ${ok} / ${aCopier.length}`);
if (echecs.length) {
  console.error("ECHECS :");
  for (const e of echecs) console.error(`  ${e.rel} — ${e.raison}`);
  process.exit(1);
}
console.log("Sauvegarde complete. Retour arriere possible avec depot-cible.mjs.");
