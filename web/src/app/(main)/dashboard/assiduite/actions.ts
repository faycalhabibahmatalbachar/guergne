"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { absences, incidents, inscriptions, retards, sanctions } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

const OK: Resultat = { ok: true };

function echec(e: unknown, defaut: string): Resultat {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  console.error("[vie-scolaire]", e);
  return { ok: false, message: defaut };
}

function messages(e: z.ZodError): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of e.issues) {
    const c = String(p.path[0] ?? "_");
    if (!s[c]) s[c] = p.message;
  }
  return s;
}

// ===========================================================================
// Appel et absences
// ===========================================================================

const schemaAppel = z.object({
  periodeId: z.string().uuid(),
  dateAbsence: z.string().min(1, "Date requise"),
  matiereId: z.string().uuid().nullable().optional(),
  nbHeures: z.coerce.number().min(0.5).max(12).default(1),
  /** Inscriptions marquées absentes. Les autres sont considérées présentes. */
  absents: z.array(z.string().uuid()),
});

/**
 * Enregistre l'appel d'un cours.
 *
 * On n'écrit QUE les absents : une présence est l'état normal et n'a pas à
 * produire de ligne. Sur une classe de 60 élèves, cela évite d'écrire 60
 * enregistrements par heure de cours, soit des centaines de milliers par an.
 *
 * Chaque absence déclenche en base la mise en file des notifications aux
 * tuteurs — push pour ceux qui ont l'application, SMS pour les autres.
 */
export async function enregistrerAppel(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("assiduite:saisir");
    const a = schemaAppel.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    if (v.absents.length === 0) {
      return { ok: true, message: "Appel enregistré : aucun absent." };
    }

    await db.insert(absences).values(
      v.absents.map((inscriptionId) => ({
        inscriptionId,
        periodeId: v.periodeId,
        type: v.matiereId ? ("COURS" as const) : ("JOURNEE" as const),
        dateAbsence: v.dateAbsence,
        matiereId: v.matiereId ?? null,
        nbHeures: String(v.nbHeures),
        saisiePar: acteur.id,
      })),
    );

    await journaliser(acteur, {
      action: "assiduite.appel",
      entite: "absences",
      apres: { date: v.dateAbsence, nbAbsents: v.absents.length, matiereId: v.matiereId },
    });

    revalidatePath("/dashboard/assiduite");
    return {
      ok: true,
      message: `${v.absents.length} absence(s) enregistrée(s). Les tuteurs seront notifiés.`,
    };
  } catch (e) {
    return echec(e, "L'enregistrement de l'appel a échoué.");
  }
}

export async function justifierAbsence(
  absenceId: string,
  statut: "JUSTIFIEE" | "NON_JUSTIFIEE",
  motif: string,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("assiduite:justifier");

    if (statut === "JUSTIFIEE" && motif.trim().length < 3) {
      return { ok: false, erreurs: { motif: "Indiquez le motif de la justification." } };
    }

    const [avant] = await db
      .select({ statut: absences.statut, inscriptionId: absences.inscriptionId })
      .from(absences)
      .where(eq(absences.id, absenceId));
    if (!avant) return { ok: false, message: "Absence introuvable." };

    const [insc] = await db
      .select({ eleveId: inscriptions.eleveId })
      .from(inscriptions)
      .where(eq(inscriptions.id, avant.inscriptionId));

    await db
      .update(absences)
      .set({
        statut,
        motif: motif.trim() || null,
        justifieePar: acteur.id,
        justifieeLe: new Date().toISOString(),
      })
      .where(eq(absences.id, absenceId));

    await journaliser(acteur, {
      action: statut === "JUSTIFIEE" ? "absence.justifiee" : "absence.dejustifiee",
      entite: "absences",
      entiteId: absenceId,
      eleveId: insc?.eleveId ?? null,
      avant: { statut: avant.statut },
      apres: { statut },
      motif: motif.trim() || null,
    });

    revalidatePath("/dashboard/assiduite");
    return OK;
  } catch (e) {
    return echec(e, "La justification a échoué.");
  }
}

export async function supprimerAbsence(absenceId: string, motif: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("assiduite:saisir");
    if (motif.trim().length < 3) {
      return { ok: false, erreurs: { motif: "Une saisie erronée se corrige avec un motif." } };
    }

    const [avant] = await db.select().from(absences).where(eq(absences.id, absenceId));
    await db.delete(absences).where(eq(absences.id, absenceId));

    await journaliser(acteur, {
      action: "absence.supprimee",
      entite: "absences",
      entiteId: absenceId,
      avant: avant ? { date: avant.dateAbsence, heures: avant.nbHeures } : null,
      motif: motif.trim(),
    });

    revalidatePath("/dashboard/assiduite");
    return OK;
  } catch (e) {
    return echec(e, "La suppression a échoué.");
  }
}

// ===========================================================================
// Retards
// ===========================================================================

const schemaRetard = z.object({
  inscriptionId: z.string().uuid("Sélectionnez un élève"),
  periodeId: z.string().uuid(),
  dateRetard: z.string().min(1, "Date requise"),
  heureArrivee: z.string().optional(),
  dureeMinutes: z.coerce.number().int().min(0).max(480).nullable().optional(),
  motif: z.string().trim().optional(),
});

