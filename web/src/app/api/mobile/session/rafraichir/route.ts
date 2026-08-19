import type { NextRequest } from "next/server";

import { erreur, json, preVol } from "@/app/api/mobile/_commun";
import { emettreJetonAcces, rafraichir } from "@/server/auth/mobile";

/**
 * Rotation du jeton de rafraîchissement.
 *
 * POST { rafraichissement }
 *
 * Le jeton présenté est consommé et remplacé. L'application DOIT enregistrer
 * le nouveau : l'ancien ne fonctionnera plus, et le représenter serait
 * interprété comme un vol.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(requete: NextRequest) {
  let corps: { rafraichissement?: string };
  try {
    corps = await requete.json();
  } catch {
    return erreur("requete_invalide", "Requête illisible.");
  }

  const presente = (corps.rafraichissement ?? "").trim();
  if (!presente) return erreur("jeton_absent", "Jeton de rafraîchissement manquant.", 401);

  const resultat = await rafraichir(presente);

  if (!resultat.ok) {
    const message =
      resultat.motif === "rejeu"
        ? "Session invalidée pour raison de sécurité. Reconnectez-vous."
        : resultat.motif === "compte_inactif"
          ? "Ce compte a été désactivé par l'école."
          : "Session expirée. Reconnectez-vous.";

    return erreur("jeton_invalide", message, 401);
  }

  const acces = emettreJetonAcces(resultat.utilisateurId!, resultat.role!);

  return json({
    acces: acces.jeton,
    expireDans: acces.expireDans,
    rafraichissement: resultat.nouveauJeton,
  });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
