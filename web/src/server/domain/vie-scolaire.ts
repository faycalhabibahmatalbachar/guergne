import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  absences,
  classes,
  eleves,
  incidents,
  inscriptions,
  matieres,
  retards,
  sanctions,
} from "@/server/db/schema";

/** Lectures du module Vie scolaire : assiduité, retards, discipline. */

export interface EleveClasse {
  inscriptionId: string;
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  statut: string;
}

/** Liste d'appel d'une classe, triée alphabétiquement. */
export async function listerElevesClasse(classeId: string): Promise<EleveClasse[]> {
  return db
    .select({
      inscriptionId: inscriptions.id,
      eleveId: eleves.id,
      matricule: eleves.matricule,
      nom: eleves.nom,
      prenom: eleves.prenom,
      statut: eleves.statut,
    })
    .from(inscriptions)
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .where(and(eq(inscriptions.classeId, classeId), eq(inscriptions.active, true)))
    .orderBy(eleves.nom, eleves.prenom);
}

export interface LigneAbsence {
  id: string;
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe: string;
  dateAbsence: string;
  nbHeures: string;
  statut: string;
  motif: string | null;
  matiere: string | null;
  parentsNotifies: boolean;
}

export async function listerAbsences(filtres: {
  periodeId?: string;
  classeId?: string;
  statut?: string;
  depuis?: string;
  jusqua?: string;
  limite?: number;
}): Promise<LigneAbsence[]> {
  const conditions = [];
  if (filtres.periodeId) conditions.push(eq(absences.periodeId, filtres.periodeId));
  if (filtres.classeId) conditions.push(eq(inscriptions.classeId, filtres.classeId));
  if (filtres.statut) conditions.push(sql`${absences.statut} = ${filtres.statut}`);
  if (filtres.depuis) conditions.push(gte(absences.dateAbsence, filtres.depuis));
  if (filtres.jusqua) conditions.push(lte(absences.dateAbsence, filtres.jusqua));

  return db
    .select({
      id: absences.id,
      eleveId: eleves.id,
      matricule: eleves.matricule,
      nom: eleves.nom,
      prenom: eleves.prenom,
      classe: classes.libelle,
      dateAbsence: absences.dateAbsence,
      nbHeures: absences.nbHeures,
      statut: absences.statut,
      motif: absences.motif,
      matiere: matieres.libelle,
      parentsNotifies: absences.parentsNotifies,
    })
    .from(absences)
    .innerJoin(inscriptions, eq(inscriptions.id, absences.inscriptionId))
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .leftJoin(matieres, eq(matieres.id, absences.matiereId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(absences.dateAbsence))
    .limit(filtres.limite ?? 100);
}

export interface AlerteAssiduite {
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe: string;
  periode: string;
  heuresNonJustifiees: string;
  heuresJustifiees: string;
  nbRetards: number;
  seuil: number;
}

/** Élèves ayant atteint le seuil d'absences non justifiées de l'établissement. */
export async function listerAlertes(periodeId?: string): Promise<AlerteAssiduite[]> {
  const lignes = await db.execute<AlerteAssiduite & Record<string, unknown>>(sql`
    SELECT eleve_id AS "eleveId", matricule, nom, prenom, classe, periode,
           heures_non_justifiees AS "heuresNonJustifiees",
           heures_justifiees AS "heuresJustifiees",
           nb_retards AS "nbRetards", seuil
      FROM v_alertes_assiduite
     WHERE (${periodeId ?? null}::uuid IS NULL OR periode_id = ${periodeId ?? null}::uuid)
     ORDER BY heures_non_justifiees DESC
     LIMIT 50
  `);
  return lignes.rows.map((l) => ({ ...l, nbRetards: Number(l.nbRetards), seuil: Number(l.seuil) }));
}

export interface LigneRetard {
  id: string;
  eleveId: string;
  nom: string;
  prenom: string;
  classe: string;
  dateRetard: string;
  heureArrivee: string | null;
  dureeMinutes: number | null;
  statut: string;
  motif: string | null;
}

export async function listerRetards(filtres: {
  periodeId?: string;
  classeId?: string;
  limite?: number;
}): Promise<LigneRetard[]> {
  const conditions = [];
  if (filtres.periodeId) conditions.push(eq(retards.periodeId, filtres.periodeId));
  if (filtres.classeId) conditions.push(eq(inscriptions.classeId, filtres.classeId));

  return db
    .select({
      id: retards.id,
      eleveId: eleves.id,
      nom: eleves.nom,
      prenom: eleves.prenom,
      classe: classes.libelle,
      dateRetard: retards.dateRetard,
      heureArrivee: retards.heureArrivee,
      dureeMinutes: retards.dureeMinutes,
      statut: retards.statut,
      motif: retards.motif,
    })
    .from(retards)
    .innerJoin(inscriptions, eq(inscriptions.id, retards.inscriptionId))
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(retards.dateRetard))
    .limit(filtres.limite ?? 100);
}

