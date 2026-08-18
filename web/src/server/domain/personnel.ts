import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  affectations,
  classes,
  creneauxHoraires,
  emploiDuTemps,
  enseignantMatieres,
  enseignants,
  indisponibilites,
  matieres,
  niveaux,
  salles,
  series,
} from "@/server/db/schema";

/**
 * Lectures du module Personnel et Emploi du temps.
 * Ce module ne fait que lire ; les écritures passent par les actions serveur.
 */

// ---------------------------------------------------------------------------
// Enseignants
// ---------------------------------------------------------------------------

export interface LigneEnseignant {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F" | null;
  telephone: string | null;
  email: string | null;
  statut: string;
  specialite: string | null;
  heuresContractuelles: string | null;
  actif: boolean;
  matierePrincipale: string | null;
  nbAffectations: number;
  heuresAffectees: number;
  creneauxPlaces: number;
}

export async function listerEnseignants(anneeId: string | null): Promise<LigneEnseignant[]> {
  const lignes = await db
    .select({
      id: enseignants.id,
      matricule: enseignants.matricule,
      nom: enseignants.nom,
      prenom: enseignants.prenom,
      sexe: enseignants.sexe,
      telephone: enseignants.telephone,
      email: enseignants.email,
      statut: enseignants.statut,
      specialite: enseignants.specialite,
      heuresContractuelles: enseignants.heuresContractuelles,
      actif: enseignants.actif,
      matierePrincipale: sql<string | null>`(
        SELECT m.libelle FROM enseignant_matieres em
        JOIN matieres m ON m.id = em.matiere_id
        WHERE em.enseignant_id = enseignants.id AND em.est_principale LIMIT 1)`,
      nbAffectations: sql<number>`(
        SELECT count(*) FROM affectations a
        WHERE a.enseignant_id = enseignants.id AND a.active
          AND (${anneeId}::uuid IS NULL OR a.annee_id = ${anneeId}::uuid))`,
      heuresAffectees: sql<number>`(
        SELECT COALESCE(SUM(a.heures_semaine), 0) FROM affectations a
        WHERE a.enseignant_id = enseignants.id AND a.active
          AND (${anneeId}::uuid IS NULL OR a.annee_id = ${anneeId}::uuid))`,
      creneauxPlaces: sql<number>`(
        SELECT COALESCE(SUM(e.nb_creneaux), 0) FROM emploi_du_temps e
        WHERE e.enseignant_id = enseignants.id
          AND (${anneeId}::uuid IS NULL OR e.annee_id = ${anneeId}::uuid))`,
    })
    .from(enseignants)
    .orderBy(asc(enseignants.nom), asc(enseignants.prenom));

  return lignes.map((l) => ({
    ...l,
    sexe: l.sexe as "M" | "F" | null,
    nbAffectations: Number(l.nbAffectations),
    heuresAffectees: Number(l.heuresAffectees),
    creneauxPlaces: Number(l.creneauxPlaces),
  }));
}

export interface FicheEnseignant {
  enseignant: typeof enseignants.$inferSelect;
  specialites: Array<{ id: string; matiereId: string; libelle: string; estPrincipale: boolean }>;
  affectations: Array<{
    id: string;
    classeId: string;
    classeLibelle: string;
    matiereId: string;
    matiereLibelle: string;
    heuresSemaine: string | null;
    creneauxPlaces: number;
  }>;
  indisponibilites: Array<{
    id: string;
    jourSemaine: number;
    creneauId: string | null;
    creneauLibelle: string | null;
    motif: string | null;
  }>;
}

