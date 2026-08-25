"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Levée individuelle de la retenue pour impayé (E-58).
 *
 * CE N'EST PAS UNE ÉCHAPPATOIRE, C'EST CE QUI REND LA RÈGLE TENABLE
 * ------------------------------------------------------------------
 * Un cas social, un dossier de bourse en cours d'instruction, un parent en
 * litige de bonne foi. Sans levée possible, le secrétariat contournerait la
 * règle en désactivant le paramètre pour toute l'école le temps d'une
 * publication — et on perdrait à la fois la règle et la trace.
 *
 * LE MOTIF EST EXIGÉ, ET PAR LA BASE
 * -----------------------------------
 * Une contrainte le garantit même si un appel oubliait de le vérifier. « Levé
 * par le censeur » sans raison écrite ne se défend pas devant un parent qui,
 * lui, a payé.
 *
 * LA LEVÉE VAUT POUR UNE PÉRIODE
 * -------------------------------
 * Elle vit sur le bulletin, pas sur l'élève. Une exception accordée au premier
 * trimestre doit être redécidée au deuxième : reconduite en silence, elle
 * deviendrait permanente sans que personne ne l'ait voulu.
 *
 * LE DROIT EXIGÉ EST CELUI D'EXONÉRER, PAS CELUI DE PUBLIER
 * ----------------------------------------------------------
 * Lever une retenue pour impayé est une décision financière : elle revient à
 * délivrer le document sans encaisser. Le secrétariat qui publie les bulletins
 * ne doit pas pouvoir la prendre seul.
 */

export interface ResultatBlocage {
  ok: boolean;
  message?: string;
}

const schema = z.object({
  inscriptionId: z.string().uuid(),
  periodeId: z.string().uuid(),
  motif: z.string().trim().min(5, "Le motif doit être explicite (5 caractères minimum)."),
});

export async function leverBlocage(donnees: unknown): Promise<ResultatBlocage> {
  try {
    const acteur = await requirePermission("finance:exonerer");

    const a = schema.safeParse(donnees);
    if (!a.success) {
      return { ok: false, message: a.error.issues[0]?.message ?? "Requête invalide." };
    }
    const v = a.data;

    const r = await db.execute<{ id: string }>(sql`
      UPDATE bulletins
         SET blocage_leve_par = ${acteur.id}::uuid,
             blocage_leve_le = now(),
             motif_levee = ${v.motif}
       WHERE inscription_id = ${v.inscriptionId}::uuid
         AND periode_id = ${v.periodeId}::uuid
      RETURNING id
    `);

    if (!r.rows[0]) {
      // Le bulletin n'existe pas encore : il n'y a rien à lever. Créer une
      // ligne ici produirait un bulletin sans moyennes, que la génération
      // remplirait ensuite — mais qui apparaîtrait entre-temps comme un
      // bulletin vide dans les listes.
      return {
        ok: false,
        message: "Aucun bulletin pour cet élève sur cette période : produisez-le d'abord.",
      };
    }

    await journaliser(acteur, {
      action: "bulletin.blocage_leve",
      entite: "bulletins",
      entiteId: r.rows[0].id,
      apres: { inscriptionId: v.inscriptionId, periodeId: v.periodeId },
      motif: v.motif,
    });

    revalidatePath("/dashboard/bulletins");
    return { ok: true, message: "Retenue levée. Le bulletin pourra être publié." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return {
        ok: false,
        message: "Lever une retenue pour impayé demande le droit d'accorder une exonération.",
      };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("chk_levee_motivee")) {
      return { ok: false, message: "Le motif de la levée est obligatoire." };
    }
    console.error("[blocage-bulletin]", erreur);
    return { ok: false, message: "La levée a échoué." };
  }
}

/**
 * Retire une levée accordée par erreur.
 *
 * Efface les trois colonnes d'un coup : laisser un motif sans auteur donnerait
 * une ligne que la contrainte accepte mais que personne ne sait lire.
 */
export async function retablirBlocage(
  inscriptionId: string,
  periodeId: string,
): Promise<ResultatBlocage> {
  try {
    const acteur = await requirePermission("finance:exonerer");

    await db.execute(sql`
      UPDATE bulletins
         SET blocage_leve_par = NULL, blocage_leve_le = NULL, motif_levee = NULL
       WHERE inscription_id = ${inscriptionId}::uuid
         AND periode_id = ${periodeId}::uuid
    `);

    await journaliser(acteur, {
      action: "bulletin.blocage_retabli",
      entite: "bulletins",
      apres: { inscriptionId, periodeId },
    });

    revalidatePath("/dashboard/bulletins");
    return { ok: true, message: "Retenue rétablie." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour modifier cette retenue." };
    }
    return { ok: false, message: "L'opération a échoué." };
  }
}

/**
 * Active ou désactive la retenue, et fixe la tolérance.
 *
 * LE RÉGLAGE EST ICI, PAS DANS UNE PAGE DE PARAMÈTRES
 * ----------------------------------------------------
 * C'est en voyant la liste des élèves concernés qu'on décide d'appliquer la
 * règle ou non. Reléguer l'interrupteur trois écrans plus loin obligerait à
 * l'actionner à l'aveugle, puis à revenir vérifier — et personne ne revient.
 *
 * Le droit exigé reste `finance:configurer` : voir la liste n'autorise pas à
 * changer la politique de l'établissement.
 */
export async function definirReglageBlocage(
  actif: boolean,
  seuilFcfa: number,
): Promise<ResultatBlocage> {
  try {
    const acteur = await requirePermission("finance:configurer");

    if (!Number.isInteger(seuilFcfa) || seuilFcfa < 0 || seuilFcfa > 1_000_000) {
      return { ok: false, message: "Le seuil doit être un montant entre 0 et 1 000 000 F." };
    }

    await db.execute(sql`
      INSERT INTO parametres (cle, valeur, description)
      VALUES ('bulletin_blocage_impaye', ${actif ? "oui" : "non"},
              'Retenir la publication du bulletin quand la scolarite n''est pas reglee (oui/non).')
      ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, modifie_le = now()
    `);
    await db.execute(sql`
      INSERT INTO parametres (cle, valeur, description)
      VALUES ('bulletin_blocage_seuil_fcfa', ${String(seuilFcfa)},
              'Reste du en dessous duquel le bulletin est publie malgre tout.')
      ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, modifie_le = now()
    `);

    await journaliser(acteur, {
      action: "bulletin.reglage_blocage",
      entite: "parametres",
      apres: { actif, seuilFcfa },
    });

    revalidatePath("/dashboard/bulletins");
    return {
      ok: true,
      message: actif
        ? `Retenue activée${seuilFcfa > 0 ? `, tolérance ${seuilFcfa} F` : ""}.`
        : "Retenue désactivée : tous les bulletins seront publiés.",
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour changer ce réglage." };
    }
    console.error("[reglage-blocage]", erreur);
    return { ok: false, message: "Le réglage n'a pas pu être enregistré." };
  }
}
