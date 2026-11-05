/**
 * Mesure l'occupation réelle du volume du conteneur, dossier par dossier.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * `statfs` ment dans un conteneur Altare : il rend l'espace de l'HÔTE — 70 Go
 * libres annoncés — pendant que le quota du conteneur refuse toute écriture par
 * ENOSPC. Le quota n'est pas une limite de système de fichiers, donc aucune
 * sonde système ne le voit.
 *
 * La seule façon de savoir ce qui occupe la place est donc d'additionner les
 * tailles, dossier par dossier, par SFTP. C'est lent — il faut parcourir des
 * milliers d'entrées — mais c'est la seule mesure vraie.
 *
 *   node agent/scripts/mesurer-volume.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const Mo = (n) => (n / 1048576).toFixed(0).padStart(6);

const sftp = new SftpClient();
await sftp.connect(config());

/** Somme des tailles sous un chemin, et nombre de fichiers. */
async function peser(chemin, prof = 0) {
  let octets = 0;
  let fichiers = 0;
  let entrees;
  try {
    entrees = await sftp.list(chemin);
  } catch {
    return { octets: 0, fichiers: 0 };
  }
  for (const e of entrees) {
    if (e.type === "d") {
      // La profondeur est bornee : un parcours sans fin sur node_modules
      // prendrait plus longtemps que la panne qu'on diagnostique.
      if (prof >= 6) continue;
      const sous = await peser(`${chemin}/${e.name}`, prof + 1);
      octets += sous.octets;
      fichiers += sous.fichiers;
    } else {
      octets += e.size;
      fichiers += 1;
    }
  }
  return { octets, fichiers };
}

const SUSPECTS = [
  "/.cache",
  "/node_modules",
  "/donnees/voix",
  "/donnees/wwebjs_auth",
  "/.wwebjs_cache",
  "/.npm",
  "/src",
  "/test",
  "/scripts",
  "/.local",
  "/.config",
];

console.log("occupation par dossier (Mo) — mesure par somme des tailles\n");
let total = 0;
for (const p of SUSPECTS) {
  const { octets, fichiers } = await peser(p);
  total += octets;
  console.log(`  ${Mo(octets)} Mo  ${String(fichiers).padStart(6)} fichiers  ${p}`);
}
const isoles = (await sftp.list("/")).filter((f) => f.type !== "d");
const octetsIsoles = isoles.reduce((a, f) => a + f.size, 0);
total += octetsIsoles;
console.log(`  ${Mo(octetsIsoles)} Mo  ${String(isoles.length).padStart(6)} fichiers  / (fichiers isoles)`);
console.log(`\n  ${Mo(total)} Mo  TOTAL mesure`);

console.log("\nles dix plus gros fichiers du volume :");
const gros = [];
async function recenser(chemin, prof = 0) {
  let entrees;
  try {
    entrees = await sftp.list(chemin);
  } catch {
    return;
  }
  for (const e of entrees) {
    if (e.type === "d") {
      if (prof < 5) await recenser(`${chemin}/${e.name}`, prof + 1);
    } else if (e.size > 5 * 1048576) {
      gros.push({ chemin: `${chemin}/${e.name}`, taille: e.size });
    }
  }
}
await recenser("/.cache");
await recenser("/donnees");
for (const f of (await sftp.list("/")).filter((x) => x.type !== "d" && x.size > 5 * 1048576)) {
  gros.push({ chemin: `/${f.name}`, taille: f.size });
}
for (const g of gros.sort((a, b) => b.taille - a.taille).slice(0, 10)) {
  console.log(`  ${Mo(g.taille)} Mo  ${g.chemin}`);
}

await sftp.end();
