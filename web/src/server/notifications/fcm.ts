import "server-only";

import { createSign } from "node:crypto";

/**
 * Expédition des notifications push via Firebase Cloud Messaging (HTTP v1).
 *
 * On n'utilise PAS le SDK `firebase-admin` : il pèse plusieurs dizaines de
 * mégaoctets et embarque un client gRPC dont nous n'avons aucun usage. Ici il
 * ne s'agit que de signer un jeton et d'appeler une URL — 80 lignes suffisent,
 * et le démarrage à froid de la fonction serverless s'en trouve divisé.
 *
 * Identifiants attendus (Console Firebase → Paramètres du projet → Comptes de
 * service → Générer une nouvelle clé privée) :
 *   FCM_PROJECT_ID   = "project_id" du JSON
 *   FCM_CLIENT_EMAIL = "client_email" du JSON
 *   FCM_PRIVATE_KEY  = "private_key" du JSON (avec ses \n littéraux)
 */

const PORTEE = "https://www.googleapis.com/auth/firebase.messaging";

export interface ResultatEnvoi {
  succes: boolean;
  erreur?: string;
  /** Jetons refusés par Google : appareil désinstallé ou jeton périmé. */
  jetonsInvalides?: string[];
}

export function fcmConfigure(): boolean {
  return Boolean(
    process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY,
  );
}

// Le jeton d'accès vaut une heure : le redemander à chaque notification
// ajouterait un aller-retour réseau par message envoyé.
let jetonCache: { valeur: string; expireLe: number } | null = null;

function base64url(donnees: Buffer | string): string {
  return Buffer.from(donnees)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Obtient un jeton d'accès Google par échange JWT signé RS256.
 * C'est le flux « service account » standard, sans dépendance externe.
 */
async function obtenirJeton(): Promise<string> {
  if (jetonCache && jetonCache.expireLe > Date.now() + 60_000) {
    return jetonCache.valeur;
  }

  const email = process.env.FCM_CLIENT_EMAIL as string;
  // Les variables d'environnement stockent les sauts de ligne échappés.
  const cle = (process.env.FCM_PRIVATE_KEY as string).replace(/\\n/g, "\n");

  const maintenant = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const charge = base64url(
    JSON.stringify({
      iss: email,
      scope: PORTEE,
      aud: "https://oauth2.googleapis.com/token",
      iat: maintenant,
      exp: maintenant + 3600,
    }),
  );

  const signature = base64url(
    createSign("RSA-SHA256").update(`${entete}.${charge}`).sign(cle),
  );

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

  const donnees = (await reponse.json()) as { access_token: string; expires_in: number };
  jetonCache = {
    valeur: donnees.access_token,
    expireLe: Date.now() + donnees.expires_in * 1000,
  };
  return donnees.access_token;
}

/**
 * Envoie une notification à un appareil.
 *
 * FCM HTTP v1 n'accepte qu'un destinataire par requête. On envoie donc en
 * parallèle sur les jetons d'un même utilisateur — un parent a souvent son
 * téléphone et une tablette.
 */
async function envoyerAUnJeton(
  jetonAcces: string,
  jetonAppareil: string,
  contenu: { titre: string; corps: string; route?: string | null; donnees?: unknown },
): Promise<{ ok: boolean; invalide: boolean; erreur?: string }> {
  const projet = process.env.FCM_PROJECT_ID;

  const reponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projet}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jetonAcces}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: jetonAppareil,
        notification: { title: contenu.titre, body: contenu.corps },
        data: {
          route: contenu.route ?? "",
          // FCM n'accepte que des chaînes dans `data`.
          charge: JSON.stringify(contenu.donnees ?? {}),
        },
        android: {
          priority: "high",
          notification: { channel_id: "lgr_defaut", sound: "default" },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      },
    }),
  });

  if (reponse.ok) return { ok: true, invalide: false };

  const texte = await reponse.text();
  // 404 UNREGISTERED / 400 INVALID_ARGUMENT sur le jeton : l'appareil a
  // désinstallé l'application ou le jeton a été renouvelé. Inutile de réessayer.
  const invalide =
    reponse.status === 404 ||
    texte.includes("UNREGISTERED") ||
    texte.includes("INVALID_ARGUMENT");

  return { ok: false, invalide, erreur: `${reponse.status} ${texte.slice(0, 200)}` };
}

export async function envoyerPush(
  jetonsAppareils: string[],
  contenu: { titre: string; corps: string; route?: string | null; donnees?: unknown },
): Promise<ResultatEnvoi> {
  if (!fcmConfigure()) {
    return { succes: false, erreur: "Firebase non configuré (FCM_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)." };
  }
  if (jetonsAppareils.length === 0) {
    return { succes: false, erreur: "Aucun appareil enregistré pour ce destinataire." };
  }

  try {
    const jetonAcces = await obtenirJeton();
    const resultats = await Promise.all(
      jetonsAppareils.map((j) => envoyerAUnJeton(jetonAcces, j, contenu)),
    );

    const invalides = jetonsAppareils.filter((_, i) => resultats[i].invalide);
    const auMoinsUn = resultats.some((r) => r.ok);

    return {
      // Un seul appareil joignable suffit : le parent a reçu le message.
      succes: auMoinsUn,
      erreur: auMoinsUn ? undefined : resultats.find((r) => r.erreur)?.erreur,
      jetonsInvalides: invalides.length > 0 ? invalides : undefined,
    };
  } catch (erreur) {
    return {
      succes: false,
      erreur: erreur instanceof Error ? erreur.message : "Échec d'envoi push.",
    };
  }
}
