import "server-only";

import { and, asc, count, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  anneesScolaires,
  classes,
  coefficients,
  inscriptions,
  matieres,
  niveaux,
  periodes,
  series,
} from "@/server/db/schema";

/**
 * Lectures du module Paramètres : années scolaires, périodes, séries,
 * matières, coefficients et classes.
 *
 * Ce module ne fait que LIRE. Les écritures passent par les actions serveur
 * (`app/(main)/dashboard/parametres/actions.ts`), qui contrôlent l'autorisation
 * et journalisent au passage.
 */

// ---------------------------------------------------------------------------
// Années scolaires
// ---------------------------------------------------------------------------

export interface LigneAnnee {
  id: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  typePeriode: "TRIMESTRE" | "SEMESTRE";
  estCourante: boolean;
  estCloturee: boolean;
  nbPeriodes: number;
  nbClasses: number;
  nbInscriptions: number;
}

export async function listerAnnees(): Promise<LigneAnnee[]> {
  const lignes = await db
    .select({
      id: anneesScolaires.id,
      libelle: anneesScolaires.libelle,
      dateDebut: anneesScolaires.dateDebut,
      dateFin: anneesScolaires.dateFin,
      typePeriode: anneesScolaires.typePeriode,
      estCourante: anneesScolaires.estCourante,
      estCloturee: anneesScolaires.estCloturee,
      nbPeriodes: sql<number>`(SELECT count(*) FROM ${periodes} WHERE ${periodes.anneeId} = ${anneesScolaires.id})`,
      nbClasses: sql<number>`(SELECT count(*) FROM ${classes} WHERE ${classes.anneeId} = ${anneesScolaires.id})`,
      nbInscriptions: sql<number>`(SELECT count(*) FROM ${inscriptions} WHERE ${inscriptions.anneeId} = ${anneesScolaires.id} AND ${inscriptions.active})`,
    })
    .from(anneesScolaires)
    .orderBy(sql`${anneesScolaires.dateDebut} DESC`);

  return lignes.map((l) => ({
    ...l,
    typePeriode: l.typePeriode as "TRIMESTRE" | "SEMESTRE",
    nbPeriodes: Number(l.nbPeriodes),
    nbClasses: Number(l.nbClasses),
    nbInscriptions: Number(l.nbInscriptions),
  }));
}

export interface LignePeriode {
  id: string;
  numero: number;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  saisieOuverte: boolean;
  estVerrouillee: boolean;
}

export async function listerPeriodes(anneeId: string): Promise<LignePeriode[]> {
  return db
    .select({
      id: periodes.id,
      numero: periodes.numero,
      libelle: periodes.libelle,
      dateDebut: periodes.dateDebut,
      dateFin: periodes.dateFin,
      saisieOuverte: periodes.saisieOuverte,
      estVerrouillee: periodes.estVerrouillee,
    })
    .from(periodes)
    .where(eq(periodes.anneeId, anneeId))
    .orderBy(asc(periodes.numero));
}

// ---------------------------------------------------------------------------
// Séries et niveaux
// ---------------------------------------------------------------------------

export interface LigneSerie {
  id: string;
  code: string;
  libelle: string;
  description: string | null;
  ordre: number;
  active: boolean;
}

export async function listerSeries(seulementActives = false): Promise<LigneSerie[]> {
  const requete = db
    .select({
      id: series.id,
      code: series.code,
      libelle: series.libelle,
      description: series.description,
      ordre: series.ordre,
      active: series.active,
    })
    .from(series)
    .orderBy(asc(series.ordre), asc(series.code));

  const lignes = await requete;
  return seulementActives ? lignes.filter((s) => s.active) : lignes;
}

export interface LigneNiveau {
  id: string;
  code: string;
  libelle: string;
  cycle: "COLLEGE" | "LYCEE";
  ordre: number;
  seriesApplicables: boolean;
}

export async function listerNiveaux(): Promise<LigneNiveau[]> {
  const lignes = await db
    .select({
      id: niveaux.id,
      code: niveaux.code,
      libelle: niveaux.libelle,
      cycle: niveaux.cycle,
      ordre: niveaux.ordre,
      seriesApplicables: niveaux.seriesApplicables,
    })
    .from(niveaux)
    .orderBy(asc(niveaux.ordre));

  return lignes.map((l) => ({ ...l, cycle: l.cycle as "COLLEGE" | "LYCEE" }));
}

