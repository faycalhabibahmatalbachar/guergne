/**
 * Synchronisation SFTP vers Altare, vérifiée par empreinte.
 *
 * Trois exigences, apprises de trois défauts successifs :
 *
 *  1. RÉCURSIVITÉ — le premier transfert perdait les sous-dossiers imbriqués,
 *     d'où un ERR_MODULE_NOT_FOUND sur `src/providers/wwebjs.js`.
 *  2. EMPREINTE — comparer la présence ne suffit pas : un `package-lock.json`
 *     présent mais périmé restait ignoré. On compare le SHA-256 du contenu.
 *  3. VÉRIFICATION APRÈS TRANSFERT — un `put` qui ne lève pas n'est pas une
 *     preuve. Chaque fichier envoyé est relu et son empreinte recalculée ;
 *     à la moindre divergence, le script sort en code non nul.
 *
 * Il ne supprime jamais un fichier distant, et n'approche ni `node_modules`,
 * ni `.env`, ni `donnees/` (sessions WhatsApp), ni les caches.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function config() {
  const t = readFileSync(resolve(racine, "altare.env"), "utf8").replace(/^\uFEFF/, "");
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
  };
}

/**
 * Jamais transférés ni parcourus : dépendances, secrets, état persistant, caches.
 *
 * LA LISTE ÉTAIT TROP COURTE, ET CELA S'EST VU LE 2026-11-10
 * ----------------------------------------------------------
 * Un déploiement a commencé à téléverser **2 476** fichiers au lieu de 75 : les
 * 2 282 preuves et enregistrements de `donnees-locales/`, les 111 fichiers
 * d'une sauvegarde du code d'Altare — renvoyée à Altare — et le cache
 * `.wwebjs_cache/` d'une instance locale. Sur cette liaison, c'était des heures
 * de transfert pour rien, et surtout : déposer le cache WhatsApp Web d'une
 * autre machine dans le dossier où la bibliothèque va le relire est une
 * invitation à un défaut incompréhensible trois semaines plus tard.
 *
 * `/^donnees\//` ne couvrait pas `donnees-locales/` : le nom diffère. Les
 * répertoires de travail local sont donc nommés un par un ci-dessous.
 */
const EXCLUS_LOCAUX = [
  /node_modules/,
  /\.git/,
  /\.env$/,
  /\.env\./,
  /^donnees\//,
  /\.tmp$/,
  // État et artefacts locaux : ils n'ont aucun sens sur le serveur.
  /^donnees-locales\//,
  /^sauvegardes\//,
  /^\.wwebjs_cache\//,
  /^\.wwebjs_auth\//,
  /^\.cache\//,
  /^\.deps-/,
  /^preuves/,
];
const EXCLUS_DISTANTS = new Set(["node_modules", ".npm", ".cache", "donnees", ".git", ".wwebjs_auth", ".wwebjs_cache", "donnees-locales", "sauvegardes", "tmp"]);

function fichiersLocaux(base) {
  const out = [];
  (function parcourir(dir) {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      const rel = relative(base, p).split("\\").join("/");
      if (EXCLUS_LOCAUX.some((x) => x.test(rel) || x.test(n))) continue;
      if (statSync(p).isDirectory()) parcourir(p);
      else out.push({ local: p, rel });
    }
  })(base);
  return out;
}

/**
 * Parcours distant. On distingue « dossier inexistant » (normal, on l'ignore)
 * d'une erreur de permission ou de connexion, qui doit remonter : masquer
 * toutes les erreurs ferait passer une panne pour une arborescence vide.
 */
async function fichiersDistants(c, chemin, prefixe = "") {
  const out = [];
  let entrees;
  try {
    entrees = await c.list(chemin);
  } catch (e) {
    const m = String(e.message ?? e);
    if (/no such file|not found|failure/i.test(m) && prefixe !== "") return out;
    if (prefixe === "") throw new Error(`racine distante illisible : ${m}`);
    throw new Error(`lecture de ${chemin} : ${m}`);
  }
  for (const e of entrees) {
    if (EXCLUS_DISTANTS.has(e.name)) continue;
    const rel = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.type === "d") out.push(...(await fichiersDistants(c, `${chemin}/${e.name}`, rel)));
    else out.push(rel);
  }
  return out;
}

const c = new SftpClient();
const cfg = config();
await c.connect({ ...cfg, readyTimeout: 20_000 });

const base = resolve(racine, "agent");
const locaux = fichiersLocaux(base);
const presents = new Set(await fichiersDistants(c, "."));

const absents = [];
const perimes = [];
const identiques = [];

for (const f of locaux) {
  const empreinteLocale = sha(readFileSync(f.local));
  f.sha = empreinteLocale;
  if (!presents.has(f.rel)) {
    absents.push(f);
    continue;
  }
  let distant = null;
  try {
    distant = await c.get(`./${f.rel}`);
  } catch (e) {
    throw new Error(`relecture de ${f.rel} : ${e.message ?? e}`);
  }
  if (sha(Buffer.from(distant)) === empreinteLocale) identiques.push(f);
  else perimes.push(f);
}

console.log(`local ${locaux.length} fichiers | distant ${presents.size} fichiers`);
console.log(`absents ${absents.length} | perimes ${perimes.length} | identiques ${identiques.length}`);
for (const f of absents) console.log("  absent :", f.rel);
for (const f of perimes) console.log("  perime :", f.rel);

// --- Transfert, puis VÉRIFICATION par relecture ----------------------------
const aTransferer = [...absents, ...perimes];
let verifies = 0;
const divergents = [];

for (const f of aTransferer) {
  const cible = `./${f.rel}`;
  const dossier = cible.slice(0, cible.lastIndexOf("/"));
  if (dossier !== "." && !(await c.exists(dossier))) await c.mkdir(dossier, true);
  await c.put(f.local, cible);

  // Un `put` sans exception ne prouve rien : on relit et on recompare.
  const relu = await c.get(cible);
  if (sha(Buffer.from(relu)) === f.sha) {
    verifies++;
    console.log("  transfere+verifie :", f.rel);
  } else {
    divergents.push(f.rel);
    console.error("  DIVERGENCE apres transfert :", f.rel);
  }
}

console.log("\n--- rapport ---");
console.log(`absents      : ${absents.length}`);
console.log(`perimes      : ${perimes.length}`);
console.log(`identiques   : ${identiques.length}`);
console.log(`transferes   : ${aTransferer.length}`);
console.log(`verifies SHA : ${verifies}`);
console.log(`divergents   : ${divergents.length}`);

// La session WhatsApp doit être intacte : on le constate, sans jamais y toucher.
const sessionIntacte = await c.exists("./donnees/wwebjs_auth");
console.log(`donnees/wwebjs_auth : ${sessionIntacte ? "present (non modifie)" : "absent (pas encore de session)"}`);

await c.end();

if (divergents.length > 0) {
  console.error(`\nECHEC : ${divergents.length} fichier(s) divergent apres transfert.`);
  process.exit(1);
}
console.log("\nSynchronisation verifiee.");
