"use server";

import { revalidatePath } from "next/cache";

import { journaliser } from "@/server/audit";
import { genererBulletins, type RapportGeneration } from "@/server/domain/generation-bulletins";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface ResultatGeneration {
  ok: boolean;
  message?: string;
  rapport?: RapportGeneration;
}

/**
 * Produit les bulletins d'une classe pour une période.
 *
 * `bulletin:generer` et non `bulletin:lire` : produire un bulletin fige des
 * moyennes et un classement, et c'est sur ce classement que le conseil de
 * classe décide d'un passage. Le droit de consulter ne peut pas emporter celui
 * de recalculer.
 */
export async function genererPourClasse(
  classeId: string,
  periodeId: string,
): Promise<ResultatGeneration> {
  try {
    const acteur = await requirePermission("bulletin:generer");

    const rapport = await genererBulletins(classeId, periodeId);

    await journaliser(acteur, {
      action: "bulletins.generes",
      entite: "classes",
      entiteId: classeId,
      apres: {
        classe: rapport.classe,
        periode: rapport.periode,
        bulletins: rapport.bulletinsEcrits,
        sans_note: rapport.sansNote,
      },
    });

    revalidatePath("/dashboard/bulletins");

    return {
      ok: true,
      rapport,
      message:
        rapport.sansNote === 0
          ? `${rapport.bulletinsEcrits} bulletin(s) produit(s) pour ${rapport.classe}.`
          : `${rapport.bulletinsEcrits} bulletin(s) produit(s), ${rapport.sansNote} élève(s) sans note exploitable.`,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour produire les bulletins." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    console.error("[generation-bulletins]", erreur);
    return {
      ok: false,
      // Les messages du domaine sont écrits pour être lus (« Classe ou période
      // introuvable », « Poids d'évaluation invalide »).
      message: message.slice(0, 200) || "La génération a échoué.",
    };
  }
}
