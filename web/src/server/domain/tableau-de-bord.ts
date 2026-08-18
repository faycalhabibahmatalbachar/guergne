import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  anneesScolaires,
  classes,
  eleves,
  enseignants,
  inscriptions,
  matieres,
  periodes,
  coefficients,
} from "@/server/db/schema";

/**
 * Données du tableau de bord de direction.
 *
 * Toutes les valeurs proviennent de la base. Aucune n'est simulée : un
 * compteur à zéro signifie réellement zéro, et c'est une information utile
 * en début de déploiement.
 */

export interface AnneeCourante {
  id: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
}

export interface PeriodeCourante {
  id: string;
  libelle: string;
  numero: number;
  dateDebut: string;
  dateFin: string;
  estVerrouillee: boolean;
  saisieOuverte: boolean;
}

export interface StatistiquesEtablissement {
  annee: AnneeCourante | null;
  periode: PeriodeCourante | null;
  effectifTotal: number;
  effectifGarcons: number;
  effectifFilles: number;
  nbClasses: number;
  nbEnseignants: number;
  nbMatieres: number;
  nbCoefficients: number;
  repartitionParNiveau: Array<{
    niveau: string;
    cycle: string;
    effectif: number;
    nbClasses: number;
  }>;
}

export async function chargerAnneeCourante(): Promise<AnneeCourante | null> {
  const [annee] = await db
    .select({
      id: anneesScolaires.id,
      libelle: anneesScolaires.libelle,
      dateDebut: anneesScolaires.dateDebut,
      dateFin: anneesScolaires.dateFin,
    })
    .from(anneesScolaires)
    .where(eq(anneesScolaires.estCourante, true))
    .limit(1);

  return annee ?? null;
}

/**
 * Période en cours : celle qui contient la date du jour.
 *
 * Hors période (vacances), on retombe sur la dernière période commencée —
 * c'est celle dont les bulletins sont en cours de traitement, donc celle qui
 * intéresse l'administration.
 */
async function chargerPeriodeCourante(anneeId: string): Promise<PeriodeCourante | null> {
  const lignes = await db
    .select({
      id: periodes.id,
      libelle: periodes.libelle,
      numero: periodes.numero,
      dateDebut: periodes.dateDebut,
      dateFin: periodes.dateFin,
      estVerrouillee: periodes.estVerrouillee,
      saisieOuverte: periodes.saisieOuverte,
    })
    .from(periodes)
    .where(eq(periodes.anneeId, anneeId))
    .orderBy(
      // La période contenant aujourd'hui d'abord, sinon la plus récente commencée.
      sql`(${periodes.dateDebut} <= CURRENT_DATE AND ${periodes.dateFin} >= CURRENT_DATE) DESC`,
      sql`${periodes.dateDebut} DESC`,
    )
    .limit(1);

  return lignes[0] ?? null;
}

