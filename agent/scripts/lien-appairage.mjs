/**
 * Imprime le lien d'appairage WhatsApp de l'agent Altare.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Le jeton d'appairage est un secret : il autorise la lecture du QR, et le QR
 * autorise la prise de contrôle du numéro de l'établissement. Il est donc écrit
 * sur le seul disque du conteneur (`donnees/PAIRING_TOKEN.txt`, mode 0600) et
 * n'est jamais servi en HTTP, jamais journalisé, jamais commité.
 *
 * Ce script le lit par SFTP et compose le lien. Le jeton est placé dans le
 * FRAGMENT de l'URL (après `#`) : un fragment n'est jamais transmis au serveur,
 * donc il n'apparaît ni dans les journaux d'accès, ni chez un proxy. La page
 * l'extrait côté navigateur et le présente en en-tête `x-pairing-token`.
 *
 * Le secret est BRÛLÉ dès que la session est authentifiée : ce lien ne sert
 * qu'une fois, et un redémarrage de l'agent en produit un neuf.
 *
 * AVERTISSEMENT : l'agent Altare ne sert qu'en HTTP. Sur ce lien, l'en-tête du
 * jeton et l'image du QR circulent en clair. Préférer l'écran d'administration
 * en HTTPS dès qu'il est déployé ; n'utiliser ce lien que depuis un réseau de
 * confiance, et scanner sans attendre.
 *
 *   node agent/scripts/lien-appairage.mjs            # lien + état
 *   node agent/scripts/lien-appairage.mjs --etat     # état seulement, sans secret
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const etatSeulement = process.argv.includes("--etat");

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

/** Base publique de l'agent. Surchargeable, parce qu'un port de panneau change. */
const BASE = process.env.AGENT_BASE_URL || "http://se-kna02.altare.global:25278";

async function jeton() {
  const c = conf();
  const sftp = new SftpClient();
  await sftp.connect({ host: c.host, port: c.port, username: c.username, password: c.password });
  try {
    return (await sftp.get(`${c.distant}/donnees/PAIRING_TOKEN.txt`)).toString("utf8").trim();
  } finally {
    await sftp.end();
  }
}

async function etat(j) {
  const r = await fetch(`${BASE}/pairing/etat`, {
    headers: j ? { "x-pairing-token": j } : {},
    signal: AbortSignal.timeout(20_000),
  });
  return { code: r.status, corps: await r.json().catch(() => null) };
}

const j = await jeton().catch((e) => {
  console.error("Jeton illisible :", e?.message ?? e);
  console.error("Si le fichier est ABSENT, c'est que la session est DÉJÀ authentifiée (le secret est brûlé après le scan).");
  process.exit(2);
});

const e = await etat(j);
console.log(`état de l'appairage : HTTP ${e.code} ${JSON.stringify(e.corps)}`);
if (e.corps?.etat === "authentifie") {
  console.log("La session est authentifiée : aucun scan n'est nécessaire.");
  process.exit(0);
}

if (etatSeulement) {
  console.log("(--etat : le lien n'est pas imprimé)");
  process.exit(0);
}

console.log("\nOuvrir ce lien, puis WhatsApp → Appareils connectés → Connecter un appareil :\n");
console.log(`${BASE}/pairing#${j}\n`);
console.log("Ce lien ne vaut qu'une fois et circule en clair : scanner sans attendre, depuis un réseau de confiance.");
