import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { erreur, exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { db } from "@/server/db";

/**
 * Enregistrement du jeton push.
 *
 * FCM renouvelle son jeton sans prévenir — réinstallation, restauration,
 * effacement des données. L'application le repousse donc à chaque démarrage,
 * sinon les notifications d'absence cesseraient silencieusement d'arriver,
 * ce qui est le pire mode de panne pour cette fonction.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(requete: NextRequest) {
  const garde = await exigerParent(requete);
  if ("reponse" in garde) return garde.reponse;

  let corps: {
    jetonFcm?: string;
    plateforme?: string;
    modele?: string;
    versionApp?: string;
    langue?: string;
  };
  try {
    corps = await requete.json();
  } catch {
    return erreur("requete_invalide", "Requête illisible.");
  }

  const jeton = (corps.jetonFcm ?? "").trim();
  if (!jeton) return erreur("jeton_absent", "Jeton FCM manquant.");

  const plateforme = corps.plateforme === "ios" ? "ios" : "android";

  await db.execute(sql`
    INSERT INTO appareils (utilisateur_id, jeton_fcm, plateforme, modele, version_app, langue)
    VALUES (${garde.parent.utilisateurId}::uuid, ${jeton}, ${plateforme},
            ${corps.modele ?? null}, ${corps.versionApp ?? null}, ${corps.langue ?? "fr"})
    ON CONFLICT (jeton_fcm) DO UPDATE
      SET utilisateur_id = EXCLUDED.utilisateur_id,
          actif = TRUE,
          modele = EXCLUDED.modele,
          version_app = EXCLUDED.version_app,
          derniere_utilisation = now()
  `);

  return json({ enregistre: true });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
