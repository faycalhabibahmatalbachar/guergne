"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import {
  anneesScolaires,
  classes,
  coefficients,
  inscriptions,
  matieres,
  periodes,
  series,
} from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Actions du module Paramètres.
 *
 * Chacune : autorisation → validation → écriture → journal d'audit.
 * Aucune ne fait confiance à ce que le formulaire envoie.
 */

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

const SUCCES: Resultat = { ok: true };

/** Convertit une exception en message affichable, sans fuiter la technique. */
function echec(erreur: unknown, defaut: string): Resultat {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  const message = erreur instanceof Error ? erreur.message : "";
  // 23505 = violation de contrainte d'unicité PostgreSQL
  if (message.includes("duplicate key") || message.includes("23505")) {
    return { ok: false, message: "Cet élément existe déjà." };
  }
  console.error("[parametres]", erreur);
  return { ok: false, message: defaut };
}

function premierMessage(erreur: z.ZodError): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const probleme of erreur.issues) {
    const champ = String(probleme.path[0] ?? "_");
    if (!sortie[champ]) sortie[champ] = probleme.message;
  }
  return sortie;
}

// ===========================================================================
// Années scolaires
// ===========================================================================

const schemaAnnee = z
  .object({
    libelle: z
      .string()
      .trim()
      .regex(/^\d{4}\s*[–-]\s*\d{4}$/, "Format attendu : 2026-2027")
      .transform((v) => v.replace(/\s*[–-]\s*/, "-")),
    dateDebut: z.string().min(1, "La date de début est requise"),
    dateFin: z.string().min(1, "La date de fin est requise"),
    typePeriode: z.enum(["TRIMESTRE", "SEMESTRE"]),
    definirCourante: z.boolean().default(false),
  })
  .refine((v) => new Date(v.dateFin) > new Date(v.dateDebut), {
    message: "La date de fin doit suivre la date de début",
    path: ["dateFin"],
  })
  .refine(
    (v) => {
      const [debut, fin] = v.libelle.split("-").map(Number);
      return fin === debut + 1;
    },
    { message: "Les deux années doivent se suivre (ex. 2026-2027)", path: ["libelle"] },
  );

/**
 * Découpe l'année en périodes de durée égale.
 *
 * Les dates proposées sont un point de départ modifiable : chaque
 * établissement ajuste ses trimestres au calendrier réel des vacances. Mieux
 * vaut pré-remplir puis laisser corriger que d'imposer une saisie manuelle de
 * six dates à la rentrée.
 */
function decouperPeriodes(
  debut: Date,
  fin: Date,
  type: "TRIMESTRE" | "SEMESTRE",
): Array<{ numero: number; libelle: string; dateDebut: string; dateFin: string }> {
  const nombre = type === "TRIMESTRE" ? 3 : 2;
  const totalJours = Math.round((fin.getTime() - debut.getTime()) / 86_400_000);
  const parPeriode = Math.floor(totalJours / nombre);

  const nom = (i: number) =>
    type === "TRIMESTRE"
      ? `${i === 1 ? "1er" : `${i}ème`} Trimestre`
      : `${i === 1 ? "1er" : "2ème"} Semestre`;

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return Array.from({ length: nombre }, (_, index) => {
    const i = index + 1;
    const pDebut = new Date(debut.getTime() + index * parPeriode * 86_400_000);
    const pFin = i === nombre ? fin : new Date(debut.getTime() + (i * parPeriode - 1) * 86_400_000);
    return { numero: i, libelle: nom(i), dateDebut: iso(pDebut), dateFin: iso(pFin) };
  });
}

