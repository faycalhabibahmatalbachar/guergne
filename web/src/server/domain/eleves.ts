import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import type { StatutEleve as StatutEleveType } from "@/lib/eleves-constantes";
import { db } from "@/server/db";
import {
  anneesScolaires,
  classes,
  eleves,
  eleveTuteur,
  inscriptions,
  niveaux,
  series,
  tuteurs,
} from "@/server/db/schema";

export type { StatutEleve } from "@/lib/eleves-constantes";
export { LIBELLES_STATUT, TONS_STATUT } from "@/lib/eleves-constantes";

export interface LigneEleve {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F";
  dateNaissance: string;
  statut: StatutEleveType;
  photoUrl: string | null;
  classeId: string | null;
  classeLibelle: string | null;
  niveauLibelle: string | null;
  serieCode: string | null;
  estRedoublant: boolean;
}

export interface FiltresEleves {
  recherche?: string;
  classeId?: string;
  niveauId?: string;
  statut?: StatutEleveType;
  page?: number;
  parPage?: number;
}

export interface ResultatEleves {
  lignes: LigneEleve[];
  total: number;
  page: number;
  parPage: number;
  nbPages: number;
}

const PAR_PAGE_DEFAUT = 25;
const PAR_PAGE_MAX = 100;

/**
 * Liste paginée des élèves de l'année courante.
 *
 * La jointure sur `inscriptions` est volontairement un LEFT JOIN : un élève
 * pré-inscrit ou transféré n'a pas forcément d'inscription active, et il doit
 * malgré tout rester visible au secrétariat.
 */
export async function listerEleves(filtres: FiltresEleves = {}): Promise<ResultatEleves> {
  const page = Math.max(1, filtres.page ?? 1);
  const parPage = Math.min(PAR_PAGE_MAX, Math.max(5, filtres.parPage ?? PAR_PAGE_DEFAUT));

  const [annee] = await db
    .select({ id: anneesScolaires.id })
    .from(anneesScolaires)
    .where(eq(anneesScolaires.estCourante, true))
    .limit(1);

  const conditions = [];

  if (filtres.recherche?.trim()) {
    const motif = `%${filtres.recherche.trim()}%`;
    conditions.push(
      or(ilike(eleves.nom, motif), ilike(eleves.prenom, motif), ilike(eleves.matricule, motif)),
    );
  }
  if (filtres.statut) conditions.push(eq(eleves.statut, filtres.statut));
  if (filtres.classeId) conditions.push(eq(inscriptions.classeId, filtres.classeId));
  if (filtres.niveauId) conditions.push(eq(classes.niveauId, filtres.niveauId));

  const where = conditions.length ? and(...conditions) : undefined;

  // Restreint la jointure d'inscription à l'année courante, sinon un élève
  // réinscrit plusieurs années apparaîtrait en double.
  const jointureInscription = annee
    ? and(eq(inscriptions.eleveId, eleves.id), eq(inscriptions.anneeId, annee.id))
    : eq(inscriptions.eleveId, eleves.id);

  const [lignes, totalRes] = await Promise.all([
    db
      .select({
        id: eleves.id,
        matricule: eleves.matricule,
        nom: eleves.nom,
        prenom: eleves.prenom,
        sexe: eleves.sexe,
        dateNaissance: eleves.dateNaissance,
        statut: eleves.statut,
        photoUrl: eleves.photoUrl,
        classeId: classes.id,
        classeLibelle: classes.libelle,
        niveauLibelle: niveaux.libelle,
        serieCode: series.code,
        estRedoublant: inscriptions.estRedoublant,
      })
      .from(eleves)
      .leftJoin(inscriptions, jointureInscription)
      .leftJoin(classes, eq(classes.id, inscriptions.classeId))
      .leftJoin(niveaux, eq(niveaux.id, classes.niveauId))
      .leftJoin(series, eq(series.id, classes.serieId))
      .where(where)
      .orderBy(asc(eleves.nom), asc(eleves.prenom))
      .limit(parPage)
      .offset((page - 1) * parPage),

    db
      .select({ valeur: count() })
      .from(eleves)
      .leftJoin(inscriptions, jointureInscription)
      .leftJoin(classes, eq(classes.id, inscriptions.classeId))
      .where(where),
  ]);

  const total = totalRes[0]?.valeur ?? 0;

  return {
    lignes: lignes.map((l) => ({
      ...l,
      sexe: l.sexe as "M" | "F",
      statut: l.statut as StatutEleveType,
      estRedoublant: l.estRedoublant ?? false,
    })),
    total,
    page,
    parPage,
    nbPages: Math.max(1, Math.ceil(total / parPage)),
  };
}

