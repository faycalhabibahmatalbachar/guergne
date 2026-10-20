import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

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
  /// Adresse de la photo, ou `null`. Voir la note sur `photo_id` plus bas.
  photoUrl: string | null;
  classeId: string | null;
  classeLibelle: string | null;
  niveauLibelle: string | null;
  serieCode: string | null;
  estRedoublant: boolean;
  parentNom: string | null;
  parentLien: string | null;
  parentTelephone: string | null;
  statutDossier: string | null;
}

export interface FiltresEleves {
  /** Colonne de tri (E-37). Ignorée si absente de la liste blanche. */
  tri?: string;
  /** 'asc' | 'desc' */
  sens?: string;
  recherche?: string;
  classeId?: string;
  niveauId?: string;
  anneeId?: string;
  dossier?: "BROUILLON" | "A_VALIDER" | "VALIDE" | "INCOMPLET" | "REFUSE";
  rapide?: "inscrits" | "suspendus" | "incomplets" | "redoublants";
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
/**
 * Colonnes sur lesquelles la liste accepte d'être triée (E-37).
 *
 * Une liste blanche, pas une interpolation : `tri` vient de l'URL, donc de
 * l'utilisateur. Laisser passer une expression arbitraire dans un `ORDER BY`
 * est une injection.
 */
const TRIS: Record<string, ReturnType<typeof sql>> = {
  nom: sql`eleves.nom`,
  prenom: sql`eleves.prenom`,
  matricule: sql`eleves.matricule`,
  classe: sql`classes.libelle`,
  statut: sql`eleves.statut::text`,
  naissance: sql`eleves.date_naissance`,
};

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
  if (filtres.dossier) conditions.push(eq(inscriptions.statutDossier, filtres.dossier));
  if (filtres.rapide === "inscrits") conditions.push(eq(eleves.statut, "INSCRIT"));
  if (filtres.rapide === "suspendus") conditions.push(inArray(eleves.statut, ["SUSPENDU_DISCIPLINE", "SUSPENDU_IMPAYE"]));
  if (filtres.rapide === "incomplets") conditions.push(eq(inscriptions.statutDossier, "INCOMPLET"));
  if (filtres.rapide === "redoublants") conditions.push(eq(inscriptions.estRedoublant, true));
  if (filtres.anneeId) conditions.push(sql`inscriptions.id IS NOT NULL`);

  const where = conditions.length ? and(...conditions) : undefined;

  // Restreint la jointure d'inscription à l'année courante, sinon un élève
  // réinscrit plusieurs années apparaîtrait en double.
  const anneeSelectionnee = filtres.anneeId ?? annee?.id;
  const jointureInscription = and(
    eq(inscriptions.eleveId, eleves.id),
    anneeSelectionnee ? eq(inscriptions.anneeId, anneeSelectionnee) : sql`false`,
  );

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
        // `photo_id` et NON `photo_url`.
        //
        // Les deux colonnes coexistent : `photo_url` date du schéma d'origine,
        // quand la photo était une adresse externe ; `photo_id` l'a remplacée
        // en migration 0022, quand le stockage est passé en base. Le
        // téléversement écrit `photo_id` depuis ce jour-là.
        //
        // Lire l'ancienne colonne rendait TOUTES les photos invisibles — sur
        // la liste comme dans l'application des parents — alors qu'elles
        // étaient bien enregistrées. Rien ne le signalait : une photo absente
        // affiche des initiales, ce qui est aussi le comportement normal.
        photoUrl: sql<string | null>`CASE WHEN eleves.photo_id IS NULL THEN NULL
                                          ELSE '/api/fichiers/' || eleves.photo_id::text END`,
        classeId: classes.id,
        classeLibelle: classes.libelle,
        niveauLibelle: niveaux.libelle,
        serieCode: series.code,
        estRedoublant: inscriptions.estRedoublant,
        statutDossier: inscriptions.statutDossier,
        parentNom: sql<string | null>`(SELECT t.nom || ' ' || t.prenom FROM eleve_tuteur et JOIN tuteurs t ON t.id = et.tuteur_id WHERE et.eleve_id = eleves.id ORDER BY et.est_principal DESC, et.cree_le ASC LIMIT 1)`,
        parentLien: sql<string | null>`(SELECT et.lien::text FROM eleve_tuteur et WHERE et.eleve_id = eleves.id ORDER BY et.est_principal DESC, et.cree_le ASC LIMIT 1)`,
        parentTelephone: sql<string | null>`(SELECT t.telephone FROM eleve_tuteur et JOIN tuteurs t ON t.id = et.tuteur_id WHERE et.eleve_id = eleves.id ORDER BY et.est_principal DESC, et.cree_le ASC LIMIT 1)`,
      })
      .from(eleves)
      .leftJoin(inscriptions, jointureInscription)
      .leftJoin(classes, eq(classes.id, inscriptions.classeId))
      .leftJoin(niveaux, eq(niveaux.id, classes.niveauId))
      .leftJoin(series, eq(series.id, classes.serieId))
      .where(where)
      // Ordre naturel : classe puis nom, celui dont on a besoin pour l'appel.
      // Un tri explicite le remplace, jamais ne s'y ajoute — sans quoi le
      // second critère rendrait le premier presque inopérant.
      .orderBy(
        ...(TRIS[filtres.tri ?? ""]
          ? [
              filtres.sens === "desc"
                ? sql`${TRIS[filtres.tri!]} DESC NULLS LAST`
                : sql`${TRIS[filtres.tri!]} ASC NULLS LAST`,
            ]
          : [asc(eleves.nom), asc(eleves.prenom)]),
      )
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