export async function chargerStatistiques(): Promise<StatistiquesEtablissement> {
  const annee = await chargerAnneeCourante();

  // Sans année scolaire configurée, rien n'est rattachable : on renvoie une
  // structure vide plutôt que d'inventer un contexte.
  if (!annee) {
    const [{ valeur: nbMatieres }] = await db.select({ valeur: count() }).from(matieres);
    const [{ valeur: nbEnseignants }] = await db
      .select({ valeur: count() })
      .from(enseignants)
      .where(eq(enseignants.actif, true));

    return {
      annee: null,
      periode: null,
      effectifTotal: 0,
      effectifGarcons: 0,
      effectifFilles: 0,
      nbClasses: 0,
      nbEnseignants,
      nbMatieres,
      nbCoefficients: 0,
      repartitionParNiveau: [],
    };
  }

  const [periode, effectifs, nbClassesRes, nbEnseignantsRes, nbMatieresRes, nbCoefRes, repartition] =
    await Promise.all([
      chargerPeriodeCourante(annee.id),

      db
        .select({
          total: count(),
          garcons: sql<number>`count(*) FILTER (WHERE ${eleves.sexe} = 'M')::int`,
          filles: sql<number>`count(*) FILTER (WHERE ${eleves.sexe} = 'F')::int`,
        })
        .from(inscriptions)
        .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
        .where(and(eq(inscriptions.anneeId, annee.id), eq(inscriptions.active, true))),

      db
        .select({ valeur: count() })
        .from(classes)
        .where(and(eq(classes.anneeId, annee.id), eq(classes.active, true))),

      db.select({ valeur: count() }).from(enseignants).where(eq(enseignants.actif, true)),

      db.select({ valeur: count() }).from(matieres).where(eq(matieres.active, true)),

      db.select({ valeur: count() }).from(coefficients).where(eq(coefficients.anneeId, annee.id)),

      db.execute<{ niveau: string; cycle: string; effectif: number; nb_classes: number }>(sql`
        SELECT n.libelle                                        AS niveau,
               n.cycle::text                                    AS cycle,
               COUNT(DISTINCT i.id) FILTER (WHERE i.active)::int AS effectif,
               COUNT(DISTINCT c.id)::int                        AS nb_classes
          FROM niveaux n
          LEFT JOIN classes c ON c.niveau_id = n.id AND c.annee_id = ${annee.id} AND c.active
          LEFT JOIN inscriptions i ON i.classe_id = c.id
         GROUP BY n.id, n.libelle, n.cycle, n.ordre
         ORDER BY n.ordre
      `),
    ]);

  return {
    annee,
    periode,
    effectifTotal: effectifs[0]?.total ?? 0,
    effectifGarcons: effectifs[0]?.garcons ?? 0,
    effectifFilles: effectifs[0]?.filles ?? 0,
    nbClasses: nbClassesRes[0]?.valeur ?? 0,
    nbEnseignants: nbEnseignantsRes[0]?.valeur ?? 0,
    nbMatieres: nbMatieresRes[0]?.valeur ?? 0,
    nbCoefficients: nbCoefRes[0]?.valeur ?? 0,
    repartitionParNiveau: (repartition.rows ?? []).map((r) => ({
      niveau: r.niveau,
      cycle: r.cycle,
      effectif: Number(r.effectif),
      nbClasses: Number(r.nb_classes),
    })),
  };
}

/**
 * Étapes de configuration restant à faire.
 *
 * Un établissement qui démarre a besoin qu'on lui dise quoi faire, dans
 * l'ordre — pas d'un tableau de bord vide qui ressemble à une panne.
 */
export interface EtapeDemarrage {
  cle: string;
  titre: string;
  description: string;
  faite: boolean;
  url?: string;
}

export function etapesDemarrage(stats: StatistiquesEtablissement): EtapeDemarrage[] {
  return [
    {
      cle: "annee",
      titre: "Créer l'année scolaire",
      description: "Définir l'année en cours et ses trois trimestres.",
      faite: stats.annee !== null,
      url: "/dashboard/parametres",
    },
    {
      cle: "coefficients",
      titre: "Saisir les coefficients",
      description:
        "Le poids de chaque matière par niveau et par série. Sans eux, aucune moyenne générale ne peut être calculée.",
      faite: stats.nbCoefficients > 0,
      url: "/dashboard/parametres",
    },
    {
      cle: "classes",
      titre: "Créer les classes",
      description: "De la 6ème à la Terminale, avec leur série au lycée.",
      faite: stats.nbClasses > 0,
      url: "/dashboard/classes",
    },
    {
      cle: "enseignants",
      titre: "Enregistrer les enseignants",
      description: "Puis les affecter aux couples classe × matière.",
      faite: stats.nbEnseignants > 0,
      url: "/dashboard/personnel",
    },
    {
      cle: "eleves",
      titre: "Inscrire les élèves",
      description: "Un par un, ou en masse depuis un fichier Excel.",
      faite: stats.effectifTotal > 0,
      url: "/dashboard/eleves",
    },
  ];
}