export async function enregistrerRetard(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("retard:saisir");
    const a = schemaRetard.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    await db.insert(retards).values({
      inscriptionId: v.inscriptionId,
      periodeId: v.periodeId,
      dateRetard: v.dateRetard,
      heureArrivee: v.heureArrivee || null,
      dureeMinutes: v.dureeMinutes ?? null,
      motif: v.motif || null,
      saisiePar: acteur.id,
    });

    await journaliser(acteur, {
      action: "retard.saisi",
      entite: "retards",
      apres: { date: v.dateRetard, duree: v.dureeMinutes },
    });

    revalidatePath("/dashboard/assiduite");
    return OK;
  } catch (e) {
    return echec(e, "L'enregistrement du retard a échoué.");
  }
}

// ===========================================================================
// Discipline
// ===========================================================================

const schemaIncident = z.object({
  inscriptionId: z.string().uuid("Sélectionnez un élève"),
  periodeId: z.string().uuid(),
  dateIncident: z.string().min(1, "Date requise"),
  heureIncident: z.string().optional(),
  lieu: z.string().trim().optional(),
  gravite: z.enum(["MINEURE", "MOYENNE", "GRAVE", "TRES_GRAVE"]),
  description: z.string().trim().min(10, "Décrivez les faits (10 caractères minimum)"),
  temoins: z.string().trim().optional(),
});

export async function signalerIncident(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("discipline:signaler");
    const a = schemaIncident.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    const [cree] = await db
      .insert(incidents)
      .values({
        inscriptionId: v.inscriptionId,
        periodeId: v.periodeId,
        dateIncident: v.dateIncident,
        heureIncident: v.heureIncident || null,
        lieu: v.lieu || null,
        gravite: v.gravite,
        description: v.description,
        temoins: v.temoins || null,
        signalePar: acteur.id,
      })
      .returning({ id: incidents.id });

    const [insc] = await db
      .select({ eleveId: inscriptions.eleveId })
      .from(inscriptions)
      .where(eq(inscriptions.id, v.inscriptionId));

    await journaliser(acteur, {
      action: "incident.signale",
      entite: "incidents",
      entiteId: cree.id,
      eleveId: insc?.eleveId ?? null,
      apres: { gravite: v.gravite, date: v.dateIncident },
    });

    revalidatePath("/dashboard/discipline");
    return OK;
  } catch (e) {
    return echec(e, "Le signalement a échoué.");
  }
}

const schemaSanction = z.object({
  inscriptionId: z.string().uuid(),
  incidentId: z.string().uuid().nullable().optional(),
  periodeId: z.string().uuid(),
  type: z.enum([
    "AVERTISSEMENT_ORAL", "AVERTISSEMENT_ECRIT", "RETENUE",
    "TRAVAIL_INTERET_GENERAL", "EXCLUSION_COURS", "EXCLUSION_TEMPORAIRE",
    "CONSEIL_DISCIPLINE", "EXCLUSION_DEFINITIVE",
  ]),
  motif: z.string().trim().min(5, "Le motif doit être explicite"),
  dateDebut: z.string().min(1, "Date de début requise"),
  dateFin: z.string().optional(),
});

/**
 * Prononce une sanction.
 *
 * Une exclusion temporaire ou définitive change automatiquement le statut de
 * l'élève, via un déclencheur qui écrit dans `historique_statuts`. Sans ce
 * lien, la sanction serait prononcée mais la vie scolaire continuerait de
 * compter l'élève présent.
 */
export async function prononcerSanction(donnees: unknown): Promise<Resultat> {
  try {
    const a = schemaSanction.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    const impacteStatut = v.type === "EXCLUSION_TEMPORAIRE" || v.type === "EXCLUSION_DEFINITIVE";

    // Une exclusion définitive relève de la direction, pas de la vie scolaire.
    const acteur = await requirePermission(
      v.type === "EXCLUSION_DEFINITIVE" ? "eleve:exclure" : "discipline:sanctionner",
    );

    if (v.type === "EXCLUSION_TEMPORAIRE" && !v.dateFin) {
      return { ok: false, erreurs: { dateFin: "Une exclusion temporaire doit avoir une date de fin." } };
    }

    const [cree] = await db
      .insert(sanctions)
      .values({
        inscriptionId: v.inscriptionId,
        incidentId: v.incidentId ?? null,
        periodeId: v.periodeId,
        type: v.type,
        motif: v.motif,
        dateDebut: v.dateDebut,
        dateFin: v.dateFin || null,
        impacteStatut,
        prononceePar: acteur.id,
      })
      .returning({ id: sanctions.id });

    const [insc] = await db
      .select({ eleveId: inscriptions.eleveId })
      .from(inscriptions)
      .where(eq(inscriptions.id, v.inscriptionId));

    await journaliser(acteur, {
      action: "sanction.prononcee",
      entite: "sanctions",
      entiteId: cree.id,
      eleveId: insc?.eleveId ?? null,
      apres: { type: v.type, impacteStatut },
      motif: v.motif,
    });

    revalidatePath("/dashboard/discipline");
    revalidatePath("/dashboard/eleves");
    return {
      ok: true,
      message: impacteStatut
        ? "Sanction prononcée. Le statut de l'élève a été mis à jour et les tuteurs seront notifiés."
        : "Sanction prononcée.",
    };
  } catch (e) {
    return echec(e, "La sanction n'a pas pu être prononcée.");
  }
}

export async function marquerSanctionExecutee(sanctionId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("discipline:sanctionner");
    await db
      .update(sanctions)
      .set({ executee: true, executeeLe: new Date().toISOString().slice(0, 10) })
      .where(eq(sanctions.id, sanctionId));

    await journaliser(acteur, {
      action: "sanction.executee",
      entite: "sanctions",
      entiteId: sanctionId,
    });

    revalidatePath("/dashboard/discipline");
    return OK;
  } catch (e) {
    return echec(e, "La mise à jour a échoué.");
  }
}
