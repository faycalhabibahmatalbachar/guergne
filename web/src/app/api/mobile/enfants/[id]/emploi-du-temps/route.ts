import type { NextRequest } from "next/server";

import { erreur, exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { eleveAutorise } from "@/server/auth/mobile";
import { emploiDuTempsDeLEleve } from "@/server/domain/mobile";

/** Emploi du temps hebdomadaire de la classe de l'enfant. */

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

  const cours = await emploiDuTempsDeLEleve(parent.tuteurId, id);

  return json({ cours, horodatage: new Date().toISOString() });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
