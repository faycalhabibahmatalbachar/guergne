import type { NextRequest } from "next/server";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

import { erreur, exigerParent, json, preVol } from "../../../_commun";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return preVol();
}

/**
 * Bulletins téléchargeables d'un enfant.
 *
 * SEULS LES BULLETINS PUBLIÉS SONT LISTÉS
 * ----------------------------------------
 * Un bulletin en brouillon existe : il porte des moyennes et un rang, mais le
 * conseil ne s'est pas encore prononcé, et une note peut encore être corrigée.
 * Le montrer à une famille reviendrait à lui annoncer un rang qui changera.
 *
 * La règle est appliquée ICI, dans la requête, et non côté application : un
 * client mobile peut être modifié, une requête SQL non.
 */
export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await exigerParent(requete);
  if ("reponse" in auth) return auth.reponse;

  const { id: eleveId } = await params;

  // Le parent ne peut voir que SES enfants. La vérification passe par
  // `eleve_tuteur`, jamais par un identifiant fourni par le client.
  const autorise = await db.execute<{ inscription_id: string }>(sql`
    SELECT i.id AS inscription_id
      FROM eleve_tuteur et
      JOIN tuteurs t      ON t.id = et.tuteur_id
      JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
     WHERE et.eleve_id = ${eleveId}::uuid
       AND t.utilisateur_id = ${auth.parent.utilisateurId}::uuid
     LIMIT 1
  `);

  if (!autorise.rows[0]) {
    return erreur("non_autorise", "Cet élève ne fait pas partie de vos enfants.", 403);
  }

  const bulletins = await db.execute<{
    inscription_id: string;
    periode_id: string;
    periode: string;
    moyenne: string | null;
    rang: number | null;
    effectif: number | null;
    mention: string | null;
    appreciation: string | null;
    publie_le: string | null;
  }>(sql`
    SELECT b.inscription_id, b.periode_id, p.libelle AS periode,
           b.moyenne_generale::text AS moyenne, b.rang, b.effectif_classe AS effectif,
           b.mention::text AS mention, b.appreciation_generale AS appreciation,
           b.publie_le::text AS publie_le
      FROM bulletins b
      JOIN inscriptions i ON i.id = b.inscription_id
      JOIN periodes p     ON p.id = b.periode_id
     WHERE i.eleve_id = ${eleveId}::uuid
       AND b.est_publie
     ORDER BY p.numero DESC
  `);

  return json({
    bulletins: bulletins.rows.map((b) => ({
      periodeId: b.periode_id,
      periode: b.periode,
      moyenne: b.moyenne === null ? null : Number(b.moyenne),
      rang: b.rang,
      effectif: b.effectif,
      mention: b.mention && b.mention !== "AUCUNE" ? b.mention.replace(/_/g, " ") : null,
      appreciation: b.appreciation,
      publieLe: b.publie_le,
      // L'application n'a pas à composer l'URL elle-même : le jour où le
      // chemin change, un APK déjà installé continuerait d'appeler l'ancien.
      url: `/api/mobile/enfants/${eleveId}/bulletins/${b.periode_id}/pdf`,
    })),
  });
}
