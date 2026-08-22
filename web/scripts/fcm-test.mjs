#!/usr/bin/env node
/**
 * Vérifie la chaîne de notification, du compte de service au téléphone.
 *
 * POURQUOI DEUX MODES
 * -------------------
 * Une notification qui n'arrive pas peut échouer à cinq endroits : les
 * identifiants, la portée OAuth, le projet, le jeton de l'appareil, le canal
 * Android. Un seul essai « ça marche / ça ne marche pas » ne dit pas lequel.
 *
 *   npm run fcm:test                  → vérifie ce qui ne dépend pas d'un
 *                                       téléphone : identifiants, jeton
 *                                       d'accès, existence du projet.
 *   npm run fcm:test -- <jetonFcm>    → envoie une vraie notification.
 *   npm run fcm:test -- --appareils   → liste les appareils enregistrés en
 *                                       base et envoie à chacun.
 *
 * Le mode sans argument s'appuie sur un jeton d'appareil volontairement
 * invalide. Google répond alors 400 INVALID_ARGUMENT — ce qui prouve que la
 * requête a été *authentifiée* et *routée vers le bon projet* avant d'être
 * refusée sur le destinataire. Un 401 signifierait des identifiants fautifs,
 * un 403 une API désactivée, un 404 un projet inexistant.
 */

import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));

const envLocal = path.resolve(ICI, "../.env.local");
if (existsSync(envLocal)) {
  for (const ligne of readFileSync(envLocal, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PROJET = process.env.FCM_PROJECT_ID;
const EMAIL = process.env.FCM_CLIENT_EMAIL;
const CLE = (process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!PROJET || !EMAIL || !CLE) {
  console.error("✗ FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY manquantes dans web/.env.local.");
  process.exit(1);
}

const base64url = (d) =>
  Buffer.from(d).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

console.log(`Projet          : ${PROJET}`);
console.log(`Compte de service : ${EMAIL}`);

// --- 1. La clé signe-t-elle ? -----------------------------------------------
let assertion;
try {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const charge = base64url(
    JSON.stringify({
      iss: EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: maintenant,
      exp: maintenant + 3600,
    }),
  );
  const signature = base64url(createSign("RSA-SHA256").update(`${entete}.${charge}`).sign(CLE));
  assertion = `${entete}.${charge}.${signature}`;
  console.log("✓ Clé privée lisible et signature RSA produite.");
} catch (erreur) {
  console.error(`✗ Clé privée illisible : ${erreur.message}`);
  console.error("  La clé doit tenir sur UNE ligne, avec ses sauts échappés en \\n.");
  process.exit(1);
}

// --- 2. Google accorde-t-il un jeton d'accès ? ------------------------------
const reponseJeton = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});

if (!reponseJeton.ok) {
  console.error(`✗ Google refuse le compte de service (${reponseJeton.status}) :`);
  console.error(`  ${await reponseJeton.text()}`);
  process.exit(1);
}

const { access_token: acces, expires_in: duree } = await reponseJeton.json();
console.log(`✓ Jeton d'accès obtenu, valable ${Math.round(duree / 60)} minutes.`);

// --- 3. Destinataires -------------------------------------------------------
const argument = process.argv[2];
let destinataires;
let reel = true;

if (argument === "--appareils") {
  const pg = (await import("pg")).default;
  const url =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(
    `SELECT jeton_fcm, plateforme FROM appareils WHERE actif AND jeton_fcm IS NOT NULL`,
  );
  await client.end();

  if (rows.length === 0) {
    console.log("\nAucun appareil enregistré : aucun parent n'a encore ouvert l'application.");
    console.log("Installez l'APK, connectez-vous, puis relancez cette commande.");
    process.exit(0);
  }
  destinataires = rows.map((r) => r.jeton_fcm);
  console.log(`\n${rows.length} appareil(s) enregistré(s).`);
} else if (argument) {
  destinataires = [argument];
} else {
  // Jeton syntaxiquement plausible mais inexistant : on teste la chaîne, pas
  // un téléphone.
  destinataires = [`${"c".repeat(22)}:APA91b${"X".repeat(134)}`];
  reel = false;
  console.log("\nAucun jeton fourni : essai à vide sur un destinataire inexistant.");
}

// --- 4. Envoi ---------------------------------------------------------------
for (const jeton of destinataires) {
  const reponse = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJET}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acces}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: jeton,
        notification: {
          title: "Lycée Guergné La Renaissance",
          body: "Essai de notification. Si vous lisez ceci, tout fonctionne.",
        },
        data: { route: "/accueil", charge: "{}" },
        android: { priority: "high", notification: { channel_id: "lgr_defaut", sound: "default" } },
      },
    }),
  });

  const texte = await reponse.text();
  const apercu = jeton.length > 24 ? `${jeton.slice(0, 12)}…${jeton.slice(-6)}` : jeton;

  if (reponse.ok) {
    console.log(`✓ ${apercu} → accepté par Firebase.`);
    if (reel) console.log("  Le téléphone doit sonner dans les secondes qui viennent.");
    continue;
  }

  // Un destinataire inconnu se solde par UNREGISTERED (404) s'il a la forme
  // d'un jeton, par INVALID_ARGUMENT (400) sinon. Les deux prouvent la même
  // chose : la requête a franchi l'authentification et atteint le bon projet
  // avant d'échouer sur le seul élément qu'on sait faux, le téléphone.
  if (!reel && (texte.includes("UNREGISTERED") || texte.includes("INVALID_ARGUMENT"))) {
    console.log("✓ Requête authentifiée et routée vers le projet.");
    console.log("  Google refuse le destinataire fictif, ce qui est le résultat attendu.");
    console.log("\nLa chaîne serveur est opérationnelle. Reste à la valider sur un vrai");
    console.log("téléphone : npm run fcm:test -- --appareils, une fois l'application installée.");
    process.exit(0);
  }

  console.error(`✗ ${apercu} → ${reponse.status}`);
  console.error(`  ${texte.slice(0, 400)}`);
  if (reponse.status === 401) console.error("  → identifiants refusés.");
  if (reponse.status === 403) console.error("  → API Firebase Cloud Messaging désactivée sur le projet.");
  if (reponse.status === 404) console.error("  → projet introuvable, ou jeton d'appareil périmé.");
  process.exitCode = 1;
}
