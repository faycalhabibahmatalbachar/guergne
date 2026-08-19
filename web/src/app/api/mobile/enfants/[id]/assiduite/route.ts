import type { NextRequest } from "next/server";

import { erreur, exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { eleveAutorise } from "@/server/auth/mobile";
import { assiduiteDeLEleve, choisirPeriode, periodesDeLEleve } from "@/server/domain/mobile";

/**
 * Assiduité et discipline d'un enfant.
 *
 * GET /api/mobile/enfants/{id}/assiduite?periode={uuid|annee}
 *
 * `periode=annee` renvoie l'année entière : un parent convoqué veut voir
 * l'historique complet, pas seulement le trimestre en cours.
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

  const demandee = requete.nextUrl.searchParams.get("periode");
  const periodes = await periodesDeLEleve(parent.tuteurId, id);

  // `periode=annee` court-circuite le choix : le parent veut tout l'historique.
  const periodeId = demandee === "annee" ? null : (choisirPeriode(periodes, demandee)?.id ?? null);

  const evenements = await assiduiteDeLEleve(parent.tuteurId, id, periodeId);

  return json({
    periodes,
    periodeId,
    evenements,
    horodatage: new Date().toISOString(),
  });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
