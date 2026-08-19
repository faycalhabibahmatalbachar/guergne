import type { NextRequest } from "next/server";

import { erreur, exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { eleveAutorise } from "@/server/auth/mobile";
import { choisirPeriode, periodesDeLEleve, releveDeLEleve } from "@/server/domain/mobile";

/**
 * Relevé de notes d'un enfant.
 *
 * GET /api/mobile/enfants/{id}/notes?periode={uuid}
 *
 * Sans paramètre `periode`, on retient la période courante — ou, si l'on est
 * en vacances, la dernière dont le bulletin est publié : c'est ce qu'un parent
 * veut voir en ouvrant l'écran pendant les congés.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(requete: NextRequest, contexte: { params: Promise<{ id: string }> }) {
  const garde = await exigerParent(requete);
  if ("reponse" in garde) return garde.reponse;

  const { parent } = garde;
  const { id } = await contexte.params;

  if (!(await eleveAutorise(parent.tuteurId, id))) {
    // 404 et non 403 : répondre « interdit » confirmerait l'existence de
    // l'élève à qui essaie des identifiants au hasard.
    return erreur("introuvable", "Élève introuvable.", 404);
  }

  const periodes = await periodesDeLEleve(parent.tuteurId, id);
  if (periodes.length === 0) {
    return json({ periodes: [], releve: null });
  }

  const choisie = choisirPeriode(periodes, requete.nextUrl.searchParams.get("periode"))!;
  const releve = await releveDeLEleve(parent.tuteurId, id, choisie.id);

  return json({ periodes, releve, horodatage: new Date().toISOString() });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
