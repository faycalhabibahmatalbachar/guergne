/**
 * altare-deployer — outil de déploiement SFTP vers le serveur Altare.
 *
 * Heliactyl Next (la console Altare) n'expose aucune clé API Client : SFTP est
 * la seule voie d'automatisation. Cet outil s'y tient, et distingue nettement
 * les opérations de LECTURE (status, inspect, ls) des opérations d'ÉCRITURE
 * (upload, deploy), qui ne s'exécutent que sur demande explicite.
 *
 * Il n'affiche jamais le mot de passe, ni dans les logs ni dans les erreurs.
 *
 *   node agent/scripts/altare.mjs status
 *   node agent/scripts/altare.mjs ls [chemin]
 *   node agent/scripts/altare.mjs upload   (transfert sans demarrage)
 *   node agent/scripts/altare.mjs verify
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function conf() {
  const t = readFileSync(resolve(racine, "altare.env"), "utf8").replace(/^\uFEFF/, "");
  const d = {};
  for (const l of t.split(/\r?\n/)) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [k, ...r] = s.split("=");
    d[k.trim()] = r.join("=").trim();
  }
  // L'onglet Network affiche l'hote sous forme d'URI : on n'en garde que le nom.
  const hote = String(d.ALTARE_SFTP_HOST || "").replace(/^sftp:\/\//, "").split(":")[0];
  const manquants = ["ALTARE_SFTP_USER", "ALTARE_SFTP_PASSWORD"].filter((k) => !d[k]);
  if (!hote || manquants.length) {
    console.error(`[config] incomplet : ${[...manquants, hote ? null : "ALTARE_SFTP_HOST"].filter(Boolean).join(", ")}`);
    process.exit(1);
  }
  return {
    host: hote,
    port: Number(d.ALTARE_SFTP_PORT || 2022),
    username: d.ALTARE_SFTP_USER,
    password: d.ALTARE_SFTP_PASSWORD,
    distant: d.ALTARE_REMOTE_DIR || "/home/container",
  };
}

async function connecter(c) {
  const sftp = new SftpClient();
  await sftp.connect({
    host: c.host,
    port: c.port,
    username: c.username,
    password: c.password,
    // L'hote Altare est lent a repondre : une prise de contact de 20 s echouait
    // regulierement par expiration, ce qui ressemblait a tort a un blocage.
    readyTimeout: Number(process.env.ALTARE_READY_TIMEOUT_MS ?? 120_000),
  });
  return sftp;
}

/** Fichiers à transférer : le projet agent, sans dépendances ni secrets. */
const EXCLUS = [/node_modules/, /\.git/, /\.env$/, /\.env\./, /\.tmp$/, /donnees[\\/]/];
function fichiersAEnvoyer(base) {
  const out = [];
  (function marcher(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const r = relative(base, p).split("\\").join("/");
      if (EXCLUS.some((x) => x.test(r) || x.test(n))) continue;
      if (statSync(p).isDirectory()) marcher(p);
      else out.push({ local: p, distant: r, taille: statSync(p).size });
    }
  })(base);
  return out;
}

const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;

async function main() {
  const commande = process.argv[2] || "status";
  const c = conf();
  console.log(`[altare] ${c.username}@${c.host}:${c.port} -> ${c.distant}`);

  let sftp;
  try {
    sftp = await connecter(c);
  } catch (e) {
    // On n'affiche jamais l'objet d'erreur brut : il peut contenir la config.
    console.error(`[altare] connexion impossible : ${e.message ?? "erreur inconnue"}`);
    process.exit(2);
  }

  try {
    if (commande === "status" || commande === "ls") {
      const chemin = process.argv[3] || c.distant;
      const l = await sftp.list(chemin);
      console.log(`[${chemin}] ${l.length} entree(s)`);
      for (const e of l.slice(0, 40)) {
        console.log(`  ${e.type === "d" ? "d" : "-"} ${String(e.size).padStart(9)}  ${e.name}`);
      }
    } else if (commande === "upload" || commande === "deploy") {
      const base = resolve(racine, "agent");
      const liste = fichiersAEnvoyer(base);
      const total = liste.reduce((n, f) => n + f.taille, 0);
      console.log(`[upload] ${liste.length} fichier(s), ${ko(total)} (node_modules et secrets exclus)`);
      for (const f of liste) {
        const cible = `${c.distant}/${f.distant}`;
        const dossier = cible.slice(0, cible.lastIndexOf("/"));
        if (!(await sftp.exists(dossier))) await sftp.mkdir(dossier, true);
        await sftp.put(f.local, cible);
        console.log(`  envoye ${f.distant} (${ko(f.taille)})`);
      }
      console.log("[upload] termine — un transfert reussi n'est PAS un deploiement reussi.");
      console.log("[upload] etapes restantes, depuis la console Altare : npm install, puis demarrage sur index.js.");
    } else if (commande === "verify") {
      const attendus = ["index.js", "package.json", "src", "test"];
      for (const a of attendus) {
        const e = await sftp.exists(`${c.distant}/${a}`);
        console.log(`  ${e ? "present" : "ABSENT "}  ${a}`);
      }
    } else {
      console.error(`commande inconnue : ${commande}`);
      process.exitCode = 1;
    }
  } finally {
    await sftp.end();
  }
}

await main();
