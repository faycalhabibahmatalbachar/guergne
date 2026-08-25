"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Conseil de discipline (E-54).
 *
 * DEUX MOMENTS, DEUX ÉCRITURES
 * -----------------------------
 * La convocation fixe une date et prévient la famille. La délibération arrive
 * après la séance et porte la décision. Les confondre en un seul formulaire
 * obligerait à saisir la décision au moment de convoquer — c'est-à-dire à
 * l'avoir prise d'avance, ce qui vide le conseil de son objet.
 *
 * LE TUTEUR EST PRÉVENU À LA CONVOCATION, PAS APRÈS
 * ---------------------------------------------------
 * Un conseil de discipline sans convocation régulière de la famille est
 * attaquable. La notification part donc dans la même transaction que
 * l'enregistrement : si l'une échoue, l'autre n'a pas lieu, et personne ne
 * croit avoir convoqué quelqu'un qui n'a rien reçu.
 *
 * La notification emprunte `fn_notifier_tuteurs`, comme tout le reste : le
 * canal réellement joignable est choisi par la base, pas par cet appel.
 */

export interface ResultatConseil {
  ok: boolean;
  message?: string;
  id?: string;
}

const schemaConvocation = z.object({
  inscriptionId: z.string().uuid(),
  dateSeance: z.string().min(10, "Date de séance requise"),
  motif: z.string().trim().min(10, "Le motif doit exposer les faits reprochés."),
  participants: z.string().trim().max(500).optional(),
  tuteurConvoque: z.boolean().default(true),
});

export async function convoquerConseil(donnees: unknown): Promise<ResultatConseil> {
  try {
    const acteur = await requirePermission("conseil_discipline:convoquer");

    const a = schemaConvocation.safeParse(donnees);
    if (!a.success) {
      return { ok: false, message: a.error.issues[0]?.message ?? "Requête invalide." };
    }
    const v = a.data;

    const eleve = await db.execute<{ eleve_id: string; nom: string }>(sql`
      SELECT i.eleve_id, e.nom || ' ' || e.prenom AS nom
        FROM inscriptions i
        JOIN eleves e ON e.id = i.eleve_id
       WHERE i.id = ${v.inscriptionId}::uuid
    `);
    if (!eleve.rows[0]) return { ok: false, message: "Élève introuvable." };

    // La date de séance ne peut pas précéder la convocation : la famille doit
    // pouvoir se présenter. Une séance antérieure signalerait une saisie
    // rétroactive, qu'il vaut mieux refuser que d'archiver telle quelle.
    const controle = await db.execute<{ passee: boolean }>(sql`
      SELECT ${v.dateSeance}::date < CURRENT_DATE AS passee
    `);
    if (controle.rows[0]?.passee) {
      return {
        ok: false,
        message: "La séance ne peut pas être fixée dans le passé : la famille doit pouvoir venir.",
      };
    }

    let id = "";
    let prevenus = 0;

    await db.transaction(async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`
        INSERT INTO conseils_discipline
          (inscription_id, date_convocation, date_seance, motif, participants, tuteur_convoque)
        VALUES (${v.inscriptionId}::uuid, CURRENT_DATE, ${v.dateSeance}::date,
                ${v.motif}, ${v.participants || null}, ${v.tuteurConvoque})
        RETURNING id
      `);
      id = r.rows[0].id;

      if (v.tuteurConvoque) {
        const n = await tx.execute<{ posees: number }>(sql`
          SELECT fn_notifier_tuteurs(
            ${eleve.rows[0].eleve_id}::uuid,
            'CONVOCATION'::type_notification,
            ${"Convocation au conseil de discipline"},
            ${`Vous êtes convoqué(e) au conseil de discipline concernant ${eleve.rows[0].nom}, le ${v.dateSeance}. Votre présence est vivement souhaitée.`},
            ${`/eleves/${eleve.rows[0].eleve_id}`},
            ${JSON.stringify({ conseil_discipline: true, date_seance: v.dateSeance })}::jsonb
          ) AS posees
        `);
        prevenus = Number(n.rows[0]?.posees ?? 0);
      }
    });

    await journaliser(acteur, {
      action: "conseil_discipline.convoque",
      entite: "conseils_discipline",
      entiteId: id,
      eleveId: eleve.rows[0].eleve_id,
      apres: { dateSeance: v.dateSeance, tuteursPrevenus: prevenus },
      motif: v.motif,
    });

    revalidatePath("/dashboard/discipline/conseils");

    return {
      ok: true,
      id,
      message: v.tuteurConvoque
        ? prevenus > 0
          ? `Conseil convoqué. ${prevenus} tuteur(s) prévenu(s).`
          : "Conseil convoqué, mais AUCUN tuteur n'est joignable : la convocation doit être remise en main propre."
        : "Conseil convoqué sans convocation de la famille.",
    };
  } catch (erreur) {
    return echec(erreur, "La convocation a échoué.");
  }
}

