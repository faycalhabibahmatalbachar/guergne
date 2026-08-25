"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Enregistrement des appréciations d'une matière pour une classe (E-41).
 *
 * ON ÉCRIT TOUTE LA CLASSE D'UN COUP
 * -----------------------------------
 * Le professeur rédige ses quarante appréciations d'une traite et enregistre
 * une fois. Un envoi par case perdrait le travail à la première coupure
 * réseau — et le réseau coupe, c'est la condition de fonctionnement normale.
 *
 * UNE CASE VIDÉE SUPPRIME LA LIGNE
 * ---------------------------------
 * Elle ne stocke pas une chaîne vide. Le bulletin distingue « pas
 * d'appréciation saisie » — auquel cas il retombe sur la mention déduite de la
 * moyenne — d'une appréciation existante. Une chaîne vide en base rendrait
 * cette distinction impossible et laisserait une colonne blanche au bulletin.
 *
 * L'ENSEIGNANT EST CELUI AFFECTÉ À LA MATIÈRE, PAS L'UTILISATEUR CONNECTÉ
 * ------------------------------------------------------------------------
 * Le censeur qui ressaisit l'appréciation d'un professeur absent ne doit pas
 * apparaître comme son auteur : la colonne dit qui enseigne la matière. Le
 * journal d'audit, lui, garde qui a tapé.
 */

export interface ResultatAppreciations {
  ok: boolean;
  message?: string;
  ecrites?: number;
  supprimees?: number;
}

const schema = z.object({
  classeId: z.string().uuid(),
  matiereId: z.string().uuid(),
  periodeId: z.string().uuid(),
  lignes: z.array(
    z.object({
      inscriptionId: z.string().uuid(),
      appreciation: z.string().trim().max(300),
    }),
  ),
});

export async function enregistrerAppreciations(donnees: unknown): Promise<ResultatAppreciations> {
  try {
    const acteur = await requirePermission("note:saisir");

    const a = schema.safeParse(donnees);
    if (!a.success) return { ok: false, message: "Saisie invalide." };

    const { classeId, matiereId, periodeId, lignes } = a.data;

    const ens = await db.execute<{ id: string }>(sql`
      SELECT af.enseignant_id AS id
        FROM affectations af
       WHERE af.classe_id = ${classeId}::uuid
         AND af.matiere_id = ${matiereId}::uuid
         AND af.active
       LIMIT 1
    `);
    const enseignantId = ens.rows[0]?.id ?? null;

    let ecrites = 0;
    let supprimees = 0;

    await db.transaction(async (tx) => {
      for (const l of lignes) {
        const texte = l.appreciation.trim();

        if (texte === "") {
          const r = await tx.execute(sql`
            DELETE FROM appreciations_matiere
             WHERE inscription_id = ${l.inscriptionId}::uuid
               AND periode_id = ${periodeId}::uuid
               AND matiere_id = ${matiereId}::uuid
          `);
          supprimees += r.rowCount ?? 0;
          continue;
        }

        await tx.execute(sql`
          INSERT INTO appreciations_matiere
            (inscription_id, periode_id, matiere_id, enseignant_id, appreciation)
          VALUES (${l.inscriptionId}::uuid, ${periodeId}::uuid, ${matiereId}::uuid,
                  ${enseignantId}::uuid, ${texte})
          ON CONFLICT (inscription_id, periode_id, matiere_id) DO UPDATE
            SET appreciation = EXCLUDED.appreciation,
                enseignant_id = COALESCE(EXCLUDED.enseignant_id, appreciations_matiere.enseignant_id),
                modifie_le = now()
        `);
        ecrites += 1;
      }
    });

    await journaliser(acteur, {
      action: "appreciation.saisie",
      entite: "appreciations_matiere",
      apres: { classeId, matiereId, periodeId, ecrites, supprimees },
    });

    revalidatePath("/dashboard/notes/appreciations");
    revalidatePath("/dashboard/bulletins");

    return {
      ok: true,
      ecrites,
      supprimees,
      message:
        `${ecrites} appréciation(s) enregistrée(s)` +
        (supprimees > 0 ? `, ${supprimees} retirée(s).` : "."),
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour saisir des appréciations." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("ERROR:")) {
      return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
    }
    console.error("[appreciations]", erreur);
    return { ok: false, message: "L'enregistrement a échoué." };
  }
}
