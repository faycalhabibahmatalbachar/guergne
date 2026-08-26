import type { NextRequest } from "next/server";

import { erreur, exigerParent, preVol } from "@/app/api/mobile/_commun";
import { eleveAutorise } from "@/server/auth/mobile";
import { db } from "@/server/db";
import { lireFichier } from "@/server/stockage";
import { sql } from "drizzle-orm";

/**
 * Photo d'un élève, pour l'application des parents.
 *
 * POURQUOI UNE ROUTE À PART PLUTÔT QUE `/api/fichiers/{id}`
 * ----------------------------------------------------------
 * Celle-ci exige `exigerSession()`, c'est-à-dire un COOKIE de session web. Un
 * parent sur téléphone n'en a pas : il porte un jeton `Bearer`. La photo lui
 * serait donc refusée par 401, et l'application afficherait éternellement les
 * initiales sans qu'on comprenne pourquoi.
 *
 * Surtout, la route générique vérifie qu'on est connecté — pas qu'on a le
 * droit de voir CET enfant. Ici le contrôle porte sur le lien tuteur-élève,
 * comme pour toutes les autres routes mobiles : un parent ne voit que la photo
 * de ses enfants.
 *
 * L'ADRESSE PORTE L'IDENTIFIANT DE L'ÉLÈVE, PAS CELUI DU FICHIER
 * ---------------------------------------------------------------
 * Deux conséquences utiles. Le client n'a pas à connaître `photoId` — il
 * demande « la photo de cet enfant ». Et le jour où la photo est remplacée,
 * l'adresse ne change pas : c'est le contenu servi qui change, et le cache
 * privé s'en charge par `ETag`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  requete: NextRequest,
  contexte: { params: Promise<{ id: string }> },
) {
  const garde = await exigerParent(requete);
  if ("reponse" in garde) return garde.reponse;

  const { parent } = garde;
  const { id } = await contexte.params;

  if (!(await eleveAutorise(parent.tuteurId, id))) {
    // 404 et non 403 : répondre « interdit » confirmerait l'existence de
    // l'élève à qui essaie des identifiants au hasard.
    return erreur("introuvable", "Élève introuvable.", 404);
  }

  // `photo_id` et NON `photo_url`.
  //
  // Les deux colonnes coexistent : `photo_url` date du schéma d'origine, où la
  // photo était une adresse externe ; `photo_id` l'a remplacée en 0022 quand
  // le stockage est passé en base. La première est vide sur les 549 élèves, la
  // seconde renseignée sur 548 — lire la mauvaise renvoyait un 404 pour tout
  // le monde, et l'application affichait les initiales en silence.
  const r = await db.execute<{ photo_id: string | null }>(sql`
    SELECT photo_id::text FROM eleves WHERE id = ${id}::uuid
  `);

  const reference = r.rows[0]?.photo_id;
  if (!reference) return erreur("introuvable", "Aucune photo.", 404);

  // `photo_url` porte l'identifiant du fichier stocké. On refuse tout ce qui
  // n'est pas un UUID plutôt que de le passer au stockage : la colonne est du
  // texte libre, et une valeur importée pourrait être un chemin.
  if (!/^[0-9a-f-]{36}$/i.test(reference)) {
    return erreur("introuvable", "Aucune photo.", 404);
  }

  const fichier = await lireFichier(reference);
  if (!fichier) return erreur("introuvable", "Aucune photo.", 404);

  return new Response(new Uint8Array(fichier.contenu), {
    headers: {
      "Content-Type": fichier.mimeType ?? "image/jpeg",
      "Content-Length": String(fichier.contenu.length),
      // Cache PRIVÉ : c'est la photo d'un enfant. Long, parce que le contenu
      // ne change jamais — une nouvelle photo crée un nouvel enregistrement.
      "Cache-Control": "private, max-age=86400",
      ETag: `"${reference}"`,
    },
  });
}

export { preVol as OPTIONS };
