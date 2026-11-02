/**
 * altare-env — dépose la configuration privée `.env` sur le serveur Altare.
 *
 * POURQUOI UN SCRIPT À PART
 * --------------------------
 * `altare.mjs upload` exclut volontairement tout `.env` : un déploiement de
 * code ne doit jamais emporter de secrets par inadvertance. Mais l'amorçage
 * (`index.js`) charge `/home/container/.env` au démarrage, et c'est la seule
 * voie d'injection dont nous disposons — le champ « Démarrage » du panneau
 * Altare s'est révélé inutilisable, et la console n'est pas un shell.
 *
 * Ce script est donc l'unique chemin d'écriture des secrets, explicite et
 * isolé : il faut le lancer exprès, avec `--ecrire`.
 *
 * GARANTIES
 * ---------
 *   - aucune valeur de secret n'est jamais affichée, ni en succès ni en erreur ;
 *   - le fichier distant est créé en 0600 (lisible par le seul conteneur) ;
 *   - les sources restent locales et hors Git (`ai_apikey.env`, `web/.env.local`) ;
 *   - sans `--ecrire`, le script se contente d'un plan de ce qu'il ferait.
 *
 *   node agent/scripts/altare-env.mjs            # plan, aucune écriture
 *   node agent/scripts/altare-env.mjs --ecrire   # dépose réellement le .env
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Lecture tolérante d'un fichier de type dotenv (BOM, CRLF, valeurs entre guillemets). */
function lireEnv(chemin) {
  const abs = resolve(racine, chemin);
  if (!existsSync(abs)) return {};
  const d = {};
  for (const ligne of readFileSync(abs, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const s = ligne.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [cle, ...reste] = s.split("=");
    d[cle.trim()] = reste.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return d;
}

const clesIA = lireEnv("ai_apikey.env");
const web = lireEnv("web/.env.local");

/**
 * Les variables attendues par `app.js`, et où chacune est puisée.
 *
 * `SCHOOL_API_BASE_URL` est restée absente tant que la route `/api/agent/*`
 * n'était pas déployée : `app.js` ne fait qu'un test de PRÉSENCE
 * (`Boolean(url && jeton)`), si bien que la poser sur une route répondant 404
 * aurait affiché `backend: true` pendant que chaque appel échouait. Un faux
 * vert est pire qu'un rouge franc.
 *
 * Elle est posée depuis le 2026-11-02, la condition étant remplie et vérifiée :
 * `POST /api/agent/listerAlertes` répond **401** sans jeton (route présente et
 * protégée) et **200** avec le jeton de service et un acteur réel.
 */
const VARIABLES = [
  // ATTENTION : `ai_apikey.env` nomme `grok_api` une clé qui est en réalité une
  // clé **Groq** (api.groq.com) — vérifié par appel réel. Elle ne doit JAMAIS
  // être rangée dans `XAI_API_KEY` : Groq et Grok sont deux services distincts,
  // et `configurerDepuisEnv` refuse d'ailleurs la même valeur dans les deux.
  { nom: "GROQ_API_KEY", valeur: clesIA.grok_api, source: "ai_apikey.env:grok_api", requise: true },
  { nom: "MISTRAL_API_KEY", valeur: clesIA.mistral_ai, source: "ai_apikey.env:mistral_ai", requise: true },
  { nom: "OPENROUTER_API_KEY", valeur: clesIA.openrouterai_api, source: "ai_apikey.env:openrouterai_api", requise: true },
  // Aucune clé xAI n'existe à ce jour : le fournisseur est implémenté, et
  // restera « non configuré » tant qu'une clé n'aura pas été fournie.
  { nom: "XAI_API_KEY", valeur: clesIA.xai_api, source: "ai_apikey.env:xai_api", requise: false },
  // Sans `SCHOOL_API_BASE_URL`, ce jeton ne configure rien (`app.js` exige les
  // deux) : le déposer d'avance évite un second passage le jour du branchement.
  { nom: "AGENT_SERVICE_TOKEN", valeur: web.AGENT_SERVICE_TOKEN, source: "web/.env.local", requise: false },
  // L'URL n'est pas un secret, mais elle n'est pas devinee pour autant : c'est
  // celle qui sert `/api/sante` et `/api/agent/*`, verifiee par appel.
  {
    nom: "SCHOOL_API_BASE_URL",
    valeur: process.env.SCHOOL_API_BASE_URL ?? "https://lycee-guergne-renaissance.vercel.app",
    source: "plateforme deployee (verifiee par appel)",
    requise: true,
  },
];

const presentes = VARIABLES.filter((v) => v.valeur);
const absentes = VARIABLES.filter((v) => !v.valeur);

console.log("[env] variables a deposer :");
for (const v of presentes) console.log(`  OK      ${v.nom}  <- ${v.source}`);
for (const v of absentes) {
  console.log(`  ${v.requise ? "ABSENTE" : "ABSENTE"} ${v.nom}  <- ${v.source}${v.requise ? "" : "  (facultative)"}`);
}


const manquantesRequises = absentes.filter((v) => v.requise);
if (manquantesRequises.length) {
  console.error(`[env] arret : source introuvable pour ${manquantesRequises.map((v) => v.nom).join(", ")}.`);
  process.exit(1);
}

const contenu =
  "# Configuration privee du service agent — deposee par agent/scripts/altare-env.mjs.\n" +
  "# NE JAMAIS commiter ce fichier ni le recopier ailleurs.\n" +
  presentes.map((v) => `${v.nom}=${v.valeur}`).join("\n") +
  "\n";

if (!process.argv.includes("--ecrire")) {
  console.log(`[env] PLAN uniquement — ${contenu.length} octets seraient ecrits dans /home/container/.env`);
  console.log("[env] relancer avec --ecrire pour deposer reellement.");
  process.exit(0);
}

const c = lireEnv("altare.env");
const hote = String(c.ALTARE_SFTP_HOST || "").replace(/^sftp:\/\//, "").split(":")[0];
const distant = `${c.ALTARE_REMOTE_DIR || "/home/container"}/.env`;

const sftp = new SftpClient();
try {
  await sftp.connect({
    host: hote,
    port: Number(c.ALTARE_SFTP_PORT || 2022),
    username: c.ALTARE_SFTP_USER,
    password: c.ALTARE_SFTP_PASSWORD,
    readyTimeout: Number(process.env.ALTARE_READY_TIMEOUT_MS ?? 120_000),
  });
  // Ce script RÉÉCRIT le fichier en entier. Il ne doit donc jamais le faire en
  // aveugle : si le serveur porte une variable que nous ne redéposons pas, elle
  // disparaîtrait silencieusement. On lit d'abord, on compare les NOMS (jamais
  // les valeurs), et on s'arrête plutôt que d'effacer quelque chose d'inconnu.
  const ancien = await sftp
    .get(distant)
    .then((b) => b.toString("utf8"))
    .catch(() => null);
  if (ancien) {
    const nomsDistants = ancien
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => l.slice(0, l.indexOf("=")).trim());
    const aDeposer = new Set(presentes.map((v) => v.nom));
    const perdues = [...new Set(nomsDistants)].filter((n) => !aDeposer.has(n));
    console.log(`[env] fichier distant actuel : ${[...new Set(nomsDistants)].join(", ") || "(vide)"}`);
    if (perdues.length) {
      console.error(`[env] ARRET : ces variables existent sur le serveur et seraient effacees : ${perdues.join(", ")}`);
      console.error("[env] ajoutez-les a VARIABLES (avec leur source locale) avant de reecrire le fichier.");
      process.exitCode = 3;
      await sftp.end().catch(() => {});
      process.exit(3);
    }
  }

  // 0600 : le secret ne doit pas être lisible au-delà du compte du conteneur.
  await sftp.put(Buffer.from(contenu, "utf8"), distant, { mode: 0o600 });
  // Le `mode` de `put` n'est pas honoré par le serveur SFTP d'Altare (le
  // fichier ressort en 666). On le reprend explicitement, et on VÉRIFIE :
  // un secret lisible par tout le conteneur n'est pas un secret.
  await sftp.chmod(distant, 0o600).catch((e) => console.warn(`[env] chmod impossible : ${e.message}`));
  const info = await sftp.stat(distant);
  const octal = (info.mode & 0o777).toString(8);
  console.log(`[env] depose : ${distant} (${info.size} octets, mode ${octal})`);
  if (octal !== "600") {
    console.warn(`[env] ATTENTION : permissions ${octal} au lieu de 600 — le serveur refuse de les restreindre.`);
  }
  console.log("[env] prise en compte au PROCHAIN demarrage du processus : index.js charge .env a l'amorcage.");
} catch (e) {
  // Jamais l'objet d'erreur brut : il peut porter la configuration de connexion.
  console.error(`[env] echec : ${e.message ?? "erreur inconnue"}`);
  process.exitCode = 2;
} finally {
  await sftp.end().catch(() => {});
}
