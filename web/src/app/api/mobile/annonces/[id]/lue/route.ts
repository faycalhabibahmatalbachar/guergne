import type { NextRequest } from "next/server";

import { exigerParent, json, preVol } from "@/app/api/mobile/_commun";
import { marquerAnnonceLue } from "@/server/domain/mobile";

/**
 * Accusé de lecture d'une annonce.
 *
 * L'école a besoin de savoir qui a lu une information importante — une
 * fermeture exceptionnelle, une convocation. Sans cet accusé, le secrétariat
 * doit rappeler tout le monde par téléphone.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(requete: NextRequest, contexte: { params: Promise<{ id: string }> }) {
  const garde = await exigerParent(requete);
  if ("reponse" in garde) return garde.reponse;

  const { id } = await contexte.params;
  await marquerAnnonceLue(garde.parent.utilisateurId, id);

  return json({ lue: true });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
