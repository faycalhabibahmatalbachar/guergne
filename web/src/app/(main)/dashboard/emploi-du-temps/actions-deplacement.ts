"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Déplacer un cours d'une case à l'autre (E-46).
 *
 * CONSTRUIRE UN EMPLOI DU TEMPS, C'EST DÉPLACER, PAS CRÉER
 * ----------------------------------------------------------
 * On pose une trentaine de cours par classe, puis on passe des heures à les
 * bouger jusqu'à ce que professeurs et salles s'accordent. Avec le seul
 * formulaire d'ajout, chaque déplacement demande de retirer puis de recréer :
 * six champs à ressaisir pour changer d'heure, et le risque de reposer le
 * cours avec un professeur ou une salle différents de l'original.
 *
 * LE CONFLIT EST REFUSÉ PAR LA BASE, PAS PAR CET APPEL
 * ------------------------------------------------------
 * Le déclencheur `edt_controle_conflit` vérifie déjà les trois ressources —
 * classe, professeur, salle — sur toute la plage de créneaux, y compris pour
 * les séances doubles. Le refaire ici donnerait deux vérités qui finiraient
 * par diverger ; on laisse l'exception remonter et on affiche son message, qui
 * nomme précisément la classe et le créneau en cause.
 *
 * ON NE CHANGE QUE LE JOUR ET L'HEURE
 * ------------------------------------
 * Ni la matière, ni le professeur, ni la salle. Un glissement est un
 * déplacement dans le temps ; changer autre chose au passage transformerait un
 * geste réversible en modification silencieuse du contenu.
 */

export interface ResultatDeplacement {
  ok: boolean;
  message?: string;
}

const schema = z.object({
  coursId: z.string().uuid(),
  jourSemaine: z.coerce.number().int().min(1).max(7),
  creneauId: z.string().uuid(),
});

export async function deplacerCours(donnees: unknown): Promise<ResultatDeplacement> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");

    const a = schema.safeParse(donnees);
    if (!a.success) return { ok: false, message: "Requête invalide." };
    const v = a.data;

    const avant = await db.execute<{ jour: number; creneau_id: string }>(sql`
      SELECT jour_semaine AS jour, creneau_id FROM emploi_du_temps
       WHERE id = ${v.coursId}::uuid
    `);
    if (!avant.rows[0]) return { ok: false, message: "Cours introuvable." };

    // Rien à faire : on le dit plutôt que d'écrire une ligne d'audit vide.
    if (
      Number(avant.rows[0].jour) === v.jourSemaine &&
      avant.rows[0].creneau_id === v.creneauId
    ) {
      return { ok: true, message: "Le cours est déjà à cet emplacement." };
    }

    await db.execute(sql`
      UPDATE emploi_du_temps
         SET jour_semaine = ${v.jourSemaine},
             creneau_id = ${v.creneauId}::uuid
       WHERE id = ${v.coursId}::uuid
    `);

    await journaliser(acteur, {
      action: "emploi_du_temps.cours_deplace",
      entite: "emploi_du_temps",
      entiteId: v.coursId,
      avant: { jour: Number(avant.rows[0].jour), creneauId: avant.rows[0].creneau_id },
      apres: { jour: v.jourSemaine, creneauId: v.creneauId },
    });

    revalidatePath("/dashboard/emploi-du-temps");
    return { ok: true, message: "Cours déplacé." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour modifier l'emploi du temps." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    // Le message du déclencheur nomme la classe et le créneau en conflit :
    // le masquer par un « échec » générique obligerait à chercher soi-même
    // ce qui bloque, sur une grille de cinquante cases.
    if (message.includes("ERROR:")) {
      return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 220) };
    }
    console.error("[deplacer-cours]", erreur);
    return { ok: false, message: "Le déplacement a échoué. Le cours n'a pas bougé." };
  }
}