export interface LigneIncident {
  id: string;
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe: string;
  dateIncident: string;
  lieu: string | null;
  gravite: string;
  description: string;
  parentsNotifies: boolean;
  nbSanctions: number;
}

export async function listerIncidents(filtres: {
  periodeId?: string;
  classeId?: string;
  gravite?: string;
  limite?: number;
}): Promise<LigneIncident[]> {
  const conditions = [];
  if (filtres.periodeId) conditions.push(eq(incidents.periodeId, filtres.periodeId));
  if (filtres.classeId) conditions.push(eq(inscriptions.classeId, filtres.classeId));
  if (filtres.gravite) conditions.push(sql`${incidents.gravite} = ${filtres.gravite}`);

  const lignes = await db
    .select({
      id: incidents.id,
      eleveId: eleves.id,
      matricule: eleves.matricule,
      nom: eleves.nom,
      prenom: eleves.prenom,
      classe: classes.libelle,
      dateIncident: incidents.dateIncident,
      lieu: incidents.lieu,
      gravite: incidents.gravite,
      description: incidents.description,
      parentsNotifies: incidents.parentsNotifies,
      nbSanctions: sql<number>`(SELECT count(*) FROM sanctions s WHERE s.incident_id = incidents.id)`,
    })
    .from(incidents)
    .innerJoin(inscriptions, eq(inscriptions.id, incidents.inscriptionId))
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(incidents.dateIncident))
    .limit(filtres.limite ?? 100);

  return lignes.map((l) => ({ ...l, nbSanctions: Number(l.nbSanctions) }));
}

export interface LigneSanction {
  id: string;
  eleveId: string;
  nom: string;
  prenom: string;
  classe: string;
  type: string;
  motif: string;
  dateDebut: string;
  dateFin: string | null;
  executee: boolean;
  impacteStatut: boolean;
}

export async function listerSanctions(filtres: {
  periodeId?: string;
  classeId?: string;
  type?: string;
  /** Vrai : seulement celles qui restent à exécuter. */
  enAttente?: boolean;
  limite?: number;
}): Promise<LigneSanction[]> {
  const conditions = [];
  if (filtres.periodeId) conditions.push(eq(sanctions.periodeId, filtres.periodeId));
  if (filtres.classeId) conditions.push(eq(inscriptions.classeId, filtres.classeId));
  if (filtres.type) conditions.push(sql`${sanctions.type} = ${filtres.type}`);
  // Une sanction prononcée mais non exécutée est le cas qui coûte cher : une
  // exclusion oubliée fait revenir l'élève, et l'établissement perd sa parole.
  if (filtres.enAttente) conditions.push(sql`NOT ${sanctions.executee}`);

  return db
    .select({
      id: sanctions.id,
      eleveId: eleves.id,
      nom: eleves.nom,
      prenom: eleves.prenom,
      classe: classes.libelle,
      type: sanctions.type,
      motif: sanctions.motif,
      dateDebut: sanctions.dateDebut,
      dateFin: sanctions.dateFin,
      executee: sanctions.executee,
      impacteStatut: sanctions.impacteStatut,
    })
    .from(sanctions)
    .innerJoin(inscriptions, eq(inscriptions.id, sanctions.inscriptionId))
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .innerJoin(classes, eq(classes.id, inscriptions.classeId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sanctions.dateDebut))
    .limit(filtres.limite ?? 100);
}