export async function creerAnnee(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annee:cloturer");
    const analyse = schemaAnnee.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;

    await db.transaction(async (tx) => {
      // Une seule année courante : un index unique partiel l'impose déjà en
      // base, mais on bascule explicitement pour éviter l'erreur.
      if (v.definirCourante) {
        await tx.update(anneesScolaires).set({ estCourante: false }).where(eq(anneesScolaires.estCourante, true));
      }

      const [annee] = await tx
        .insert(anneesScolaires)
        .values({
          libelle: v.libelle,
          dateDebut: v.dateDebut,
          dateFin: v.dateFin,
          typePeriode: v.typePeriode,
          estCourante: v.definirCourante,
        })
        .returning({ id: anneesScolaires.id });

      const decoupage = decouperPeriodes(new Date(v.dateDebut), new Date(v.dateFin), v.typePeriode);
      await tx.insert(periodes).values(
        decoupage.map((p) => ({
          anneeId: annee.id,
          numero: p.numero,
          libelle: p.libelle,
          dateDebut: p.dateDebut,
          dateFin: p.dateFin,
        })),
      );

      await journaliser(acteur, {
        action: "annee.creee",
        entite: "annees_scolaires",
        entiteId: annee.id,
        apres: { libelle: v.libelle, periodes: decoupage.length },
      });
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/default");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La création de l'année scolaire a échoué.");
  }
}

export async function definirAnneeCourante(anneeId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annee:cloturer");

    await db.transaction(async (tx) => {
      const [cible] = await tx
        .select({ cloturee: anneesScolaires.estCloturee, libelle: anneesScolaires.libelle })
        .from(anneesScolaires)
        .where(eq(anneesScolaires.id, anneeId));

      if (!cible) throw new Error("Année introuvable");
      if (cible.cloturee) {
        throw new Error("Une année clôturée ne peut pas redevenir l'année en cours.");
      }

      await tx.update(anneesScolaires).set({ estCourante: false }).where(eq(anneesScolaires.estCourante, true));
      await tx.update(anneesScolaires).set({ estCourante: true }).where(eq(anneesScolaires.id, anneeId));

      await journaliser(acteur, {
        action: "annee.definie_courante",
        entite: "annees_scolaires",
        entiteId: anneeId,
        apres: { libelle: cible.libelle },
      });
    });

    revalidatePath("/dashboard", "layout");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "Le changement d'année en cours a échoué.");
  }
}

export async function cloturerAnnee(anneeId: string, motif: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annee:cloturer");

    if (motif.trim().length < 3) {
      return { ok: false, erreurs: { motif: "Indiquez le motif de la clôture" } };
    }

    await db.transaction(async (tx) => {
      const [cible] = await tx
        .select({ courante: anneesScolaires.estCourante, libelle: anneesScolaires.libelle })
        .from(anneesScolaires)
        .where(eq(anneesScolaires.id, anneeId));

      if (!cible) throw new Error("Année introuvable");
      if (cible.courante) {
        throw new Error(
          "L'année en cours ne peut pas être clôturée. Désignez d'abord une autre année comme année en cours.",
        );
      }

      // Clôturer verrouille aussi toutes les périodes : plus aucune note ne
      // peut être modifiée sur une année close.
      await tx
        .update(periodes)
        .set({ estVerrouillee: true, saisieOuverte: false, verrouilleeLe: new Date().toISOString(), verrouilleePar: acteur.id })
        .where(eq(periodes.anneeId, anneeId));

      await tx.update(anneesScolaires).set({ estCloturee: true }).where(eq(anneesScolaires.id, anneeId));

      await journaliser(acteur, {
        action: "annee.cloturee",
        entite: "annees_scolaires",
        entiteId: anneeId,
        motif,
        apres: { libelle: cible.libelle },
      });
    });

    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La clôture de l'année a échoué.");
  }
}

// ===========================================================================
// Périodes
// ===========================================================================

const schemaPeriode = z
  .object({
    id: z.string().uuid(),
    libelle: z.string().trim().min(3, "Libellé trop court"),
    dateDebut: z.string().min(1, "Date de début requise"),
    dateFin: z.string().min(1, "Date de fin requise"),
  })
  .refine((v) => new Date(v.dateFin) > new Date(v.dateDebut), {
    message: "La date de fin doit suivre la date de début",
    path: ["dateFin"],
  });

export async function modifierPeriode(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("periode:verrouiller");
    const analyse = schemaPeriode.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const [avant] = await db
      .select({ libelle: periodes.libelle, dateDebut: periodes.dateDebut, dateFin: periodes.dateFin, verrouillee: periodes.estVerrouillee })
      .from(periodes)
      .where(eq(periodes.id, v.id));

    if (!avant) return { ok: false, message: "Période introuvable." };
    if (avant.verrouillee) {
      return { ok: false, message: "Cette période est verrouillée. Déverrouillez-la avant de la modifier." };
    }

    await db
      .update(periodes)
      .set({ libelle: v.libelle, dateDebut: v.dateDebut, dateFin: v.dateFin })
      .where(eq(periodes.id, v.id));

    await journaliser(acteur, {
      action: "periode.modifiee",
      entite: "periodes",
      entiteId: v.id,
      avant,
      apres: v,
    });

    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La modification de la période a échoué.");
  }
}

