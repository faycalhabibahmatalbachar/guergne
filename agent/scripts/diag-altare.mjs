/**
 * Diagnostic LECTURE SEULE du serveur Altare.
 *
 * Écrit rien, ne redémarre rien, ne supprime rien. Son rôle est de répondre aux
 * questions que le panneau Altare ne sait pas répondre, parce qu'il n'offre pas
 * de shell : qui détient le verrou d'instance, depuis quand, quelles variables
 * sont réellement présentes dans `.env`, et dans quel état sont les données
 * persistantes.
 *
 * AUCUNE VALEUR DE SECRET N'EST AFFICHÉE. Pour `.env`, on ne montre que le nom
 * de la variable, la longueur de sa valeur et les anomalies de syntaxe — ce qui
 * suffit à diagnostiquer, et ne fuite rien.
 *
 *   node agent/scripts/diag-altare.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

const c = conf();
const sftp = new SftpClient();
await sftp.connect({
  host: c.host,
  port: c.port,
  username: c.username,
  password: c.password,
  readyTimeout: Number(process.env.ALTARE_READY_TIMEOUT_MS ?? 120_000),
});

const lire = async (chemin) => {
  try {
    return (await sftp.get(`${c.distant}/${chemin}`)).toString("utf8");
  } catch {
    return null;
  }
};
const titre = (t) => console.log(`\n=== ${t} ===`);

try {
  // --- 1. Verrou d'instance -------------------------------------------------
  titre("VERROU D'INSTANCE");
  const brut = await lire("donnees/instance.lock");
  if (brut == null) {
    console.log("donnees/instance.lock : ABSENT — aucune instance ne revendique la session.");
  } else {
    console.log(`contenu brut : ${brut.trim()}`);
    try {
      const v = JSON.parse(brut);
      console.log(`  pid              : ${v.pid ?? "(absent)"}`);
      console.log(`  instanceId       : ${v.instanceId ?? "(absent — verrou d'ancienne generation)"}`);
      console.log(`  identiteProcessus: ${v.identiteProcessus ?? "(absent — PID non verifiable)"}`);
      if (v.vuLe) {
        const age = Date.now() - v.vuLe;
        console.log(`  dernier battement: ${new Date(v.vuLe).toISOString()}  (il y a ${Math.round(age / 1000)} s)`);
        if (age < 0) console.log("  ANOMALIE : battement date dans l'AVENIR — horloge incoherente.");
      } else {
        console.log("  dernier battement: (absent)");
      }
    } catch {
      console.log("  CONTENU ILLISIBLE : le verrou n'identifie personne.");
    }
    // L'horodatage du fichier est une seconde source, indépendante du contenu.
    try {
      const st = await sftp.stat(`${c.distant}/donnees/instance.lock`);
      console.log(`  mtime du fichier : ${new Date(st.modifyTime).toISOString()}`);
    } catch {
      /* sans importance */
    }
  }

  // --- 2. Configuration privée, sans aucune valeur -------------------------
  titre("CONFIGURATION .env (noms et anomalies seulement)");
  const env = await lire(".env");
  if (env == null) {
    console.log(".env : ABSENT");
  } else {
    const vus = new Map();
    const anomalies = [];
    let ligneNo = 0;
    for (const ligne of env.split(/\r?\n/)) {
      ligneNo += 1;
      const s = ligne.trim();
      if (!s || s.startsWith("#")) continue;
      if (!s.includes("=")) {
        anomalies.push(`ligne ${ligneNo} : ni commentaire ni affectation`);
        continue;
      }
      const nom = s.slice(0, s.indexOf("=")).trim();
      const valeur = s.slice(s.indexOf("=") + 1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) {
        anomalies.push(`ligne ${ligneNo} : nom de variable invalide pour process.loadEnvFile`);
      }
      if (vus.has(nom)) anomalies.push(`${nom} : DOUBLON (la derniere occurrence gagne)`);
      const guillemets = /^\s*["']/.test(valeur) ? "oui" : "non";
      const espaces = valeur !== valeur.trim() ? "OUI" : "non";
      vus.set(nom, { longueur: valeur.trim().replace(/^["']|["']$/g, "").length, guillemets, espaces });
    }
    for (const [nom, d] of vus) {
      console.log(
        `  ${nom.padEnd(26)} longueur=${String(d.longueur).padStart(3)}  guillemets=${d.guillemets}  espaces_parasites=${d.espaces}`,
      );
    }
    console.log(`  (${vus.size} variable(s) ; ${env.length} octets)`);
    if (anomalies.length) {
      console.log("  ANOMALIES :");
      for (const a of anomalies) console.log(`    - ${a}`);
    } else {
      console.log("  syntaxe : aucune anomalie detectee");
    }
    const ATTENDUES = [
      "MISTRAL_API_KEY",
      "XAI_API_KEY",
      "OPENROUTER_API_KEY",
      "GROQ_API_KEY",
      "SCHOOL_API_BASE_URL",
      "AGENT_SERVICE_TOKEN",
      "AGENT_MEMORY_ENABLED",
      "AGENT_MEMORY_DATABASE_URL",
      "AGENT_MEMORY_ENCRYPTION_KEY",
      "AGENT_MEMORY_HMAC_KEY",
    ];
    const absentes = ATTENDUES.filter((k) => !vus.has(k));
    console.log(`  manquantes parmi les attendues : ${absentes.length ? absentes.join(", ") : "aucune"}`);
  }

  // --- 3. Données persistantes ---------------------------------------------
  titre("DONNEES PERSISTANTES");
  try {
    for (const e of await sftp.list(`${c.distant}/donnees`)) {
      console.log(`  ${e.type === "d" ? "d" : "-"} ${String(e.size).padStart(9)}  ${e.name}`);
    }
  } catch {
    console.log("  donnees/ : ABSENT");
  }
  const sessions = await sftp
    .list(`${c.distant}/donnees/wwebjs_auth`)
    .catch(() => null);
  console.log(
    `  session WhatsApp : ${sessions ? `${sessions.length} entree(s) — presente, A NE PAS SUPPRIMER` : "ABSENTE"}`,
  );

  // --- 4. Identités (comptages seulement, aucun numéro) --------------------
  titre("MAGASIN D'IDENTITES (comptages seulement)");
  const ident = await lire("donnees/identites.json");
  if (ident == null) {
    console.log("  donnees/identites.json : ABSENT — aucun numero n'est reconnu, aucune operation possible.");
  } else {
    try {
      const d = JSON.parse(ident);
      const liste = Array.isArray(d) ? d : (d.liaisons ?? d.entrees ?? []);
      const parEtat = {};
      for (const l of liste) parEtat[l.etat ?? "inconnu"] = (parEtat[l.etat ?? "inconnu"] ?? 0) + 1;
      console.log(`  ${liste.length} entree(s) : ${JSON.stringify(parEtat)}`);
    } catch {
      console.log("  contenu illisible");
    }
  }

  // --- 5. Version du code déployé ------------------------------------------
  titre("CODE DEPLOYE");
  for (const f of ["index.js", "app.js", "src/verrou.js", "src/ia.js", "src/persistance.js"]) {
    try {
      const st = await sftp.stat(`${c.distant}/${f}`);
      console.log(`  ${f.padEnd(22)} ${String(st.size).padStart(7)} o   ${new Date(st.modifyTime).toISOString()}`);
    } catch {
      console.log(`  ${f.padEnd(22)} ABSENT`);
    }
  }

  console.log(
    "\nNOTE : le SFTP d'Altare est cloisonne au volume du conteneur ; /proc n'est pas lisible d'ici.\n" +
      "La preuve de vie d'un processus se prend donc par /sante, et par le verrou lui-meme au demarrage.",
  );
} finally {
  await sftp.end();
}
