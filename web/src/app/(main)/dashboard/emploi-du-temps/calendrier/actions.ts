"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { parserDateISO } from "@/server/domain/calendrier-scolaire";

export interface ResultatEvenementCalendrier {
  ok: boolean;
  message: string;
  id?: string;
}

const TYPES = [
  "VACANCES",
  "FERIE",
  "COMPOSITION",
  "EXAMEN_BLANC",
  "REUNION_PARENTS",
  "CONSEIL_CLASSE",
  "RENTREE",
  "AUTRE",
] as const;

const IMPACTS = ["INFORMATIF", "SUSPENDRE_COURS", "ORGANISATION_SPECIALE"] as const;

const schemaEvenement = z
  .object({
    anneeId: z.string().uuid(),
    type: z.enum(TYPES),
    titre: z.string().trim().min(3, "Le titre doit contenir au moins 3 caractères.").max(180),
    description: z.string().max(4000).optional().default(""),
    dateDebut: z.string().min(10, "Date de début requise."),
    dateFin: z.string().min(10, "Date de fin requise."),
    impactCours: z.enum(IMPACTS),
    sourceOfficielle: z.string().trim().max(1000).optional().default(""),
    sourceVerifieeLe: z.string().optional().default(""),
    visibleParents: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    try {
      parserDateISO(v.dateDebut);
    } catch {
      ctx.addIssue({ code: "custom", path: ["dateDebut"], message: "Date de début invalide." });
    }
    try {
      parserDateISO(v.dateFin);
    } catch {
      ctx.addIssue({ code: "custom", path: ["dateFin"], message: "Date de fin invalide." });
    }
    if (v.dateDebut > v.dateFin) {
      ctx.addIssue({
        code: "custom",
        path: ["dateFin"],
        message: "La date de fin doit être égale ou postérieure à la date de début.",
      });
    }
    if (v.sourceVerifieeLe) {
      try {
        parserDateISO(v.sourceVerifieeLe);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["sourceVerifieeLe"],
          message: "La date de vérification de la source est invalide.",
        });
      }
    }
  });

function echec(erreur: unknown): ResultatEvenementCalendrier {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour gérer le calendrier scolaire." };
  }
  console.error("[calendrier-scolaire]", erreur);
  return { ok: false, message: "L'opération sur l'événement a échoué." };
}

async function verifierPorteeAnnee(anneeId: string, dateDebut: string, dateFin: string) {
  const [annee] = (
    await db.execute<{ date_debut: string; date_fin: string }>(sql`
      SELECT date_debut::text AS date_debut, date_fin::text AS date_fin
        FROM annees_scolaires
       WHERE id = ${anneeId}::uuid
    `)
  ).rows;

  if (!annee) return "Année scolaire introuvable.";
  if (dateDebut < annee.date_debut || dateFin > annee.date_fin) {
    return "Les dates de l'événement doivent rester dans les limites de l'année scolaire choisie.";
  }
  return null;
}

