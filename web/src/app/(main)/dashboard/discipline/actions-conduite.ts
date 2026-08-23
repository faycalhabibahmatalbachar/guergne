"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Note de conduite par période (E-53).
 *
 * ELLE ALIMENTAIT DÉJÀ LE BULLETIN
 * ---------------------------------
 * `notes_conduite` est lue par le bulletin — où la conduite est une ligne notée
 * avec son coefficient — et par la génération, qui s'en sert pour proposer une
 * mention : un élève brillant dont la conduite est sous 8 reçoit un
 * avertissement plutôt que des félicitations.
 *
 * Mais AUCUN écran ne permettait de l'écrire. La table était alimentée par les
 * données de démonstration et par rien d'autre — le bulletin affichait donc une
 * conduite qu'il était impossible de saisir.
 *
 * LA SAISIE SE FAIT PAR CLASSE
 * -----------------------------
 * La conduite s'attribue en conseil, classe entière sous les yeux : on compare
 * les élèves entre eux avant de noter. Une saisie élève par élève produirait
 * des notes incohérentes d'un bout à l'autre de la liste.
 */

export interface Resultat {
  ok: boolean;
  message?: string;
  ecrites?: number;
}

const schema = z.object({
  periodeId: z.string().uuid(),
  lignes: z.array(
    z.object({
      inscriptionId: z.string().uuid(),
      note: z.union([z.coerce.number().min(0).max(20), z.null()]),
      appreciation: z.string().trim().max(200).optional(),
    }),
  ),
});

export async function enregistrerConduite(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("discipline:sanctionner");

    const a = schema.safeParse(donnees);
    if (!a.success) return { ok: false, message: "Saisie invalide." };

    const { periodeId, lignes } = a.data;
    let ecrites = 0;

    await db.transaction(async (tx) => {
      for (const l of lignes) {
        // Une case vidée retire la note plutôt que d'enregistrer un zéro : zéro
        // de conduite est une sanction lourde, ce n'est pas « pas encore noté ».
        if (l.note === null) {
          await tx.execute(sql`
            DELETE FROM notes_conduite
             WHERE inscription_id = ${l.inscriptionId}::uuid
               AND periode_id = ${periodeId}::uuid
          `);
          continue;
        }

        await tx.execute(sql`
          INSERT INTO notes_conduite (inscription_id, periode_id, note, appreciation, attribuee_par)
          VALUES (${l.inscriptionId}::uuid, ${periodeId}::uuid, ${l.note},
                  ${l.appreciation || null}, ${acteur.id}::uuid)
          ON CONFLICT (inscription_id, periode_id) DO UPDATE
            SET note = EXCLUDED.note,
                appreciation = EXCLUDED.appreciation,
                attribuee_par = EXCLUDED.attribuee_par,
                modifie_le = now()
        `);
        ecrites += 1;
      }
    });

    await journaliser(acteur, {
      action: "conduite.saisie",
      entite: "notes_conduite",
      apres: { periodeId, notes: ecrites },
    });

    revalidatePath("/dashboard/discipline");

    return {
      ok: true,
      ecrites,
      message: `${ecrites} note(s) de conduite enregistrée(s).`,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour noter la conduite." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("ERROR:")) {
      return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
    }
    console.error("[conduite]", erreur);
    return { ok: false, message: "L'enregistrement a échoué." };
  }
}
