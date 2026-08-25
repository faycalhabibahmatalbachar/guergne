"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { reglageBlocage } from "@/server/domain/caisse";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Conseil de classe : appréciations, décisions, publication.
 *
 * CE QUE LA GÉNÉRATION NE FAIT PAS
 * ---------------------------------
 * La génération produit des CHIFFRES : moyennes, rang, mention proposée. Le
 * conseil produit un JUGEMENT : ce qu'on dit à la famille, et ce qu'on décide
 * pour l'élève. Les deux ne se mélangent pas — c'est pourquoi une regénération
 * ne touche jamais ces champs.
 *
 * LA PUBLICATION EST UN ACTE SÉPARÉ
 * ----------------------------------
 * Tant qu'un bulletin est en brouillon, l'administration le voit et les
 * familles non. La publication le rend visible dans l'application des parents
 * ET déclenche leur notification. C'est irréversible dans les faits : un parent
 * qui a lu la moyenne de son enfant ne peut pas la « dé-lire ». D'où une action
 * distincte, avec son propre droit `bulletin:publier`.
 */

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  /** Nombre de bulletins touchés, pour les actions de masse. */
  touches?: number;
}

const DECISIONS = [
  "ADMIS",
  "ADMIS_CONDITION",
  "REDOUBLE",
  "EXCLU",
  "REORIENTE",
  "EN_ATTENTE",
] as const;

const MENTIONS = [
  "FELICITATIONS",
  "ENCOURAGEMENTS",
  "TABLEAU_HONNEUR",
  "AVERTISSEMENT_TRAVAIL",
  "AVERTISSEMENT_CONDUITE",
  "BLAME",
  "AUCUNE",
] as const;

const schemaAppreciation = z.object({
  appreciationGenerale: z.string().trim().max(500, "Appréciation trop longue").optional(),
  mention: z.enum(MENTIONS).optional(),
  decision: z.enum(DECISIONS).optional(),
});

function echec(erreur: unknown, defaut: string): Resultat {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  console.error("[conseil]", erreur);
  return { ok: false, message: defaut };
}

/**
 * Enregistre l'avis du conseil sur un bulletin.
 *
 * La mention est PROPOSÉE par le calcul, jamais imposée : le conseil peut
 * refuser des félicitations à un élève brillant mais perturbateur, ou en
 * accorder à un élève en progrès. La proposition sert à ne rien oublier, pas à
 * décider.
 */
export async function enregistrerAvis(
  inscriptionId: string,
  periodeId: string,
  donnees: unknown,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("bulletin:generer");

    const a = schemaAppreciation.safeParse(donnees);
    if (!a.success) {
      const s: Record<string, string> = {};
      for (const p of a.error.issues) s[String(p.path[0])] = p.message;
      return { ok: false, erreurs: s };
    }

    const avant = await db.execute<{ est_publie: boolean }>(sql`
      SELECT est_publie FROM bulletins
       WHERE inscription_id = ${inscriptionId}::uuid AND periode_id = ${periodeId}::uuid
    `);

    if (!avant.rows[0]) {
      return { ok: false, message: "Aucun bulletin à annoter — produisez-le d'abord." };
    }

    // Un bulletin publié ne se réécrit pas en silence : la famille l'a peut-être
    // déjà lu. Il faut le dépublier, corriger, republier — chaque étape étant
    // journalisée.
    if (avant.rows[0].est_publie) {
      return {
        ok: false,
        message: "Ce bulletin est publié. Dépubliez-le avant de modifier l'avis du conseil.",
      };
    }

    await db.execute(sql`
      UPDATE bulletins
         SET appreciation_generale = COALESCE(${a.data.appreciationGenerale ?? null}, appreciation_generale),
             mention  = COALESCE(${a.data.mention ?? null}::mention_bulletin, mention),
             decision = COALESCE(${a.data.decision ?? null}::decision_fin_annee, decision)
       WHERE inscription_id = ${inscriptionId}::uuid AND periode_id = ${periodeId}::uuid
    `);

    await journaliser(acteur, {
      action: "bulletin.avis_conseil",
      entite: "bulletins",
      entiteId: inscriptionId,
      apres: { ...a.data, periodeId },
    });

    revalidatePath("/dashboard/bulletins");
    return { ok: true, message: "Avis du conseil enregistré." };
  } catch (erreur) {
    return echec(erreur, "L'enregistrement a échoué.");
  }
}

/**
 * Publie les bulletins d'une classe.
 *
 * TROIS EFFETS, ET C'EST BEAUCOUP
 * --------------------------------
 *   1. Les familles voient le bulletin dans l'application.
 *   2. Le déclencheur `bulletins_notification` prévient chaque tuteur — push
 *      s'il a l'application, SMS sinon. Une classe de cinquante élèves, c'est
 *      donc jusqu'à cent notifications, dont une partie facturée.
 *   3. Le bulletin devient inaltérable par l'avis du conseil.
 *
 * D'où la publication PAR CLASSE et non par élève : un conseil statue sur une
 * classe entière, et publier au fil de l'eau enverrait les parents comparer des
 * rangs incomplets.
 *
 * Les bulletins sans décision arrêtée sont laissés de côté sur la dernière
 * période : publier « passe en Première » sans l'avoir décidé serait pire que
 * de ne rien publier.
 */
