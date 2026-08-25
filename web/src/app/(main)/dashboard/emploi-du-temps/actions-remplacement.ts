"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Déclaration d'un remplacement (E-49).
 *
 * TROIS ISSUES POSSIBLES POUR UN COURS NON ASSURÉ, ET UNE SEULE TABLE
 * --------------------------------------------------------------------
 * Remplacé par un collègue, rattrapé à une autre date, ou ni l'un ni l'autre.
 * Le troisième cas doit être enregistré comme les deux autres : c'est
 * précisément l'heure perdue, celle qui manquera au programme et qu'aucun
 * comptage ne retrouvera si on ne l'écrit pas. Une table qui ne stockerait que
 * les remplacements effectifs donnerait un bilan flatteur et faux.
 *
 * LE MOTIF EST OBLIGATOIRE
 * -------------------------
 * Il distingue la maladie de la convocation administrative, et c'est ce qui
 * permet de dire, en fin de trimestre, si le service est désorganisé ou si un
 * agent est défaillant. « Absent » n'apprend rien.
 *
 * L'UNICITÉ EST SUR (COURS, DATE)
 * --------------------------------
 * Redéclarer le même cours le même jour corrige la déclaration précédente au
 * lieu d'en empiler une seconde — sinon le même cours compterait deux fois dans
 * le suivi de l'absentéisme.
 */

export interface ResultatRemplacement {
  ok: boolean;
  message?: string;
  id?: string;
}

const schema = z
  .object({
    emploiDuTempsId: z.string().uuid(),
    dateCours: z.string().min(10, "Date requise"),
    motif: z.string().trim().min(3, "Le motif est obligatoire."),
    remplacantId: z.string().uuid().nullable().optional(),
    dateRattrapage: z.string().nullable().optional(),
  })
  .refine((v) => !(v.remplacantId && v.dateRattrapage), {
    message: "Un cours est remplacé OU rattrapé, pas les deux.",
    path: ["dateRattrapage"],
  });

export async function declarerRemplacement(donnees: unknown): Promise<ResultatRemplacement> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");

    const a = schema.safeParse(donnees);
    if (!a.success) {
      return { ok: false, message: a.error.issues[0]?.message ?? "Requête invalide." };
    }
    const v = a.data;

    const [cours] = (
      await db.execute<{ enseignant_id: string | null; jour: number }>(sql`
        SELECT e.enseignant_id, e.jour_semaine AS jour
          FROM emploi_du_temps e
         WHERE e.id = ${v.emploiDuTempsId}::uuid
      `)
    ).rows;

    if (!cours) return { ok: false, message: "Cours introuvable." };
    if (!cours.enseignant_id) {
      // Sans professeur titulaire, il n'y a personne à remplacer : le cours est
      // déjà découvert, et c'est le contrôle de couverture qui doit le dire.
      return {
        ok: false,
        message: "Ce cours n'a aucun professeur affecté : il n'y a pas de remplacement à déclarer.",
      };
    }

    // La date doit tomber sur le bon jour de semaine, sinon on déclare absent
    // un professeur qui n'avait pas cours ce jour-là — et le suivi devient faux.
    const [jour] = (
      await db.execute<{ isodow: number }>(sql`
        SELECT EXTRACT(ISODOW FROM ${v.dateCours}::date)::int AS isodow
      `)
    ).rows;

    if (Number(jour?.isodow) !== Number(cours.jour)) {
      return {
        ok: false,
        message: "Cette date ne correspond pas au jour de ce cours dans l'emploi du temps.",
      };
    }

    if (v.remplacantId && v.remplacantId === cours.enseignant_id) {
      return { ok: false, message: "Le remplaçant ne peut pas être le professeur absent." };
    }

    const r = await db.execute<{ id: string }>(sql`
      INSERT INTO remplacements
        (emploi_du_temps_id, enseignant_absent_id, enseignant_remplacant_id,
         date_cours, motif, date_rattrapage, decide_par)
      VALUES (${v.emploiDuTempsId}::uuid, ${cours.enseignant_id}::uuid,
              ${v.remplacantId ?? null}::uuid, ${v.dateCours}::date, ${v.motif},
              ${v.dateRattrapage || null}::date, ${acteur.id}::uuid)
      -- Le prédicat est répété : l'index d'unicité est PARTIEL, et PostgreSQL
      -- n'infère une cible de conflit que si elle le reproduit.
      ON CONFLICT (emploi_du_temps_id, date_cours) WHERE emploi_du_temps_id IS NOT NULL
      DO UPDATE
        SET enseignant_remplacant_id = EXCLUDED.enseignant_remplacant_id,
            motif = EXCLUDED.motif,
            date_rattrapage = EXCLUDED.date_rattrapage,
            decide_par = EXCLUDED.decide_par
      RETURNING id
    `);

    await journaliser(acteur, {
      action: "remplacement.declare",
      entite: "remplacements",
      entiteId: r.rows[0]?.id,
      apres: {
        cours: v.emploiDuTempsId,
        date: v.dateCours,
        remplacant: v.remplacantId ?? null,
        rattrapage: v.dateRattrapage ?? null,
      },
      motif: v.motif,
    });

    revalidatePath("/dashboard/emploi-du-temps/journee");

    return {
      ok: true,
      id: r.rows[0]?.id,
      message: v.remplacantId
        ? "Remplacement enregistré."
        : v.dateRattrapage
          ? "Rattrapage programmé."
          : "Cours non assuré enregistré.",
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour gérer l'emploi du temps." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("ERROR:")) {
      return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
    }
    console.error("[remplacement]", erreur);
    return { ok: false, message: "L'enregistrement a échoué." };
  }
}

/**
 * Annule une déclaration.
 *
 * Supprime la ligne plutôt que de la marquer annulée : une déclaration erronée
 * n'est pas un événement du service, c'est une faute de frappe. La conserver
 * gonflerait le compteur d'absences du professeur concerné.
 */
export async function annulerRemplacement(id: string): Promise<ResultatRemplacement> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");

    await db.execute(sql`DELETE FROM remplacements WHERE id = ${id}::uuid`);

    await journaliser(acteur, {
      action: "remplacement.annule",
      entite: "remplacements",
      entiteId: id,
    });

    revalidatePath("/dashboard/emploi-du-temps/journee");
    return { ok: true, message: "Déclaration retirée." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour gérer l'emploi du temps." };
    }
    return { ok: false, message: "Le retrait a échoué." };
  }
}