/** Compteurs de tête pour le tableau de bord de la vie scolaire. */
export async function statistiquesVieScolaire(periodeId: string | null) {
  if (!periodeId) {
    return { absencesJour: 0, retardsJour: 0, nonJustifiees: 0, incidentsPeriode: 0, alertes: 0 };
  }

  const r = await db.execute<{
    absences_jour: number;
    retards_jour: number;
    non_justifiees: number;
    incidents_periode: number;
    alertes: number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM absences WHERE date_absence = CURRENT_DATE)          AS absences_jour,
      (SELECT count(*) FROM retards  WHERE date_retard  = CURRENT_DATE)          AS retards_jour,
      (SELECT count(*) FROM absences WHERE periode_id = ${periodeId}::uuid
                                       AND statut = 'NON_JUSTIFIEE')             AS non_justifiees,
      (SELECT count(*) FROM incidents WHERE periode_id = ${periodeId}::uuid)     AS incidents_periode,
      (SELECT count(*) FROM v_alertes_assiduite WHERE periode_id = ${periodeId}::uuid) AS alertes
  `);

  const l = r.rows[0];
  return {
    absencesJour: Number(l?.absences_jour ?? 0),
    retardsJour: Number(l?.retards_jour ?? 0),
    nonJustifiees: Number(l?.non_justifiees ?? 0),
    incidentsPeriode: Number(l?.incidents_periode ?? 0),
    alertes: Number(l?.alertes ?? 0),
  };
}

// ---------------------------------------------------------------------------
// E-53 — Note de conduite
// ---------------------------------------------------------------------------

export interface LigneConduiteClasse {
  inscriptionId: string;
  matricule: string;
  eleve: string;
  note: number | null;
  appreciation: string | null;
  incidents: number;
  sanctions: number;
  absencesNonJustifiees: number;
}

/**
 * Grille de conduite d'une classe pour une période.
 *
 * Le CONTEXTE accompagne chaque élève — incidents, sanctions, absences non
 * justifiées de la période. Sans lui, la conduite se note de mémoire, et de
 * mémoire on note l'élève dont on se souvient plutôt que celui dont le dossier
 * le justifie.
 */
export async function chargerConduiteClasse(
  classeId: string,
  periodeId: string,
): Promise<LigneConduiteClasse[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT i.id AS inscription_id, e.matricule,
           e.prenom || ' ' || e.nom AS eleve,
           nc.note::text AS note, nc.appreciation,
           (SELECT count(*) FROM incidents x
             WHERE x.inscription_id = i.id AND x.periode_id = ${periodeId}::uuid)::int AS incidents,
           (SELECT count(*) FROM sanctions x
             WHERE x.inscription_id = i.id AND x.periode_id = ${periodeId}::uuid)::int AS sanctions,
           (SELECT COALESCE(sum(a.nb_heures), 0) FROM absences a
             WHERE a.inscription_id = i.id AND a.periode_id = ${periodeId}::uuid
               AND a.statut = 'NON_JUSTIFIEE')::int AS absences
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      LEFT JOIN notes_conduite nc
        ON nc.inscription_id = i.id AND nc.periode_id = ${periodeId}::uuid
     WHERE i.classe_id = ${classeId}::uuid AND i.active
     ORDER BY e.nom, e.prenom
  `);

  return r.rows.map((l) => ({
    inscriptionId: String(l.inscription_id),
    matricule: String(l.matricule),
    eleve: String(l.eleve),
    note: l.note === null ? null : Number(l.note),
    appreciation: (l.appreciation as string) ?? null,
    incidents: Number(l.incidents),
    sanctions: Number(l.sanctions),
    absencesNonJustifiees: Number(l.absences),
  }));
}
