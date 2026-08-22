#!/usr/bin/env node
/**
 * Déclare l'application Android dans Firebase et récupère `google-services.json`.
 *
 * POURQUOI UN SCRIPT PLUTÔT QUE LA CONSOLE
 * ----------------------------------------
 * La console fait la même chose en quatre clics. Mais elle ne laisse aucune
 * trace de ce qui a été fait, et le jour où il faut recréer le projet — perte
 * du compte Google, changement d'établissement, environnement de recette —
 * personne ne se souvient du nom de paquet exact ni des empreintes déclarées.
 * Ici, tout est écrit, rejouable, et idempotent : relancer le script sur un
 * projet déjà configuré ne casse rien et ne duplique rien.
 *
 * Ce que le script NE PEUT PAS faire : créer le projet Firebase lui-même.
 * Google impose une authentification interactive pour cela. Le projet doit
 * donc exister avant (voir `docs/06-NOTIFICATIONS-PUSH.md`).
 *
 * Identifiants lus dans `web/.env.local` :
 *   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY
 *
 * Usage :
 *   npm run firebase:android
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "../..");

// ---------------------------------------------------------------------------
// Constantes du projet — la source de vérité, pas la console
// ---------------------------------------------------------------------------

/** Doit correspondre exactement à `applicationId` dans `mobile/android/app/build.gradle.kts`. */
const PAQUET = "td.lyceerenaissance.lgr_parents";
const PSEUDO = "LGR Parents";

/**
 * Empreintes du certificat de signature de l'école.
 *
 * Inutiles pour le push seul, indispensables pour la connexion Google et les
 * liens profonds. Les déclarer tout de suite évite d'avoir à rouvrir la
 * console le jour où l'une de ces fonctions est ajoutée — et surtout d'avoir
 * à retrouver où est passé le keystore.
 */
const EMPREINTES = [
  { certificat: "SHA_1", valeur: "41498b8e1932b3e84a577ba31eb9d14ff8c0126a" },
  {
    certificat: "SHA_256",
    valeur: "ec256fb18959c1dd2c5de8348bcaba04eec7ec73d67452b3faba7068ed65af5f",
  },
];

/**
 * Portée demandée.
 *
 * `firebase.messaging` suffit à ENVOYER une notification, mais pas à
 * administrer le projet. La Management API exige `cloud-platform`, qui est
 * accordée d'office au compte de service Firebase Admin.
 */
const PORTEE = "https://www.googleapis.com/auth/cloud-platform";

// ---------------------------------------------------------------------------
// Environnement
// ---------------------------------------------------------------------------

const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PROJET = process.env.FCM_PROJECT_ID;
const EMAIL = process.env.FCM_CLIENT_EMAIL;
const CLE = (process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!PROJET || !EMAIL || !CLE) {
  console.error(
    "FCM_PROJECT_ID, FCM_CLIENT_EMAIL et FCM_PRIVATE_KEY doivent être définies dans web/.env.local.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Authentification — échange JWT signé, identique à `server/notifications/fcm.ts`
// ---------------------------------------------------------------------------

function base64url(donnees) {
  return Buffer.from(donnees).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function jeton() {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const charge = base64url(
    JSON.stringify({
      iss: EMAIL,
      scope: PORTEE,
      aud: "https://oauth2.googleapis.com/token",
      iat: maintenant,
      exp: maintenant + 3600,
    }),
  );
  const signature = base64url(createSign("RSA-SHA256").update(`${entete}.${charge}`).sign(CLE));

  const reponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${entete}.${charge}.${signature}`,
    }),
  });

  if (!reponse.ok) {
    throw new Error(`Authentification Google refusée (${reponse.status}) : ${await reponse.text()}`);
  }
  return (await reponse.json()).access_token;
}

// ---------------------------------------------------------------------------
// Appels Management API
// ---------------------------------------------------------------------------

let ACCES = "";

async function api(chemin, options = {}) {
  const reponse = await fetch(`https://firebase.googleapis.com/v1beta1/${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCES}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`${options.method ?? "GET"} ${chemin} → ${reponse.status}\n${texte}`);
  }
  return texte ? JSON.parse(texte) : {};
}

/**
 * Attend qu'une opération longue aboutisse.
 *
 * La création d'application est asynchrone côté Google. Enchaîner sans
 * attendre donnerait un 404 sur l'appel suivant — l'application n'existe pas
 * encore au moment où on lui demande sa configuration.
 */
async function attendre(operation) {
  for (let essai = 0; essai < 30; essai += 1) {
    const etat = await api(operation.name);
    if (etat.done) {
      if (etat.error) throw new Error(`Opération échouée : ${JSON.stringify(etat.error)}`);
      return etat.response;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Opération toujours en cours après 30 secondes.");
}

// ---------------------------------------------------------------------------
// Déroulé
// ---------------------------------------------------------------------------

ACCES = await jeton();
console.log(`Projet Firebase : ${PROJET}`);

// 1. L'application existe-t-elle déjà ?
const { apps = [] } = await api(`projects/${PROJET}/androidApps`);
let application = apps.find((a) => a.packageName === PAQUET);

if (application) {
  console.log(`Application Android déjà déclarée : ${application.appId}`);
} else {
  console.log(`Création de l'application Android ${PAQUET}…`);
  const operation = await api(`projects/${PROJET}/androidApps`, {
    method: "POST",
    body: JSON.stringify({ packageName: PAQUET, displayName: PSEUDO }),
  });
  application = await attendre(operation);
  console.log(`Application créée : ${application.appId}`);
}

// 2. Empreintes de signature — ajoutées seulement si absentes.
const { certificates = [] } = await api(`${application.name}/sha`);
for (const empreinte of EMPREINTES) {
  const deja = certificates.some((c) => c.shaHash?.toLowerCase() === empreinte.valeur);
  if (deja) {
    console.log(`Empreinte ${empreinte.certificat} déjà déclarée.`);
    continue;
  }
  await api(`${application.name}/sha`, {
    method: "POST",
    body: JSON.stringify({ shaHash: empreinte.valeur, certType: empreinte.certificat }),
  });
  console.log(`Empreinte ${empreinte.certificat} ajoutée.`);
}

// 3. `google-services.json`, décodé et posé là où Gradle le cherche.
const config = await api(`${application.name}/config`);
const contenu = Buffer.from(config.configFileContents, "base64").toString("utf8");

const destination = path.join(RACINE, "mobile", "android", "app", "google-services.json");
writeFileSync(destination, contenu);

const lu = JSON.parse(contenu);
console.log(`\ngoogle-services.json écrit dans mobile/android/app/`);
console.log(`  projet   : ${lu.project_info.project_id}`);
console.log(`  expéditeur : ${lu.project_info.project_number}`);
console.log(`  paquet   : ${lu.client[0].client_info.android_client_info.package_name}`);
console.log(`\nCe fichier est ignoré par Git (il contient les identifiants du projet).`);