export async function chargerFicheEnseignant(
  enseignantId: string,
  anneeId: string | null,
): Promise<FicheEnseignant | null> {
  const [enseignant] = await db.select().from(enseignants).where(eq(enseignants.id, enseignantId));
  if (!enseignant) return null;

  const [specialites, listeAffectations, listeIndispos] = await Promise.all([
    db
      .select({
        id: enseignantMatieres.id,
        matiereId: enseignantMatieres.matiereId,
        libelle: matieres.libelle,
        estPrincipale: enseignantMatieres.estPrincipale,
      })
      .from(enseignantMatieres)
      .innerJoin(matieres, eq(matieres.id, enseignantMatieres.matiereId))
      .where(eq(enseignantMatieres.enseignantId, enseignantId))
      .orderBy(sql`${enseignantMatieres.estPrincipale} DESC`, asc(matieres.libelle)),

    anneeId
      ? db
          .select({
            id: affectations.id,
            classeId: affectations.classeId,
            classeLibelle: classes.libelle,
            matiereId: affectations.matiereId,
            matiereLibelle: matieres.libelle,
            heuresSemaine: affectations.heuresSemaine,
            creneauxPlaces: sql<number>`(
              SELECT COALESCE(SUM(e.nb_creneaux), 0) FROM emploi_du_temps e
              WHERE e.classe_id = affectations.classe_id
                AND e.matiere_id = affectations.matiere_id
                AND e.annee_id = affectations.annee_id)`,
          })
          .from(affectations)
          .innerJoin(classes, eq(classes.id, affectations.classeId))
          .innerJoin(matieres, eq(matieres.id, affectations.matiereId))
          .where(
            and(
              eq(affectations.enseignantId, enseignantId),
              eq(affectations.anneeId, anneeId),
              eq(affectations.active, true),
            ),
          )
          .orderBy(asc(classes.libelle))
      : Promise.resolve([]),

    anneeId
      ? db
          .select({
            id: indisponibilites.id,
            jourSemaine: indisponibilites.jourSemaine,
            creneauId: indisponibilites.creneauId,
            creneauLibelle: creneauxHoraires.libelle,
            motif: indisponibilites.motif,
          })
          .from(indisponibilites)
          .leftJoin(creneauxHoraires, eq(creneauxHoraires.id, indisponibilites.creneauId))
          .where(
            and(
              eq(indisponibilites.enseignantId, enseignantId),
              eq(indisponibilites.anneeId, anneeId),
            ),
          )
          .orderBy(asc(indisponibilites.jourSemaine))
      : Promise.resolve([]),
  ]);

  return {
    enseignant,
    specialites,
    affectations: listeAffectations.map((a) => ({ ...a, creneauxPlaces: Number(a.creneauxPlaces) })),
    indisponibilites: listeIndispos,
  };
}

// ---------------------------------------------------------------------------
// Emploi du temps
// ---------------------------------------------------------------------------

export interface Creneau {
  id: string;
  libelle: string;
  heureDebut: string;
  heureFin: string;
  ordre: number;
}

export async function listerCreneaux(): Promise<Creneau[]> {
  return db
    .select({
      id: creneauxHoraires.id,
      libelle: creneauxHoraires.libelle,
      heureDebut: creneauxHoraires.heureDebut,
      heureFin: creneauxHoraires.heureFin,
      ordre: creneauxHoraires.ordre,
    })
    .from(creneauxHoraires)
    .orderBy(asc(creneauxHoraires.ordre));
}

export interface CoursEdt {
  id: string;
  jourSemaine: number;
  creneauId: string;
  creneauOrdre: number;
  nbCreneaux: number;
  semaineType: string | null;
  classeId: string;
  classeLibelle: string;
  matiereId: string;
  matiereLibelle: string;
  matiereCouleur: string | null;
  enseignantId: string | null;
  enseignantNom: string | null;
  salleId: string | null;
  salleCode: string | null;
  publie: boolean;
}

export type PortéeEdt =
  | { type: "classe"; id: string }
  | { type: "enseignant"; id: string }
  | { type: "salle"; id: string };