/** Années disponibles pour les filtres de la liste. */
export async function listerAnneesEleves() {
  return db.select({ id: anneesScolaires.id, libelle: anneesScolaires.libelle, estCourante: anneesScolaires.estCourante })
    .from(anneesScolaires).orderBy(desc(anneesScolaires.dateDebut));
}

/** Indicateurs calculés sur les dossiers réels, sans tendances fictives. */
export async function statistiquesEleves(anneeId?: string) {
  const [annee] = await db.select({ id: anneesScolaires.id }).from(anneesScolaires)
    .where(eq(anneesScolaires.estCourante, true)).limit(1);
  const id = anneeId ?? annee?.id;
  const result = await db.execute<{
    total: number; inscrits: number; nouveaux: number; incomplets: number;
    suspendus: number; reinscriptions: number; redoublants: number;
  }>(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE e.statut = 'INSCRIT')::int AS inscrits,
      count(*) FILTER (WHERE i.type = 'INSCRIPTION' AND i.date_inscription >= date_trunc('week', current_date)::date)::int AS nouveaux,
      count(*) FILTER (WHERE i.statut_dossier = 'INCOMPLET')::int AS incomplets,
      count(*) FILTER (WHERE e.statut IN ('SUSPENDU_DISCIPLINE', 'SUSPENDU_IMPAYE'))::int AS suspendus,
      count(*) FILTER (WHERE i.type = 'REINSCRIPTION')::int AS reinscriptions,
      count(*) FILTER (WHERE i.est_redoublant)::int AS redoublants
    FROM eleves e LEFT JOIN inscriptions i ON i.eleve_id = e.id
      AND ${id ? sql`i.annee_id = ${id}::uuid` : sql`false`}
    WHERE ${anneeId ? sql`i.id IS NOT NULL` : sql`true`}
  `);
  return result.rows[0] ?? { total: 0, inscrits: 0, nouveaux: 0, incomplets: 0, suspendus: 0, reinscriptions: 0, redoublants: 0 };
}

/** Classes de l'année sélectionnée (courante par défaut). */
export async function listerClassesCourantes(anneeId?: string) {
  const [annee] = await db
    .select({ id: anneesScolaires.id })
    .from(anneesScolaires)
    .where(eq(anneesScolaires.estCourante, true))
    .limit(1);

  if (!annee && !anneeId) return [];

  return db
    .select({
      id: classes.id,
      niveauId: classes.niveauId,
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
    .where(and(eq(classes.anneeId, anneeId ?? annee!.id), anneeId ? undefined : eq(classes.active, true)))
    .orderBy(asc(niveaux.ordre), asc(classes.libelle));
}
