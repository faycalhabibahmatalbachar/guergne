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
 * `SCHOOL_API_BASE_URL` est absente À DESSEIN : la plateforme guergné déployée
 * ne sert pas encore `/api/agent/*` (la route n'existe que sur cette branche),
 * et les déploiements de prévisualisation sont derrière l'authentification
 * Vercel. La renseigner maintenant ferait passer `/sante` à `backend:true`
 * alors que chaque appel échouerait : un faux vert est pire qu'un rouge franc.
 * Elle sera ajoutée le jour où une URL réellement joignable existe.
 */
const VARIABLES = [
  { nom: "GROQ_API_KEY", valeur: clesIA.grok_api, source: "ai_apikey.env:grok_api" },
  { nom: "MISTRAL_API_KEY", valeur: clesIA.mistral_ai, source: "ai_apikey.env:mistral_ai" },
  { nom: "AGENT_SERVICE_TOKEN", valeur: web.AGENT_SERVICE_TOKEN, source: "web/.env.local" },
];

const presentes = VARIABLES.filter((v) => v.valeur);
const absentes = VARIABLES.filter((v) => !v.valeur);

console.log("[env] variables a deposer :");
for (const v of presentes) console.log(`  OK      ${v.nom}  <- ${v.source}`);
for (const v of absentes) console.log(`  ABSENTE ${v.nom}  <- ${v.source}`);
console.log("  OMISE   SCHOOL_API_BASE_URL  (aucun deploiement joignable : voir l'en-tete)");

if (absentes.length) {
  console.error("[env] arret : une source de secret est introuvable.");
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
  // 0600 : le secret ne doit pas être lisible au-delà du compte du conteneur.
  await sftp.put(Buffer.from(contenu, "utf8"), distant, { mode: 0o600 });
  const info = await sftp.stat(distant);
  console.log(`[env] depose : ${distant} (${info.size} octets, mode ${(info.mode & 0o777).toString(8)})`);
  console.log("[env] prise en compte au PROCHAIN demarrage du processus : index.js charge .env a l'amorcage.");
} catch (e) {
  // Jamais l'objet d'erreur brut : il peut porter la configuration de connexion.
  console.error(`[env] echec : ${e.message ?? "erreur inconnue"}`);
  process.exitCode = 2;
} finally {
  await sftp.end().catch(() => {});
}