const schemaDeliberation = z.object({
  conseilId: z.string().uuid(),
  deliberation: z.string().trim().min(10, "La délibération doit être écrite."),
  decision: z.string().trim().min(5, "La décision doit être explicite."),
  tuteurPresent: z.boolean().nullable().optional(),
  sanctionId: z.string().uuid().nullable().optional(),
});

/**
 * Enregistre ce qui s'est décidé en séance.
 *
 * LA PRÉSENCE DU TUTEUR EST CONSIGNÉE
 * ------------------------------------
 * Convoqué et absent n'est pas la même chose que non convoqué. C'est la
 * première chose que conteste une famille qui apprend une exclusion, et la
 * seule réponse est un procès-verbal qui le dit.
 *
 * LA SANCTION RESTE UNE ÉCRITURE À PART
 * --------------------------------------
 * Le conseil s'y rattache par `sanction_id` mais ne la crée pas : une sanction
 * prononcée en conseil suit exactement le même circuit que les autres —
 * exécution à suivre, notification aux parents, report sur la conduite. La
 * dupliquer ici la ferait sortir de tous ces comptages.
 */
export async function enregistrerDeliberation(donnees: unknown): Promise<ResultatConseil> {
  try {
    const acteur = await requirePermission("conseil_discipline:convoquer");

    const a = schemaDeliberation.safeParse(donnees);
    if (!a.success) {
      return { ok: false, message: a.error.issues[0]?.message ?? "Requête invalide." };
    }
    const v = a.data;

    const r = await db.execute<{ id: string; inscription_id: string }>(sql`
      UPDATE conseils_discipline
         SET deliberation = ${v.deliberation},
             decision = ${v.decision},
             tuteur_present = ${v.tuteurPresent ?? null},
             sanction_id = ${v.sanctionId ?? null}::uuid
       WHERE id = ${v.conseilId}::uuid
      RETURNING id, inscription_id
    `);

    if (!r.rows[0]) return { ok: false, message: "Conseil introuvable." };

    await journaliser(acteur, {
      action: "conseil_discipline.delibere",
      entite: "conseils_discipline",
      entiteId: r.rows[0].id,
      apres: { decision: v.decision, tuteurPresent: v.tuteurPresent ?? null },
    });

    revalidatePath("/dashboard/discipline/conseils");
    return { ok: true, id: r.rows[0].id, message: "Délibération enregistrée." };
  } catch (erreur) {
    return echec(erreur, "L'enregistrement a échoué.");
  }
}

/**
 * Annule une convocation.
 *
 * Supprime la ligne : une convocation annulée avant séance n'a pas eu lieu, et
 * la garder ferait apparaître au dossier de l'élève un conseil qui ne s'est
 * jamais tenu — exactement ce qu'une famille reprocherait à juste titre.
 *
 * Un conseil DÉLIBÉRÉ ne s'annule pas : il s'est tenu, sa décision existe.
 */
export async function annulerConvocation(conseilId: string): Promise<ResultatConseil> {
  try {
    const acteur = await requirePermission("conseil_discipline:convoquer");

    const r = await db.execute<{ id: string }>(sql`
      DELETE FROM conseils_discipline
       WHERE id = ${conseilId}::uuid
         AND decision IS NULL
      RETURNING id
    `);

    if (!r.rows[0]) {
      return {
        ok: false,
        message: "Ce conseil a délibéré : sa décision ne peut pas être effacée.",
      };
    }

    await journaliser(acteur, {
      action: "conseil_discipline.annule",
      entite: "conseils_discipline",
      entiteId: conseilId,
    });

    revalidatePath("/dashboard/discipline/conseils");
    return { ok: true, message: "Convocation annulée." };
  } catch (erreur) {
    return echec(erreur, "L'annulation a échoué.");
  }
}

function echec(erreur: unknown, defaut: string): ResultatConseil {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour réunir un conseil de discipline." };
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (message.includes("ERROR:")) {
    return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
  }
  console.error("[conseil-discipline]", erreur);
  return { ok: false, message: defaut };
}
