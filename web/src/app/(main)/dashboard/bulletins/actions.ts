"use server";

import { revalidatePath } from "next/cache";

import { journaliser } from "@/server/audit";
import {
  ErreurGenerationRefusee,
  genererBulletins,
  type DerogationGeneration,
  type RapportGeneration,
} from "@/server/domain/generation-bulletins";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface ResultatGeneration {
  ok: boolean;
  message?: string;
  rapport?: RapportGeneration;
  /** Vrai quand c'est un verrou qui bloque, et non une panne. */
  refuse?: boolean;
}

/**
 * Produit les bulletins d'une classe pour une période.
 *
 * `bulletin:generer` et non `bulletin:lire` : produire un bulletin fige des
 * moyennes et un classement, et c'est sur ce classement que le conseil de
 * classe décide d'un passage. Le droit de consulter ne peut pas emporter celui
 * de recalculer.
 *
 * LA DÉROGATION EST UN AUTRE DROIT, ET UNE TRACE
 * -----------------------------------------------
 * Passer outre un verrou ou des bulletins publiés ne relève pas de celui qui
 * génère : c'est défaire une décision de clôture. On exige donc en plus
 * `periode:verrouiller`, le droit de poser et de lever les verrous, et on
 * consigne le motif AVANT de générer — une tentative repoussée laisse elle
 * aussi sa trace, ce qui est précisément ce qu'on veut pouvoir relire.
 */
export async function genererPourClasse(
  classeId: string,
  periodeId: string,
  derogation?: DerogationGeneration,
): Promise<ResultatGeneration> {
  try {
    const acteur = await requirePermission("bulletin:generer");

    const forcee = derogation?.forcerMalgreVerrou === true;
    if (forcee) {
      await requirePermission("periode:verrouiller");
      await journaliser(acteur, {
        action: "bulletins.derogation_verrou",
        entite: "classes",
        entiteId: classeId,
        motif: derogation?.motif ?? null,
        apres: { periode_id: periodeId },
      });
    }

    const rapport = await genererBulletins(classeId, periodeId, derogation);

    await journaliser(acteur, {
      action: "bulletins.generes",
      entite: "classes",
      entiteId: classeId,
      motif: rapport.motifDerogation ?? null,
      apres: {
        classe: rapport.classe,
        periode: rapport.periode,
        bulletins: rapport.bulletinsEcrits,
        sans_note: rapport.sansNote,
        derogation: rapport.motifDerogation ? true : undefined,
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
    // Un verrou n'est pas une panne : sa phrase est écrite pour l'utilisateur
    // et dit quoi faire ensuite. On la transmet entière, sans la tronquer ni
    // l'écrire dans les logs d'erreur où elle passerait pour un incident.
    if (erreur instanceof ErreurGenerationRefusee) {
      return { ok: false, refuse: true, message: erreur.message };
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