/** Grille complète pour une classe, un enseignant ou une salle. */
export async function chargerEmploiDuTemps(anneeId: string, portee: PortéeEdt): Promise<CoursEdt[]> {
  const filtre =
    portee.type === "classe"
      ? eq(emploiDuTemps.classeId, portee.id)
      : portee.type === "enseignant"
        ? eq(emploiDuTemps.enseignantId, portee.id)
        : eq(emploiDuTemps.salleId, portee.id);

  const lignes = await db
    .select({
      id: emploiDuTemps.id,
      jourSemaine: emploiDuTemps.jourSemaine,
      creneauId: emploiDuTemps.creneauId,
      creneauOrdre: creneauxHoraires.ordre,
      nbCreneaux: emploiDuTemps.nbCreneaux,
      semaineType: emploiDuTemps.semaineType,
      classeId: emploiDuTemps.classeId,
      classeLibelle: classes.libelle,
      matiereId: emploiDuTemps.matiereId,
      matiereLibelle: matieres.libelle,
      matiereCouleur: matieres.couleur,
      enseignantId: emploiDuTemps.enseignantId,
      enseignantNom: sql<string | null>`enseignants.prenom || ' ' || enseignants.nom`,
      salleId: emploiDuTemps.salleId,
      salleCode: salles.code,
      publie: emploiDuTemps.publie,
    })
    .from(emploiDuTemps)
    .innerJoin(creneauxHoraires, eq(creneauxHoraires.id, emploiDuTemps.creneauId))
    .innerJoin(classes, eq(classes.id, emploiDuTemps.classeId))
    .innerJoin(matieres, eq(matieres.id, emploiDuTemps.matiereId))
    .leftJoin(enseignants, eq(enseignants.id, emploiDuTemps.enseignantId))
    .leftJoin(salles, eq(salles.id, emploiDuTemps.salleId))
    .where(and(eq(emploiDuTemps.anneeId, anneeId), filtre))
    .orderBy(asc(emploiDuTemps.jourSemaine), asc(creneauxHoraires.ordre));

  return lignes.map((l) => ({ ...l, nbCreneaux: Number(l.nbCreneaux) }));
}

// ---------------------------------------------------------------------------
// Référentiels d'appoint
// ---------------------------------------------------------------------------

export async function listerSalles() {
  return db
    .select({
      id: salles.id,
      code: salles.code,
      libelle: salles.libelle,
      type: salles.type,
      capacite: salles.capacite,
      batiment: salles.batiment,
      active: salles.active,
    })
    .from(salles)
    .orderBy(asc(salles.code));
}

export async function listerClassesEtMatieres(anneeId: string) {
  const [listeClasses, listeMatieres] = await Promise.all([
    db
      .select({
        id: classes.id,
        libelle: classes.libelle,
        niveauLibelle: niveaux.libelle,
        serieCode: series.code,
      })
      .from(classes)
      .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
      .leftJoin(series, eq(series.id, classes.serieId))
      .where(and(eq(classes.anneeId, anneeId), eq(classes.active, true)))
      .orderBy(asc(niveaux.ordre), asc(classes.libelle)),

    db
      .select({ id: matieres.id, libelle: matieres.libelle, couleur: matieres.couleur })
      .from(matieres)
      .where(eq(matieres.active, true))
      .orderBy(asc(matieres.ordreBulletin)),
  ]);

  return { classes: listeClasses, matieres: listeMatieres };
}

/**
 * Enseignants affectés à un couple (classe, matière).
 * Sert à pré-remplir l'emploi du temps : le professeur d'une case découle
 * normalement de l'affectation, il n'y a pas à le ressaisir.
 */
export async function enseignantDeLAffectation(
  anneeId: string,
  classeId: string,
  matiereId: string,
): Promise<string | null> {
  const [ligne] = await db
    .select({ enseignantId: affectations.enseignantId })
    .from(affectations)
    .where(
      and(
        eq(affectations.anneeId, anneeId),
        eq(affectations.classeId, classeId),
        eq(affectations.matiereId, matiereId),
        eq(affectations.active, true),
      ),
    );
  return ligne?.enseignantId ?? null;
}
