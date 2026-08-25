import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./../db";

/**
 * Appréciations du professeur, matière par matière (E-41).
 *
 * LA TABLE EXISTAIT DEPUIS L'ORIGINE, ET N'ÉTAIT NI LUE NI ÉCRITE
 * ----------------------------------------------------------------
 * `appreciations_matiere` est déclarée depuis la migration 0004. Le bulletin
 * imprimait à sa place une mention DÉDUITE de la moyenne — « 14 » suivi de
 * « Bien » —, c'est-à-dire une paraphrase du chiffre situé dans la colonne
 * d'à côté. Aucun écran ne permettait d'écrire la vraie phrase.
 *
 * LA SAISIE SE FAIT PAR CLASSE ET PAR MATIÈRE
 * --------------------------------------------
 * C'est l'unité de travail réelle : un professeur a une matière et des classes,
 * et il rédige ses appréciations d'une traite en fin de trimestre. Une saisie
 * élève par élève lui imposerait quarante navigations.
 *
 * La moyenne et le rang dans la matière sont affichés à côté de chaque case.
 * Sans eux, on écrit de mémoire — et de mémoire on décrit l'élève dont on se
 * souvient, pas celui dont les résultats le justifient.
 */

export interface LigneAppreciation {
  inscriptionId: string;
  matricule: string;
  eleve: string;
  /** Moyenne de l'élève DANS CETTE MATIÈRE, telle que le bulletin l'imprimera. */
  moyenne: number | null;
  rangMatiere: number | null;
  moyenneClasse: number | null;
  appreciation: string | null;
}

export async function chargerAppreciationsClasse(
  classeId: string,
  matiereId: string,
  periodeId: string,
): Promise<LigneAppreciation[]> {
  const r = await db.execute<{
    inscription_id: string;
    matricule: string;
    eleve: string;
    moyenne: string | null;
    rang_matiere: number | null;
    moyenne_classe: string | null;
    appreciation: string | null;
  }>(sql`
    SELECT i.id AS inscription_id,
           e.matricule,
           e.nom || ' ' || e.prenom AS eleve,
           mm.moyenne::text        AS moyenne,
           mm.rang_matiere,
           mm.moyenne_classe::text AS moyenne_classe,
           am.appreciation
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      -- LEFT JOIN sur les moyennes : un élève inscrit après la dernière
      -- génération n'en a pas encore. Il doit tout de même apparaître dans la
      -- liste, sans quoi le professeur ne saurait pas qu'il l'a oublié.
      LEFT JOIN moyennes_matiere mm
             ON mm.inscription_id = i.id
            AND mm.periode_id = ${periodeId}::uuid
            AND mm.matiere_id = ${matiereId}::uuid
      LEFT JOIN appreciations_matiere am
             ON am.inscription_id = i.id
            AND am.periode_id = ${periodeId}::uuid
            AND am.matiere_id = ${matiereId}::uuid
     WHERE i.classe_id = ${classeId}::uuid
       AND i.active
     ORDER BY e.nom, e.prenom
  `);

  const n = (v: string | null) => (v === null ? null : Number(v));

  return r.rows.map((x) => ({
    inscriptionId: x.inscription_id,
    matricule: x.matricule,
    eleve: x.eleve,
    moyenne: n(x.moyenne),
    rangMatiere: x.rang_matiere,
    moyenneClasse: n(x.moyenne_classe),
    appreciation: x.appreciation,
  }));
}

/**
 * Avancement des appréciations d'une classe, matière par matière.
 *
 * C'est le pendant de « qui n'a pas saisi » côté notes (E-45) : le censeur doit
 * pouvoir dire quel professeur n'a pas rendu ses appréciations avant le conseil,
 * sans ouvrir douze écrans.
 */
export interface AvancementAppreciation {
  matiereId: string;
  matiere: string;
  saisies: number;
  attendues: number;
  enseignant: string | null;
}

export async function avancementAppreciations(
  classeId: string,
  periodeId: string,
): Promise<AvancementAppreciation[]> {
  const r = await db.execute<{
    matiere_id: string;
    matiere: string;
    saisies: number;
    attendues: number;
    enseignant: string | null;
  }>(sql`
    WITH effectif AS (
      SELECT count(*)::int AS n FROM inscriptions WHERE classe_id = ${classeId}::uuid AND active
    )
    SELECT m.id AS matiere_id,
           m.libelle AS matiere,
           (SELECT count(*)::int
              FROM appreciations_matiere am
              JOIN inscriptions i2 ON i2.id = am.inscription_id
             WHERE i2.classe_id = ${classeId}::uuid AND i2.active
               AND am.periode_id = ${periodeId}::uuid
               AND am.matiere_id = m.id) AS saisies,
           (SELECT n FROM effectif) AS attendues,
           (SELECT u.prenom || ' ' || u.nom
              FROM affectations af
              JOIN enseignants en ON en.id = af.enseignant_id
              JOIN utilisateurs u ON u.id = en.utilisateur_id
             WHERE af.classe_id = ${classeId}::uuid AND af.matiere_id = m.id AND af.active
             LIMIT 1) AS enseignant
      FROM matieres m
      JOIN classes c ON c.id = ${classeId}::uuid
      -- Mêmes jointures que le calcul des moyennes : la série discrimine au
      -- lycée (une série D n'a pas les coefficients d'une série A), et est
      -- NULLE au collège. Se contenter du niveau ferait apparaître des
      -- matières qui ne figurent pas au bulletin de cette classe.
      JOIN coefficients co
        ON co.matiere_id = m.id
       AND co.annee_id = c.annee_id
       AND co.niveau_id = c.niveau_id
       AND (co.serie_id IS NULL OR co.serie_id = c.serie_id)
     ORDER BY m.ordre_bulletin NULLS LAST, m.libelle
  `);

  return r.rows.map((x) => ({
    matiereId: x.matiere_id,
    matiere: x.matiere,
    saisies: Number(x.saisies),
    attendues: Number(x.attendues),
    enseignant: x.enseignant,
  }));
}