export async function basculerVerrouPeriode(periodeId: string, verrouiller: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission(verrouiller ? "periode:verrouiller" : "periode:deverrouiller");

    await db
      .update(periodes)
      .set({
        estVerrouillee: verrouiller,
        saisieOuverte: !verrouiller,
        verrouilleeLe: verrouiller ? new Date().toISOString() : null,
        verrouilleePar: verrouiller ? acteur.id : null,
      })
      .where(eq(periodes.id, periodeId));

    await journaliser(acteur, {
      action: verrouiller ? "periode.verrouillee" : "periode.deverrouillee",
      entite: "periodes",
      entiteId: periodeId,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/notes");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "Le verrouillage de la période a échoué.");
  }
}

// ===========================================================================
// Séries
// ===========================================================================

const schemaSerie = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Code requis")
    .max(4, "4 caractères maximum")
    .regex(/^[A-Z0-9]+$/, "Lettres et chiffres uniquement"),
  libelle: z.string().trim().min(3, "Libellé trop court"),
  description: z.string().trim().optional(),
});

export async function creerSerie(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("matiere:gerer");
    const analyse = schemaSerie.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${series.ordre}), 0)` }).from(series);

    const [creee] = await db
      .insert(series)
      .values({
        code: v.code,
        libelle: v.libelle,
        description: v.description || null,
        ordre: Number(max) + 1,
      })
      .returning({ id: series.id });

    await journaliser(acteur, { action: "serie.creee", entite: "series", entiteId: creee.id, apres: v });

    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La création de la série a échoué.");
  }
}

export async function basculerSerie(serieId: string, active: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("matiere:gerer");

    if (!active) {
      // Une série utilisée par une classe ne peut pas être désactivée : les
      // bulletins de ces élèves y font référence.
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(classes)
        .where(eq(classes.serieId, serieId));

      if (Number(n) > 0) {
        return {
          ok: false,
          message: `Cette série est utilisée par ${n} classe(s). Elle ne peut pas être désactivée.`,
        };
      }
    }

    await db.update(series).set({ active }).where(eq(series.id, serieId));
    await journaliser(acteur, {
      action: active ? "serie.activee" : "serie.desactivee",
      entite: "series",
      entiteId: serieId,
    });

    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "Le changement d'état de la série a échoué.");
  }
}

// ===========================================================================
// Matières
// ===========================================================================

const schemaMatiere = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Code trop court")
    .max(10, "10 caractères maximum")
    .regex(/^[A-Z0-9_]+$/, "Lettres, chiffres et souligné uniquement"),
  libelle: z.string().trim().min(3, "Libellé trop court"),
  libelleCourt: z.string().trim().max(12, "12 caractères maximum").optional(),
  couleur: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue")
    .default("#64748b"),
  ordreBulletin: z.coerce.number().int().min(0).max(99),
});

export async function creerMatiere(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("matiere:gerer");
    const analyse = schemaMatiere.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const [creee] = await db
      .insert(matieres)
      .values({
        code: v.code,
        libelle: v.libelle,
        libelleCourt: v.libelleCourt || null,
        couleur: v.couleur,
        ordreBulletin: v.ordreBulletin,
      })
      .returning({ id: matieres.id });

    await journaliser(acteur, { action: "matiere.creee", entite: "matieres", entiteId: creee.id, apres: v });

    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La création de la matière a échoué.");
  }
}

export async function modifierMatiere(matiereId: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("matiere:gerer");
    const analyse = schemaMatiere.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const [avant] = await db.select().from(matieres).where(eq(matieres.id, matiereId));
    if (!avant) return { ok: false, message: "Matière introuvable." };

    await db
      .update(matieres)
      .set({
        code: v.code,
        libelle: v.libelle,
        libelleCourt: v.libelleCourt || null,
        couleur: v.couleur,
        ordreBulletin: v.ordreBulletin,
      })
      .where(eq(matieres.id, matiereId));

    await journaliser(acteur, {
      action: "matiere.modifiee",
      entite: "matieres",
      entiteId: matiereId,
      avant: { code: avant.code, libelle: avant.libelle },
      apres: v,
    });

    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La modification de la matière a échoué.");
  }
}

export async function basculerMatiere(matiereId: string, active: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("matiere:gerer");
    await db.update(matieres).set({ active }).where(eq(matieres.id, matiereId));
    await journaliser(acteur, {
      action: active ? "matiere.activee" : "matiere.desactivee",
      entite: "matieres",
      entiteId: matiereId,
    });
    revalidatePath("/dashboard/parametres");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "Le changement d'état de la matière a échoué.");
  }
}

// ===========================================================================
// Coefficients
// ===========================================================================

const schemaCoefficient = z.object({
  anneeId: z.string().uuid(),
  niveauId: z.string().uuid(),
  serieId: z.string().uuid().nullable(),
  matiereId: z.string().uuid(),
  /** 0 signifie « matière non enseignée à ce niveau » : la ligne est supprimée. */
  coefficient: z.coerce.number().min(0).max(20),
  volumeHoraire: z.coerce.number().min(0).max(40).nullable().optional(),
  poidsInterro: z.coerce.number().min(0).max(10).default(1),
  poidsDevoir: z.coerce.number().min(0).max(10).default(1),
  poidsComposition: z.coerce.number().min(0).max(10).default(2),
  obligatoire: z.boolean().default(true),
});

export async function definirCoefficient(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("coefficient:gerer");
    const analyse = schemaCoefficient.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const conditionSerie =
      v.serieId === null ? sql`${coefficients.serieId} IS NULL` : eq(coefficients.serieId, v.serieId);

    const filtre = and(
      eq(coefficients.anneeId, v.anneeId),
      eq(coefficients.niveauId, v.niveauId),
      eq(coefficients.matiereId, v.matiereId),
      conditionSerie,
    );

    if (v.coefficient === 0) {
      await db.delete(coefficients).where(filtre);
      await journaliser(acteur, {
        action: "coefficient.retire",
        entite: "coefficients",
        apres: { matiereId: v.matiereId, niveauId: v.niveauId, serieId: v.serieId },
      });
      revalidatePath("/dashboard/parametres");
      return SUCCES;
    }

    const [existant] = await db.select({ id: coefficients.id }).from(coefficients).where(filtre);

    const valeurs = {
      coefficient: String(v.coefficient),
      volumeHoraire: v.volumeHoraire == null ? null : String(v.volumeHoraire),
      poidsInterro: String(v.poidsInterro),
      poidsDevoir: String(v.poidsDevoir),
      poidsComposition: String(v.poidsComposition),
      obligatoire: v.obligatoire,
    };

    if (existant) {
      await db.update(coefficients).set(valeurs).where(eq(coefficients.id, existant.id));
    } else {
      await db.insert(coefficients).values({
        anneeId: v.anneeId,
        niveauId: v.niveauId,
        serieId: v.serieId,
        matiereId: v.matiereId,
        ...valeurs,
      });
    }

    await journaliser(acteur, {
      action: existant ? "coefficient.modifie" : "coefficient.defini",
      entite: "coefficients",
      entiteId: existant?.id,
      apres: v,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/default");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "L'enregistrement du coefficient a échoué.");
  }
}

/**
 * Reprend les coefficients d'une année précédente.
 *
 * À la rentrée, la grille change rarement : la recopier évite de ressaisir
 * une centaine de valeurs à la main, opération longue et source d'erreurs.
 */
export async function copierCoefficients(sourceAnneeId: string, cibleAnneeId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("coefficient:gerer");

    if (sourceAnneeId === cibleAnneeId) {
      return { ok: false, message: "Les années source et cible doivent être différentes." };
    }

    const source = await db.select().from(coefficients).where(eq(coefficients.anneeId, sourceAnneeId));
    if (source.length === 0) {
      return { ok: false, message: "L'année source ne contient aucun coefficient." };
    }

    await db.transaction(async (tx) => {
      await tx.delete(coefficients).where(eq(coefficients.anneeId, cibleAnneeId));
      await tx.insert(coefficients).values(
        source.map((c) => ({
          anneeId: cibleAnneeId,
          matiereId: c.matiereId,
          niveauId: c.niveauId,
          serieId: c.serieId,
          coefficient: c.coefficient,
          volumeHoraire: c.volumeHoraire,
          poidsInterro: c.poidsInterro,
          poidsDevoir: c.poidsDevoir,
          poidsComposition: c.poidsComposition,
          obligatoire: c.obligatoire,
        })),
      );
    });

    await journaliser(acteur, {
      action: "coefficient.copies",
      entite: "coefficients",
      apres: { source: sourceAnneeId, cible: cibleAnneeId, nombre: source.length },
    });

    revalidatePath("/dashboard/parametres");
    return { ok: true, message: `${source.length} coefficients repris.` };
  } catch (erreur) {
    return echec(erreur, "La reprise des coefficients a échoué.");
  }
}

// ===========================================================================
// Classes
// ===========================================================================

const schemaClasse = z.object({
  anneeId: z.string().uuid(),
  niveauId: z.string().uuid("Sélectionnez un niveau"),
  serieId: z.string().uuid().nullable(),
  libelle: z.string().trim().min(2, "Libellé requis"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Code trop court")
    .max(10, "10 caractères maximum")
    .regex(/^[A-Z0-9]+$/, "Lettres et chiffres uniquement"),
  capaciteMax: z.coerce.number().int().min(1, "Au moins 1").max(200, "200 maximum"),
});

export async function creerClasse(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("classe:creer");
    const analyse = schemaClasse.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const [creee] = await db
      .insert(classes)
      .values({
        anneeId: v.anneeId,
        niveauId: v.niveauId,
        serieId: v.serieId,
        libelle: v.libelle,
        code: v.code,
        capaciteMax: v.capaciteMax,
      })
      .returning({ id: classes.id });

    await journaliser(acteur, { action: "classe.creee", entite: "classes", entiteId: creee.id, apres: v });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/default");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La création de la classe a échoué.");
  }
}

export async function modifierClasse(classeId: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("classe:modifier");
    const analyse = schemaClasse.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: premierMessage(analyse.error) };

    const v = analyse.data;
    const [avant] = await db.select().from(classes).where(eq(classes.id, classeId));
    if (!avant) return { ok: false, message: "Classe introuvable." };

    // On ne réduit pas une capacité en dessous de l'effectif déjà inscrit :
    // cela rendrait la classe incohérente sans que personne ne le voie.
    const [{ effectif }] = await db
      .select({ effectif: sql<number>`count(*)` })
      .from(inscriptions)
      .where(and(eq(inscriptions.classeId, classeId), eq(inscriptions.active, true)));

    if (v.capaciteMax < Number(effectif)) {
      return {
        ok: false,
        erreurs: { capaciteMax: `${effectif} élèves sont déjà inscrits dans cette classe.` },
      };
    }

    await db
      .update(classes)
      .set({
        niveauId: v.niveauId,
        serieId: v.serieId,
        libelle: v.libelle,
        code: v.code,
        capaciteMax: v.capaciteMax,
      })
      .where(eq(classes.id, classeId));

    await journaliser(acteur, {
      action: "classe.modifiee",
      entite: "classes",
      entiteId: classeId,
      avant: { libelle: avant.libelle, code: avant.code, capaciteMax: avant.capaciteMax },
      apres: v,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/classes");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La modification de la classe a échoué.");
  }
}

export async function supprimerClasse(classeId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("classe:modifier");

    const [{ effectif }] = await db
      .select({ effectif: sql<number>`count(*)` })
      .from(inscriptions)
      .where(eq(inscriptions.classeId, classeId));

    if (Number(effectif) > 0) {
      return {
        ok: false,
        message: `Cette classe compte ${effectif} inscription(s). Transférez ces élèves avant de la supprimer.`,
      };
    }

    const [avant] = await db.select({ libelle: classes.libelle }).from(classes).where(eq(classes.id, classeId));
    await db.delete(classes).where(eq(classes.id, classeId));

    await journaliser(acteur, {
      action: "classe.supprimee",
      entite: "classes",
      entiteId: classeId,
      avant,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/classes");
    return SUCCES;
  } catch (erreur) {
    return echec(erreur, "La suppression de la classe a échoué.");
  }
}
