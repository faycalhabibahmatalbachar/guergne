import type { NextRequest } from "next/server";

import { renderToBuffer } from "@react-pdf/renderer";
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { chargerBulletin } from "@/server/domain/bulletin-donnees";
import { Bulletin } from "@/server/pdf/bulletin";

import { erreur, exigerParent, preVol } from "../../../../../_commun";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export function OPTIONS() {
  return preVol();
}

/**
 * Bulletin en PDF, pour l'application des parents.
 *
 * LE MÊME DOCUMENT QUE CELUI DU SECRÉTARIAT
 * ------------------------------------------
 * C'est délibérément le composant `Bulletin` qui rend ce fichier, et non une
 * variante « allégée pour le mobile ». Un parent qui imprime son bulletin doit
 * obtenir exactement ce que l'école lui aurait remis au guichet — même
 * en-tête, même signature, même mention légale. Deux versions d'un document
 * officiel, c'est une occasion de contestation.
 *
 * DEUX VERROUS, ET AUCUN N'EST DE TROP
 * -------------------------------------
 *   1. L'élève doit être un enfant DE CE PARENT.
 *   2. Le bulletin doit être PUBLIÉ. Un brouillon porte des moyennes qui
 *      peuvent encore changer ; le télécharger reviendrait à emporter un
 *      chiffre provisoire.
 *
 * Le second verrou est vérifié en base plutôt que déduit de la liste : rien
 * n'empêche un client d'appeler cette route directement avec un identifiant de
 * période deviné.
 */
export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string; periodeId: string }> },
) {
  const auth = await exigerParent(requete);
  if ("reponse" in auth) return auth.reponse;

  const { id: eleveId, periodeId } = await params;

  const acces = await db.execute<{ inscription_id: string; publie: boolean }>(sql`
    SELECT b.inscription_id, b.est_publie AS publie
      FROM bulletins b
      JOIN inscriptions i  ON i.id = b.inscription_id
      JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id
      JOIN tuteurs t       ON t.id = et.tuteur_id
     WHERE i.eleve_id = ${eleveId}::uuid
       AND b.periode_id = ${periodeId}::uuid
       AND t.utilisateur_id = ${auth.parent.utilisateurId}::uuid
     LIMIT 1
  `);

  const ligne = acces.rows[0];
  if (!ligne) {
    return erreur("introuvable", "Aucun bulletin pour cet enfant sur cette période.", 404);
  }
  if (!ligne.publie) {
    return erreur(
      "non_publie",
      "Ce bulletin n'est pas encore publié par l'établissement.",
      403,
    );
  }

  const donnees = await chargerBulletin(ligne.inscription_id, periodeId);
  if (!donnees) {
    return erreur("introuvable", "Bulletin introuvable.", 404);
  }

  const pdf = await renderToBuffer(<Bulletin d={donnees} />);

  const nom = `bulletin-${donnees.eleve.matricule}-${donnees.periodeLibelle}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // `attachment` : sur un téléphone, on veut le fichier dans les
      // téléchargements, pas une visionneuse qui disparaît au retour arrière.
      "Content-Disposition": `attachment; filename="${nom}.pdf"`,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