// ---------------------------------------------------------------------------
// Matières
// ---------------------------------------------------------------------------

export interface LigneMatiere {
  id: string;
  code: string;
  libelle: string;
  libelleCourt: string | null;
  couleur: string | null;
  ordreBulletin: number;
  active: boolean;
  /** Nombre de couples (niveau × série) pour lesquels un coefficient existe. */
  nbCoefficients: number;
}

export async function listerMatieres(): Promise<LigneMatiere[]> {
  const lignes = await db
    .select({
      id: matieres.id,
      code: matieres.code,
      libelle: matieres.libelle,
      libelleCourt: matieres.libelleCourt,
      couleur: matieres.couleur,
      ordreBulletin: matieres.ordreBulletin,
      active: matieres.active,
      nbCoefficients: sql<number>`(SELECT count(*) FROM ${coefficients} WHERE ${coefficients.matiereId} = ${matieres.id})`,
    })
    .from(matieres)
    .orderBy(asc(matieres.ordreBulletin), asc(matieres.libelle));

  return lignes.map((l) => ({ ...l, nbCoefficients: Number(l.nbCoefficients) }));
}

// ---------------------------------------------------------------------------
// Coefficients
// ---------------------------------------------------------------------------

export interface CoefficientSaisi {
  id: string;
  matiereId: string;
  niveauId: string;
  serieId: string | null;
  coefficient: string;
  volumeHoraire: string | null;
  poidsInterro: string;
  poidsDevoir: string;
  poidsComposition: string;
  obligatoire: boolean;
}

/**
 * Coefficients d'une année, pour un couple (niveau, série) donné.
 * `serieId` à `null` correspond au collège et à la 2nde indifférenciée.
 */
export async function listerCoefficients(
  anneeId: string,
  niveauId: string,
  serieId: string | null,
): Promise<CoefficientSaisi[]> {
  return db
    .select({
      id: coefficients.id,
      matiereId: coefficients.matiereId,
      niveauId: coefficients.niveauId,
      serieId: coefficients.serieId,
      coefficient: coefficients.coefficient,
      volumeHoraire: coefficients.volumeHoraire,
      poidsInterro: coefficients.poidsInterro,
      poidsDevoir: coefficients.poidsDevoir,
      poidsComposition: coefficients.poidsComposition,
      obligatoire: coefficients.obligatoire,
    })
    .from(coefficients)
    .where(
      and(
        eq(coefficients.anneeId, anneeId),
        eq(coefficients.niveauId, niveauId),
        serieId === null ? sql`${coefficients.serieId} IS NULL` : eq(coefficients.serieId, serieId),
      ),
    );
}

/** Compte les coefficients saisis pour une année — sert aux écrans de prérequis. */
export async function compterCoefficients(anneeId: string): Promise<number> {
  const [ligne] = await db
    .select({ n: count() })
    .from(coefficients)
    .where(eq(coefficients.anneeId, anneeId));
  return Number(ligne?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export interface LigneClasseParametre {
  id: string;
  libelle: string;
  code: string;
  capaciteMax: number;
  niveauId: string;
  niveauLibelle: string;
  niveauOrdre: number;
  serieId: string | null;
  serieCode: string | null;
  effectif: number;
  active: boolean;
}

export async function listerClassesAnnee(anneeId: string): Promise<LigneClasseParametre[]> {
  const lignes = await db
    .select({
      id: classes.id,
      libelle: classes.libelle,
      code: classes.code,
      capaciteMax: classes.capaciteMax,
      niveauId: classes.niveauId,
      niveauLibelle: niveaux.libelle,
      niveauOrdre: niveaux.ordre,
      serieId: classes.serieId,
      serieCode: series.code,
      active: classes.active,
      effectif: sql<number>`(SELECT count(*) FROM ${inscriptions} WHERE ${inscriptions.classeId} = ${classes.id} AND ${inscriptions.active})`,
    })
    .from(classes)
    .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
    .leftJoin(series, eq(series.id, classes.serieId))
    .where(eq(classes.anneeId, anneeId))
    .orderBy(asc(niveaux.ordre), asc(classes.libelle));

  return lignes.map((l) => ({ ...l, effectif: Number(l.effectif) }));
}
