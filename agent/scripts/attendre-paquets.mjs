/**
 * Surveille l'installation détachée des dépendances vocales.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * `pip` s'exécute détaché du démon, pour survivre à l'arrêt de celui-ci. Son
 * avancement n'est donc visible nulle part depuis Node : ni dans `/sante`, ni
 * dans la réponse de la route de relance. Le seul témoignage est son journal,
 * sur le volume.
 *
 * Ce script lit ce journal par SFTP et s'arrête dès que `numpy` est importable
 * — c'est-à-dire dès que la relance du moteur a une chance d'aboutir. Sans lui,
 * il faudrait relancer au hasard toutes les minutes.
 *
 *   node agent/scripts/attendre-paquets.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAQUETS = process.env.VOICE_DEPS_DISTANT || "/donnees/voix/paquets";
const PLAFOND_MS = Number(process.env.ATTENTE_MS || 14 * 60 * 1000);
const PAS_MS = 20_000;

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

/**
 * Les modules que pip doit déposer dans `paquets/`.
 *
 * `piper` n'en fait PAS partie : il est déjà déplié dans le dossier voisin, et
 * demander à pip de l'installer en produirait un doublon d'environ 110 Mo sur
 * un quota qui a déjà refusé l'installation deux fois.
 */
const ATTENDUS = ["numpy", "onnxruntime", "pathvalidate"];

const debut = Date.now();
let dernierJournal = 0;
let piperVerifie = false;

while (Date.now() - debut < PLAFOND_MS) {
  const sftp = new SftpClient();
  try {
    await sftp.connect(config());
    const presents = [];
    for (const m of ATTENDUS) {
      // Un dossier de module, ou un module d'un seul fichier.
      const trouve =
        (await sftp.exists(`${PAQUETS}/${m}`)) || (await sftp.exists(`${PAQUETS}/${m}.py`));
      if (trouve) presents.push(m);
    }

    // Le journal de pip : la seule source qui dise ce qui se passe vraiment.
    let fin = "";
    try {
      const j = await sftp.get(`${PAQUETS}/installation.log`);
      const texte = j.toString();
      if (texte.length !== dernierJournal) {
        dernierJournal = texte.length;
        fin = texte.split(/\r?\n/).filter(Boolean).slice(-2).join(" / ").slice(-200);
      }
    } catch {
      fin = "(journal pas encore ecrit)";
    }

    const ecoule = Math.round((Date.now() - debut) / 1000);
    console.log(`[${String(ecoule).padStart(4)} s] presents : ${presents.join(" ") || "aucun"}${fin ? ` | ${fin}` : ""}`);

    if (!piperVerifie) {
      piperVerifie = true;
      const deplie = await sftp.exists(`${dirname(PAQUETS)}/piper/piper/__init__.py`);
      console.log(`         piper deplie a cote : ${deplie ? "OUI" : "NON — a verifier"}`);
    }
    if (ATTENDUS.every((m) => presents.includes(m))) {
      console.log("\nTous les modules attendus sont presents. La relance du moteur peut aboutir.");
      await sftp.end();
      process.exit(0);
    }
    await sftp.end();
  } catch (e) {
    console.log(`[sftp] ${String(e?.message ?? e).slice(0, 120)}`);
    await sftp.end().catch(() => {});
  }
  await new Promise((r) => setTimeout(r, PAS_MS));
}

console.log(`\nPlafond de ${Math.round(PLAFOND_MS / 60000)} min atteint sans que tout soit present.`);
process.exitCode = 1;
