/**
 * Compare, par empreinte, les fichiers locaux et ceux d'Altare.
 *
 * STRICTEMENT EN LECTURE. Il ne dépose rien, n'efface rien, ne touche à rien.
 *
 * POURQUOI CE SCRIPT EXISTE
 * --------------------------
 * « Le correctif est déployé » est une affirmation qui s'est révélée fausse
 * deux fois sur ce projet : une fois parce qu'un fichier était parti dans un
 * répertoire nommé `/undefined`, une autre parce que le processus gardait en
 * mémoire l'ancien module. Savoir ce qui est RÉELLEMENT sur le disque du
 * serveur, et en quoi il diffère de ce qu'on a sous la main, est la première
 * question à poser avant tout déploiement.
 *
 * Il distingue trois situations, et c'est tout l'intérêt :
 *   identique   — rien à faire
 *   DIFFERENT   — le serveur a une autre version ; candidat au dépôt
 *   ABSENT      — le fichier n'existe pas là-bas ; candidat au dépôt
 *
 *   node agent/scripts/comparer-altare.mjs
 *   node agent/scripts/comparer-altare.mjs --liste   (seuls les chemins a deposer)
 *
 * `--liste` sort les chemins séparés par des espaces, prêts à être passés à
 * `depot-cible.mjs` : le déploiement ciblé découle de la comparaison, au lieu
 * d'être composé de mémoire.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

/**
 * Ce qui est comparé : le code qui tourne, et rien d'autre.
 *
 * Ni `donnees/` — où vivent la session WhatsApp et les modèles —, ni
 * `node_modules`, ni `.env`. Ces chemins n'ont pas à être comparés, et les
 * approcher par mégarde est précisément ce qu'on veut rendre impossible.
 */
const DOSSIERS = ["src", "scripts"];
const FICHIERS = ["app.js", "index.js", "package.json", "package-lock.json"];
const INTERDITS = [/^donnees\//, /^node_modules\//, /\.env$/, /\.env\./, /^\.wwebjs/, /^sauvegardes\//, /^donnees-locales\//];

function configuration() {
  const texte = readFileSync(resolve(racine, "..", "altare.env"), "utf8").replace(/^﻿/, "");
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

/** Les fichiers locaux à comparer, en chemins relatifs à `agent/`. */
function inventaireLocal() {
  const trouves = [];
  const parcourir = (relatif) => {
    const absolu = resolve(racine, relatif);
    for (const nom of readdirSync(absolu)) {
      const enfant = `${relatif}/${nom}`;
      if (INTERDITS.some((r) => r.test(enfant))) continue;
      const s = statSync(resolve(racine, enfant));
      if (s.isDirectory()) parcourir(enfant);
      else if (/\.(js|mjs|py|json)$/.test(nom)) trouves.push(enfant);
    }
  };
  for (const d of DOSSIERS) parcourir(d);
  for (const f of FICHIERS) {
    try {
      statSync(resolve(racine, f));
      trouves.push(f);
    } catch {
      /* absent en local : rien à comparer */
    }
  }
  return trouves.sort();
}

const liste = process.argv.includes("--liste");

async function principal() {
  const conf = configuration();
  const locaux = inventaireLocal();
  const sftp = new SftpClient();
  const resultats = [];

  if (!liste) {
    console.log(`Comparaison avec ${conf.host}:${conf.distant}`);
    console.log(`${locaux.length} fichier(s) local(aux) a comparer. LECTURE SEULE.\n`);
  }

  await sftp.connect({
    host: conf.host, port: conf.port, username: conf.username, password: conf.password, readyTimeout: 30_000,
  });

  try {
    for (const relatif of locaux) {
      const local = readFileSync(resolve(racine, relatif));
      // Les fins de ligne diffèrent entre Windows et Linux : comparer les
      // octets bruts signalerait TOUS les fichiers comme différents, et le
      // rapport deviendrait inutile. On compare le contenu, pas son encodage
      // de saut de ligne.
      const empreinteLocale = sha(local.toString("utf8").replace(/\r\n/g, "\n"));
      let etat;
      let empreinteDistante = null;
      try {
        const brut = await sftp.get(posix.join(conf.distant, relatif));
        const tampon = Buffer.isBuffer(brut) ? brut : Buffer.from(brut);
        empreinteDistante = sha(tampon.toString("utf8").replace(/\r\n/g, "\n"));
        etat = empreinteDistante === empreinteLocale ? "identique" : "DIFFERENT";
      } catch {
        etat = "ABSENT";
      }
      resultats.push({ relatif, etat, empreinteLocale, empreinteDistante, octets: local.length });
      if (!liste && etat !== "identique") {
        console.log(`  ${etat.padEnd(10)} ${relatif}`);
        if (etat === "DIFFERENT") {
          console.log(`             local ${empreinteLocale.slice(0, 12)}  distant ${empreinteDistante.slice(0, 12)}`);
        }
      }
    }
  } finally {
    await sftp.end().catch(() => {});
  }

  const aDeposer = resultats.filter((r) => r.etat !== "identique");
  if (liste) {
    // Sortie brute, destinee a etre passee a depot-cible.mjs.
    console.log(aDeposer.map((r) => r.relatif).join(" "));
    return;
  }

  const identiques = resultats.length - aDeposer.length;
  console.log(`\n--- ${identiques} identique(s), ${aDeposer.filter((r) => r.etat === "DIFFERENT").length} different(s), ${aDeposer.filter((r) => r.etat === "ABSENT").length} absent(s) ---`);
  if (aDeposer.length === 0) {
    console.log("Le disque d'Altare porte exactement le code local.");
    console.log("Attention : cela ne dit PAS que le processus l'a charge.");
  } else {
    console.log("\nPour deposer exactement ces fichiers :");
    console.log(`  node agent/scripts/depot-cible.mjs ${aDeposer.map((r) => r.relatif).join(" ")}`);
  }
}

principal().catch((e) => {
  console.error(`Comparaison interrompue : ${e?.message ?? e}`);
  process.exit(1);
});