export interface DossierEleve {
  eleve: {
    id: string;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: "M" | "F";
    dateNaissance: string;
    lieuNaissance: string | null;
    nationalite: string | null;
    adresse: string | null;
    quartier: string | null;
    photoUrl: string | null;
    statut: StatutEleveType;
    ecoleOrigine: string | null;
    acteNaissanceNumero: string | null;
    groupeSanguin: string | null;
    allergies: string | null;
  };
  inscription: {
    id: string;
    classeId: string;
    classeLibelle: string;
    niveauLibelle: string;
    serieCode: string | null;
    estRedoublant: boolean;
    estBoursier: boolean;
    dateInscription: string;
  } | null;
  tuteurs: Array<{
    id: string;
    nom: string;
    prenom: string;
    lien: string;
    telephone: string;
    profession: string | null;
    estPrincipal: boolean;
    estResponsableFinancier: boolean;
    appActivee: boolean;
  }>;
}

export async function chargerDossier(eleveId: string): Promise<DossierEleve | null> {
  const [eleve] = await db.select().from(eleves).where(eq(eleves.id, eleveId)).limit(1);
  if (!eleve) return null;

  const [annee] = await db
    .select({ id: anneesScolaires.id })
    .from(anneesScolaires)
    .where(eq(anneesScolaires.estCourante, true))
    .limit(1);

  const [inscriptionRes, tuteursRes] = await Promise.all([
    annee
      ? db
          .select({
            id: inscriptions.id,
            classeId: classes.id,
            classeLibelle: classes.libelle,
            niveauLibelle: niveaux.libelle,
            serieCode: series.code,
            estRedoublant: inscriptions.estRedoublant,
            estBoursier: inscriptions.estBoursier,
            dateInscription: inscriptions.dateInscription,
          })
          .from(inscriptions)
          .innerJoin(classes, eq(classes.id, inscriptions.classeId))
          .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
          .leftJoin(series, eq(series.id, classes.serieId))
          .where(and(eq(inscriptions.eleveId, eleveId), eq(inscriptions.anneeId, annee.id)))
          .limit(1)
      : Promise.resolve([]),

    db
      .select({
        id: tuteurs.id,
        nom: tuteurs.nom,
        prenom: tuteurs.prenom,
        lien: eleveTuteur.lien,
        telephone: tuteurs.telephone,
        profession: tuteurs.profession,
        estPrincipal: eleveTuteur.estPrincipal,
        estResponsableFinancier: eleveTuteur.estResponsableFinancier,
        appActivee: tuteurs.appActivee,
      })
      .from(eleveTuteur)
      .innerJoin(tuteurs, eq(tuteurs.id, eleveTuteur.tuteurId))
      .where(eq(eleveTuteur.eleveId, eleveId))
      .orderBy(desc(eleveTuteur.estPrincipal)),
  ]);

  return {
    eleve: {
      ...eleve,
      sexe: eleve.sexe as "M" | "F",
      statut: eleve.statut as StatutEleveType,
    },
    inscription: inscriptionRes[0] ?? null,
    tuteurs: tuteursRes,
  };
}

/** Classes de l'année courante, pour les listes déroulantes. */
export async function listerClassesCourantes() {
  const [annee] = await db
    .select({ id: anneesScolaires.id })
    .from(anneesScolaires)
    .where(eq(anneesScolaires.estCourante, true))
    .limit(1);

  if (!annee) return [];

  return db
    .select({
      id: classes.id,
      libelle: classes.libelle,
      code: classes.code,
      niveauLibelle: niveaux.libelle,
      niveauOrdre: niveaux.ordre,
      capaciteMax: classes.capaciteMax,
      effectif: sql<number>`(
        SELECT COUNT(*)::int FROM inscriptions i
         WHERE i.classe_id = ${classes.id} AND i.active
      )`,
    })
    .from(classes)
    .innerJoin(niveaux, eq(niveaux.id, classes.niveauId))
    .where(and(eq(classes.anneeId, annee.id), eq(classes.active, true)))
    .orderBy(asc(niveaux.ordre), asc(classes.libelle));
}