export async function creerEvenementCalendrier(donnees: unknown): Promise<ResultatEvenementCalendrier> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const parsed = schemaEvenement.safeParse(donnees);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
    }
    const v = parsed.data;
    const portee = await verifierPorteeAnnee(v.anneeId, v.dateDebut, v.dateFin);
    if (portee) return { ok: false, message: portee };

    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO evenements_calendrier
        (annee_id, type, titre, description, date_debut, date_fin,
         visible_parents, impact_cours, statut_validation, source_officielle,
         source_verifiee_le, modifie_par, modifie_le)
      VALUES
        (${v.anneeId}::uuid, ${v.type}::type_evenement, ${v.titre},
         ${v.description || null}, ${v.dateDebut}::date, ${v.dateFin}::date,
         ${v.visibleParents}, ${v.impactCours}, 'BROUILLON',
         ${v.sourceOfficielle || null}, ${v.sourceVerifieeLe || null}::date,
         ${acteur.id}::uuid, now())
      RETURNING id
    `);

    const id = inserted.rows[0]?.id;
    await journaliser(acteur, {
      action: "calendrier.evenement_cree",
      entite: "evenements_calendrier",
      entiteId: id,
      apres: {
        anneeId: v.anneeId,
        type: v.type,
        titre: v.titre,
        dateDebut: v.dateDebut,
        dateFin: v.dateFin,
        impactCours: v.impactCours,
        statutValidation: "BROUILLON",
      },
    });

    revalidatePath("/dashboard/emploi-du-temps/calendrier");
    revalidatePath("/dashboard/emploi-du-temps");
    return { ok: true, message: "Événement créé en brouillon.", id };
  } catch (erreur) {
    return echec(erreur);
  }
}

export async function modifierEvenementCalendrier(
  id: string,
  donnees: unknown,
): Promise<ResultatEvenementCalendrier> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const parsed = schemaEvenement.safeParse(donnees);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
    }
    const v = parsed.data;
    const portee = await verifierPorteeAnnee(v.anneeId, v.dateDebut, v.dateFin);
    if (portee) return { ok: false, message: portee };

    const [avant] = (
      await db.execute<{
        id: string;
        titre: string;
        date_debut: string;
        date_fin: string;
        statut_validation: string;
      }>(sql`
        SELECT id, titre, date_debut::text AS date_debut,
               date_fin::text AS date_fin, statut_validation
          FROM evenements_calendrier
         WHERE id = ${id}::uuid AND annee_id = ${v.anneeId}::uuid
      `)
    ).rows;
    if (!avant) return { ok: false, message: "Événement introuvable dans cette année scolaire." };
    if (avant.statut_validation === "ANNULE") {
      return { ok: false, message: "Un événement annulé ne peut pas être modifié. Créez-en un nouveau." };
    }

    await db.execute(sql`
      UPDATE evenements_calendrier
         SET type = ${v.type}::type_evenement,
             titre = ${v.titre},
             description = ${v.description || null},
             date_debut = ${v.dateDebut}::date,
             date_fin = ${v.dateFin}::date,
             visible_parents = FALSE,
             impact_cours = ${v.impactCours},
             statut_validation = 'A_VERIFIER',
             source_officielle = ${v.sourceOfficielle || null},
             source_verifiee_le = ${v.sourceVerifieeLe || null}::date,
             valide_par = NULL,
             valide_le = NULL,
             modifie_par = ${acteur.id}::uuid,
             modifie_le = now()
       WHERE id = ${id}::uuid AND annee_id = ${v.anneeId}::uuid
    `);

    await journaliser(acteur, {
      action: "calendrier.evenement_modifie",
      entite: "evenements_calendrier",
      entiteId: id,
      avant,
      apres: {
        titre: v.titre,
        dateDebut: v.dateDebut,
        dateFin: v.dateFin,
        type: v.type,
        impactCours: v.impactCours,
        statutValidation: "A_VERIFIER",
        visibleParents: false,
      },
    });

    revalidatePath("/dashboard/emploi-du-temps/calendrier");
    revalidatePath("/dashboard/emploi-du-temps");
    return { ok: true, message: "Événement modifié et renvoyé en vérification." };
  } catch (erreur) {
    return echec(erreur);
  }
}

export async function validerEvenementCalendrier(id: string): Promise<ResultatEvenementCalendrier> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const [event] = (
      await db.execute<{
        id: string;
        type: string;
        titre: string;
        impact_cours: string;
        source_officielle: string | null;
        source_verifiee_le: string | null;
        statut_validation: string;
      }>(sql`
        SELECT id, type::text AS type, titre, impact_cours, source_officielle,
               source_verifiee_le::text AS source_verifiee_le, statut_validation
          FROM evenements_calendrier
         WHERE id = ${id}::uuid
      `)
    ).rows;

    if (!event) return { ok: false, message: "Événement introuvable." };
    if (event.statut_validation === "ANNULE") {
      return { ok: false, message: "Un événement annulé ne peut pas être validé." };
    }
    const doitAvoirSource =
      event.type === "FERIE" ||
      event.type === "VACANCES" ||
      event.impact_cours === "SUSPENDRE_COURS";
    if (doitAvoirSource && (!event.source_officielle?.trim() || !event.source_verifiee_le)) {
      return {
        ok: false,
        message: "Ajoutez la référence de la décision officielle et sa date de vérification avant de valider cet événement.",
      };
    }

    await db.execute(sql`
      UPDATE evenements_calendrier
         SET statut_validation = 'VALIDE',
             valide_par = ${acteur.id}::uuid,
             valide_le = now(),
             modifie_par = ${acteur.id}::uuid,
             modifie_le = now()
       WHERE id = ${id}::uuid
    `);

    await journaliser(acteur, {
      action: "calendrier.evenement_valide",
      entite: "evenements_calendrier",
      entiteId: id,
      avant: { statutValidation: event.statut_validation },
      apres: { statutValidation: "VALIDE", sourceOfficielle: event.source_officielle },
    });

    revalidatePath("/dashboard/emploi-du-temps/calendrier");
    revalidatePath("/dashboard/emploi-du-temps");
    return { ok: true, message: "Événement validé." };
  } catch (erreur) {
    return echec(erreur);
  }
}

export async function publierEvenementCalendrier(id: string): Promise<ResultatEvenementCalendrier> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const [event] = (
      await db.execute<{ id: string; statut_validation: string; visible_parents: boolean }>(sql`
        SELECT id, statut_validation, visible_parents
          FROM evenements_calendrier
         WHERE id = ${id}::uuid
      `)
    ).rows;

    if (!event) return { ok: false, message: "Événement introuvable." };
    if (event.statut_validation !== "VALIDE") {
      return { ok: false, message: "Validez d'abord l'événement avant de le publier." };
    }

    await db.execute(sql`
      UPDATE evenements_calendrier
         SET statut_validation = 'PUBLIE',
             modifie_par = ${acteur.id}::uuid,
             modifie_le = now()
       WHERE id = ${id}::uuid
    `);

    await journaliser(acteur, {
      action: "calendrier.evenement_publie",
      entite: "evenements_calendrier",
      entiteId: id,
      avant: { statutValidation: event.statut_validation, visibleParents: event.visible_parents },
      apres: { statutValidation: "PUBLIE", visibleParents: event.visible_parents },
    });

    revalidatePath("/dashboard/emploi-du-temps/calendrier");
    revalidatePath("/dashboard/emploi-du-temps");
    return { ok: true, message: event.visible_parents ? "Événement publié pour les familles." : "Événement publié en interne." };
  } catch (erreur) {
    return echec(erreur);
  }
}

export async function annulerEvenementCalendrier(id: string): Promise<ResultatEvenementCalendrier> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const [event] = (
      await db.execute<{ id: string; statut_validation: string; titre: string }>(sql`
        SELECT id, statut_validation, titre
          FROM evenements_calendrier
         WHERE id = ${id}::uuid
      `)
    ).rows;

    if (!event) return { ok: false, message: "Événement introuvable." };
    if (event.statut_validation === "ANNULE") {
      return { ok: true, message: "Cet événement est déjà annulé." };
    }

    await db.execute(sql`
      UPDATE evenements_calendrier
         SET statut_validation = 'ANNULE',
             visible_parents = FALSE,
             modifie_par = ${acteur.id}::uuid,
             modifie_le = now()
       WHERE id = ${id}::uuid
    `);

    await journaliser(acteur, {
      action: "calendrier.evenement_annule",
      entite: "evenements_calendrier",
      entiteId: id,
      avant: { statutValidation: event.statut_validation, titre: event.titre },
      apres: { statutValidation: "ANNULE" },
    });

    revalidatePath("/dashboard/emploi-du-temps/calendrier");
    revalidatePath("/dashboard/emploi-du-temps");
    return { ok: true, message: "Événement annulé ; son historique est conservé." };
  } catch (erreur) {
    return echec(erreur);
  }
}
