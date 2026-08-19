import type { NextRequest } from "next/server";

import { exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { annoncesDuTuteur, enfantsDuTuteur } from "@/server/domain/mobile";

/**
 * Écran d'accueil, en un seul appel.
 *
 * Enfants, indicateurs et annonces sont renvoyés ensemble plutôt qu'en trois
 * requêtes. Sur une connexion tchadienne, chaque aller-retour coûte souvent
 * plus cher que la donnée transportée : réduire leur nombre est le levier de
 * performance le plus efficace, bien avant la taille de la réponse.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(requete: NextRequest) {
  const garde = await exigerParent(requete);
  if ("reponse" in garde) return garde.reponse;

  const { parent } = garde;

  const [enfants, annonces] = await Promise.all([
    enfantsDuTuteur(parent.tuteurId),
    annoncesDuTuteur(parent.tuteurId, parent.utilisateurId),
  ]);

  return json({
    profil: {
      utilisateurId: parent.utilisateurId,
      tuteurId: parent.tuteurId,
      nom: parent.nom,
      prenom: parent.prenom,
      telephone: parent.telephone,
    },
    enfants,
    annonces,
    // Horodatage serveur : le client s'en sert pour dater son cache, plutôt
    // que de se fier à l'horloge du téléphone — souvent fausse de plusieurs
    // heures sur les appareils d'entrée de gamme.
    horodatage: new Date().toISOString(),
  });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
