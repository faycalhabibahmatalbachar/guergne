"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";

import { paireCanonique, schemaExamenDoublon } from "@/lib/examen-doublon";
import { db } from "@/server/db";
import { journalAudit } from "@/server/db/schema";
import { requirePermission } from "@/server/guard";

export type ResultatExamen = { ok: boolean; message: string };

/** Validation manuelle d'une suspicion : il s'agit seulement d'un verdict
 * d'examen audit-able, PAS d'une fusion ou d'un transfert d'accès.
 * L'insertion dans journal_audit doit réussir avant de confirmer à l'utilisateur.
 */
export async function enregistrerExamenDoublon(input: unknown): Promise<ResultatExamen> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    await requirePermission("audit:lire");
    const validation = schemaExamenDoublon.safeParse(input);
    if (!validation.success)
      return { ok: false, message: "Deux dossiers distincts, motif détaillé et confirmation de vérification requis." };
    const d = validation.data;
    if (d.tuteurId === d.autreTuteurId) return { ok: false, message: "Comparez deux dossiers distincts." };
    const [premier, second] = paireCanonique(d.tuteurId, d.autreTuteurId);
    const r = await db.execute<{ id: string }>(sql`
      SELECT t.id::text AS id FROM tuteurs t
      WHERE t.id IN (${premier}::uuid, ${second}::uuid)
        AND regexp_replace(t.telephone, '[^0-9]', '', 'g') <> ''
        AND regexp_replace(t.telephone, '[^0-9]', '', 'g') = (
          SELECT regexp_replace(telephone, '[^0-9]', '', 'g')
          FROM tuteurs WHERE id = ${premier}::uuid
        )
    `);
    if (r.rows.length !== 2) return { ok: false, message: "Les numéros ne correspondent plus. Actualisez l'analyse." };
    await db.insert(journalAudit).values({
      utilisateurId: acteur.id,
      roleActeur: acteur.role,
      nomActeur: acteur.prenom + " " + acteur.nom,
      action: "tuteur.doublon_examine",
      entite: "tuteurs",
      entiteId: premier,
      valeursApres: {
        autreTuteurId: second,
        decision: d.decision,
        justificatifsVerifies: true,
      },
      motif: d.motif,
    });
    revalidatePath("/dashboard/parents/familles/doublons");
    revalidatePath("/dashboard/parents/familles/doublons/" + d.tuteurId);
    revalidatePath("/dashboard/parents/familles/doublons/" + d.autreTuteurId);
    return {
      ok: true,
      message:
        d.decision === "DISTINCTS"
          ? "Deux personnes distinctes : examen journalisé. Le numéro partagé reste signalé."
          : "Possible même personne : examen transmis pour rapprochement ultérieur. Aucune fiche fusionnée.",
    };
  } catch (e) {
    console.error("[parents:examen-doublon]", e);
    return { ok: false, message: "L'examen n'a pas pu être enregistré. Aucun dossier modifié." };
  }
}
