import type { NextRequest } from "next/server";

import { erreur, exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { eleveAutorise } from "@/server/auth/mobile";
import { financesDeLEleve } from "@/server/domain/mobile";

/**
 * Situation financière d'un enfant : échéances et reçus.
 *
 * Lecture seule, et cela restera ainsi tant qu'aucun paiement mobile n'est
 * intégré. Afficher un bouton « Payer » qui ne paie pas serait pire que de
 * ne rien afficher.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(requete: NextRequest, contexte: { params: Promise<{ id: string }> }) {
  const garde = await exigerParent(requete);
  if ("reponse" in garde) return garde.reponse;

  const { parent } = garde;
  const { id } = await contexte.params;

  if (!(await eleveAutorise(parent.tuteurId, id))) {
    return erreur("introuvable", "Élève introuvable.", 404);
  }

  const situation = await financesDeLEleve(parent.tuteurId, id);

  return json({ ...situation, horodatage: new Date().toISOString() });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
