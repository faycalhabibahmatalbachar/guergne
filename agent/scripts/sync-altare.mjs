/**
 * Synchronisation SFTP vers Altare : transfère RÉCURSIVEMENT tout ce qui manque.
 *
 * Le premier transfert avait perdu les sous-dossiers imbriqués (`src/providers/`),
 * d'où un ERR_MODULE_NOT_FOUND au démarrage. Ce script compare les deux
 * arborescences et ne transfère que la différence : il ne touche donc jamais aux
 * données persistantes, aux sessions WhatsApp ni aux secrets présents côté serveur.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const t = readFileSync(resolve(racine, "altare.env"), "utf8").replace(/^\uFEFF/, "");
const d = {};
for (const l of t.split(/\r?\n/)) {
  const s = l.trim();
  if (!s || s.startsWith("#") || !s.includes("=")) continue;
  const [k, ...r] = s.split("=");
  d[k.trim()] = r.join("=").trim();
}

const c = new SftpClient();
await c.connect({
  host: String(d.ALTARE_SFTP_HOST).replace(/^sftp:\/\//, "").split(":")[0],
  port: Number(d.ALTARE_SFTP_PORT),
  username: d.ALTARE_SFTP_USER,
  password: d.ALTARE_SFTP_PASSWORD,
  readyTimeout: 20_000,
});

/** Jamais transférés : dépendances, secrets, données persistantes du serveur. */
const EXCLUS = [/node_modules/, /\.git/, /\.env$/, /\.env\./, /donnees/];
const base = resolve(racine, "agent");
const locaux = [];
(function parcourir(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const r = relative(base, p).split("\\").join("/");
    if (EXCLUS.some((x) => x.test(r) || x.test(n))) continue;
    if (statSync(p).isDirectory()) parcourir(p);
    else locaux.push({ local: p, rel: r });
  }
})(base);

async function distants(chemin, prefixe = "") {
  const out = [];
  let l = [];
  try {
    l = await c.list(chemin);
  } catch {
    return out;
  }
  for (const e of l) {
    if (["node_modules", ".npm", "donnees"].includes(e.name)) continue;
    const r = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.type === "d") out.push(...(await distants(`${chemin}/${e.name}`, r)));
    else out.push(r);
  }
  return out;
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const presents = new Set(await distants("."));

// Comparaison par EMPREINTE, pas par simple présence : un fichier présent mais
// périmé (le package-lock d'avant l'ajout de whatsapp-web.js, par exemple) doit
// être remplacé. La taille seule ne suffit pas à le détecter.
const absents = [], perimes = [], identiques = [];
for (const f of locaux) {
  const local = readFileSync(f.local);
  if (!presents.has(f.rel)) { absents.push(f); continue; }
  let distant = null;
  try { distant = await c.get(`./${f.rel}`); } catch { /* illisible */ }
  if (distant && sha(Buffer.from(distant)) === sha(local)) identiques.push(f);
  else perimes.push(f);
}
const manquants = [...absents, ...perimes];
console.log(`local ${locaux.length} | distant ${presents.size}`);
console.log(`absents ${absents.length} | perimes ${perimes.length} | identiques ${identiques.length}`);
for (const f of absents) console.log("  absent :", f.rel);
for (const f of perimes) console.log("  perime :", f.rel);

for (const f of manquants) {
  const cible = `./${f.rel}`;
  const dossier = cible.slice(0, cible.lastIndexOf("/"));
  if (dossier !== "." && !(await c.exists(dossier))) await c.mkdir(dossier, true);
  await c.put(f.local, cible);
  console.log("  envoye:", f.rel);
}

console.log("--- controle des modules importes par index.js ---");
for (const p of [
  "./index.js", "./package.json",
  "./src/providers/wwebjs.js", "./src/engine.js", "./src/ia.js", "./src/persistance.js",
  "./src/audit.js", "./src/guergne-client.js", "./src/identity.js",
  "./src/permissions-matrix.js", "./src/tools.js", "./src/provider.js",
]) console.log(` ${(await c.exists(p)) ? "present" : "ABSENT "}  ${p}`);

await c.end();