export async function publierClasse(
  classeId: string,
  periodeId: string,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("bulletin:publier");

    const derniere = await db.execute<{ est_derniere: boolean }>(sql`
      SELECT p.numero = (SELECT max(numero) FROM periodes WHERE annee_id = p.annee_id) AS est_derniere
        FROM periodes p WHERE p.id = ${periodeId}::uuid
    `);
    const estDerniere = derniere.rows[0]?.est_derniere ?? false;

    // E-58 : la scolarité non réglée retient la publication. Le réglage est
    // désactivé par défaut ; quand il l'est, la condition ci-dessous est
    // toujours vraie et rien ne change.
    const blocage = await reglageBlocage();

    const r = await db.execute<{ inscription_id: string }>(sql`
      UPDATE bulletins b
         SET est_publie = TRUE, publie_le = now(), publie_par = ${acteur.id}::uuid
        FROM inscriptions i
       WHERE i.id = b.inscription_id
         AND i.classe_id = ${classeId}::uuid
         AND b.periode_id = ${periodeId}::uuid
         AND NOT b.est_publie
         -- Sur la dernière période, une décision d'orientation est exigée.
         AND (${estDerniere} = FALSE OR b.decision IS NOT NULL)
         -- Retenue pour impayé : la condition est evaluee EN SQL, dans le
         -- meme UPDATE. La calculer en amont puis filtrer une liste d'ids
         -- laisserait une fenetre entre la lecture du solde et l'ecriture,
         -- pendant laquelle un encaissement passe inapercu.
         AND (
           ${blocage.actif} = FALSE
           OR b.blocage_leve_par IS NOT NULL
           OR COALESCE(
                (SELECT sf.reste_du_fcfa FROM v_situation_financiere sf
                  WHERE sf.inscription_id = i.id), 0
              ) <= ${blocage.seuilFcfa}
         )
      RETURNING b.inscription_id
    `);

    // Deux causes de non-publication, comptees separement : « en attente
    // d'une decision » et « scolarite non reglee » n'appellent pas le meme
    // geste, et un compteur unique obligerait a ouvrir chaque dossier pour
    // savoir lequel des deux s'applique.
    const restants = await db.execute<{ sans_decision: number; impayes: number }>(sql`
      SELECT count(*) FILTER (
               WHERE ${estDerniere} = TRUE AND b.decision IS NULL
             )::int AS sans_decision,
             count(*) FILTER (
               WHERE ${blocage.actif} = TRUE
                 AND b.blocage_leve_par IS NULL
                 AND (${estDerniere} = FALSE OR b.decision IS NOT NULL)
                 AND COALESCE(
                       (SELECT sf.reste_du_fcfa FROM v_situation_financiere sf
                         WHERE sf.inscription_id = i.id), 0
                     ) > ${blocage.seuilFcfa}
             )::int AS impayes
        FROM bulletins b
        JOIN inscriptions i ON i.id = b.inscription_id
       WHERE i.classe_id = ${classeId}::uuid
         AND b.periode_id = ${periodeId}::uuid
         AND NOT b.est_publie
    `);

    await journaliser(acteur, {
      action: "bulletins.publies",
      entite: "classes",
      entiteId: classeId,
      apres: { periodeId, publies: r.rows.length },
    });

    revalidatePath("/dashboard/bulletins");

    const sansDecision = Number(restants.rows[0]?.sans_decision ?? 0);
    const impayes = Number(restants.rows[0]?.impayes ?? 0);

    const causes: string[] = [];
    if (sansDecision > 0) causes.push(`${sansDecision} en attente d'une décision d'orientation`);
    if (impayes > 0) causes.push(`${impayes} retenu(s) pour scolarité non réglée`);

    return {
      ok: true,
      touches: r.rows.length,
      message:
        causes.length === 0
          ? `${r.rows.length} bulletin(s) publié(s). Les familles sont prévenues.`
          : `${r.rows.length} publié(s), ${causes.join(", ")}.`,
    };
  } catch (erreur) {
    return echec(erreur, "La publication a échoué.");
  }
}

/**
 * Retire une classe de la publication.
 *
 * Ne « dé-notifie » rien : ce qui est parti est parti. La dépublication sert à
 * corriger une erreur avant que trop de familles n'aient consulté, et à rouvrir
 * l'avis du conseil.
 */
export async function depublierClasse(
  classeId: string,
  periodeId: string,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("bulletin:publier");

    const r = await db.execute<{ inscription_id: string }>(sql`
      UPDATE bulletins b
         SET est_publie = FALSE, publie_le = NULL, publie_par = NULL
        FROM inscriptions i
       WHERE i.id = b.inscription_id
         AND i.classe_id = ${classeId}::uuid
         AND b.periode_id = ${periodeId}::uuid
         AND b.est_publie
      RETURNING b.inscription_id
    `);

    await journaliser(acteur, {
      action: "bulletins.depublies",
      entite: "classes",
      entiteId: classeId,
      apres: { periodeId, depublies: r.rows.length },
    });

    revalidatePath("/dashboard/bulletins");
    return {
      ok: true,
      touches: r.rows.length,
      message: `${r.rows.length} bulletin(s) retiré(s) de la publication. Les notifications déjà parties ne sont pas rappelées.`,
    };
  } catch (erreur) {
    return echec(erreur, "La dépublication a échoué.");
  }
}
