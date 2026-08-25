import "server-only";

import { sql } from "drizzle-orm";

import type { Etablissement } from "./../pdf/gabarit";
import { db } from "./../db";

/**
 * Contrôle de couverture de l'emploi du temps (E-50).
 *
 * CE QUI NE SE VOIT PAS EN REGARDANT UNE GRILLE
 * ----------------------------------------------
 * Une grille hebdomadaire pleine a l'air correcte. Elle ne dit pas qu'il
 * manque deux heures de mathématiques à la 4e B, parce qu'une case vide
 * ressemble à une récréation. Le défaut ne se découvre qu'au conseil de classe,
 * quand la moyenne de la matière est basse dans une seule classe du niveau —
 * et on l'attribue alors aux élèves.
 *
 * « HEURE » VEUT DIRE « HEURE DE COURS », PAS SOIXANTE MINUTES
 * -------------------------------------------------------------
 * Les créneaux de l'établissement durent 55 minutes, et `heures_semaine` compte
 * des créneaux : « 4 heures de français » signifie quatre créneaux. On compare
 * donc des créneaux à des créneaux. Convertir en minutes ferait apparaître un
 * déficit de 8 % partout, qui n'existe pas.
 *
 * TROIS ANOMALIES, PAS UNE
 * -------------------------
 * Le déficit et l'excédent d'heures sont les plus visibles, mais la matière
 * affectée et JAMAIS placée est la plus grave : elle n'apparaît nulle part sur
 * la grille, donc personne ne la cherche. Et le cours placé sans affectation
 * est l'inverse — du temps d'élève consommé par une matière que le référentiel
 * ne prévoit pas à ce niveau.
 */

export type Anomalie = "DEFICIT" | "EXCEDENT" | "ABSENTE" | "HORS_PROGRAMME" | "SANS_ENSEIGNANT";

export interface LigneCouverture {
  classeId: string;
  classe: string;
  matiereId: string;
  matiere: string;
  /** Créneaux hebdomadaires prévus par l'affectation. `null` = aucune affectation. */
  attendus: number | null;
  places: number;
  enseignant: string | null;
  anomalies: Anomalie[];
}

export interface Couverture {
  lignes: LigneCouverture[];
  /** Classes n'ayant aucun cours placé — cas à signaler avant tout le reste. */
  classesVides: Array<{ id: string; libelle: string }>;
}

export async function controleHoraire(
  anneeId: string,
  classeId?: string,
): Promise<Couverture> {
  // FULL OUTER JOIN délibéré : on veut aussi bien l'affectation sans cours
  // (matière absente de la grille) que le cours sans affectation (matière hors
  // programme). Une jointure interne, ou même un LEFT, en manquerait un des
  // deux — et ce sont justement les cas que personne ne repère à l'œil.
  const r = await db.execute<{
    classe_id: string;
    classe: string;
    matiere_id: string;
    matiere: string;
    attendus: string | null;
    places: number;
    enseignant: string | null;
    sans_enseignant: number;
  }>(sql`
    WITH prevu AS (
      SELECT af.classe_id, af.matiere_id, af.heures_semaine,
             u.prenom || ' ' || u.nom AS enseignant
        FROM affectations af
        LEFT JOIN enseignants en ON en.id = af.enseignant_id
        LEFT JOIN utilisateurs u ON u.id = en.utilisateur_id
       WHERE af.annee_id = ${anneeId}::uuid
         AND af.active
         AND (${classeId ?? null}::uuid IS NULL OR af.classe_id = ${classeId ?? null}::uuid)
    ),
    pose AS (
      SELECT e.classe_id, e.matiere_id,
             SUM(e.nb_creneaux)::int AS places,
             count(*) FILTER (WHERE e.enseignant_id IS NULL)::int AS sans_enseignant
        FROM emploi_du_temps e
       WHERE e.annee_id = ${anneeId}::uuid
         AND (${classeId ?? null}::uuid IS NULL OR e.classe_id = ${classeId ?? null}::uuid)
       GROUP BY 1, 2
    )
    SELECT COALESCE(p.classe_id, q.classe_id)   AS classe_id,
           c.libelle                            AS classe,
           COALESCE(p.matiere_id, q.matiere_id) AS matiere_id,
           m.libelle                            AS matiere,
           p.heures_semaine::text               AS attendus,
           COALESCE(q.places, 0)                AS places,
           p.enseignant,
           COALESCE(q.sans_enseignant, 0)       AS sans_enseignant
      FROM prevu p
      FULL OUTER JOIN pose q
        ON q.classe_id = p.classe_id AND q.matiere_id = p.matiere_id
      JOIN classes  c ON c.id = COALESCE(p.classe_id, q.classe_id)
      JOIN matieres m ON m.id = COALESCE(p.matiere_id, q.matiere_id)
     ORDER BY c.libelle, m.libelle
  `);

  const lignes: LigneCouverture[] = r.rows.map((x) => {
    const attendus = x.attendus === null ? null : Number(x.attendus);
    const places = Number(x.places);
    const anomalies: Anomalie[] = [];

    if (attendus === null) {
      anomalies.push("HORS_PROGRAMME");
    } else if (places === 0) {
      // Signalée à part du simple déficit : une matière absente de la grille
      // n'y laisse aucune trace, donc personne ne la cherche.
      anomalies.push("ABSENTE");
    } else if (places < attendus) {
      anomalies.push("DEFICIT");
    } else if (places > attendus) {
      anomalies.push("EXCEDENT");
    }

    if (Number(x.sans_enseignant) > 0) anomalies.push("SANS_ENSEIGNANT");

    return {
      classeId: x.classe_id,
      classe: x.classe,
      matiereId: x.matiere_id,
      matiere: x.matiere,
      attendus,
      places,
      enseignant: x.enseignant,
      anomalies,
    };
  });

  const classesVides = await db.execute<{ id: string; libelle: string }>(sql`
    SELECT c.id, c.libelle
      FROM classes c
     WHERE c.annee_id = ${anneeId}::uuid
       AND (${classeId ?? null}::uuid IS NULL OR c.id = ${classeId ?? null}::uuid)
       AND NOT EXISTS (
         SELECT 1 FROM emploi_du_temps e
          WHERE e.classe_id = c.id AND e.annee_id = ${anneeId}::uuid
       )
     ORDER BY c.libelle
  `);

  return { lignes, classesVides: classesVides.rows };
}

/**
 * Données d'impression d'un emploi du temps (E-47).
 *
 * Une grille affichée à l'écran et une grille imprimée n'ont pas le même
 * public : la première sert à construire, la seconde à consulter. On imprime
 * donc SANS les boutons, sans les cases vides cliquables, et avec l'en-tête de
 * l'établissement — parce que la feuille finit affichée au mur d'une salle et
 * doit se lire seule.
 */
export interface CaseImpression {
  jour: number;
  ordre: number;
  nbCreneaux: number;
  matiere: string;
  enseignant: string | null;
  classe: string;
  salle: string | null;
  semaineType: string | null;
}

export interface GrilleImpression {
  titre: string;
  sousTitre: string;
  etablissement: Etablissement;
  annee: string;
  creneaux: Array<{ id: string; libelle: string; ordre: number }>;
  cases: CaseImpression[];
}

export async function grilleImpression(
  anneeId: string,
  portee: { type: "classe" | "enseignant" | "salle"; id: string },
): Promise<GrilleImpression | null> {
  const colonne =
    portee.type === "classe"
      ? sql`e.classe_id`
      : portee.type === "enseignant"
        ? sql`e.enseignant_id`
        : sql`e.salle_id`;

  const [etab, annee, creneaux, cases] = await Promise.all([
    db.execute<Etablissement & Record<string, unknown>>(sql`
      SELECT nom, sigle, adresse, ville, pays, telephone, email,
             ministere_tutelle AS "ministereTutelle",
             autorisation_numero AS "autorisationNumero",
             nom_proviseur AS "nomProviseur",
             nom_censeur AS "nomCenseur"
        FROM etablissement LIMIT 1
    `),
    db.execute<{ libelle: string }>(sql`
      SELECT libelle FROM annees_scolaires WHERE id = ${anneeId}::uuid
    `),
    db.execute<{ id: string; libelle: string; ordre: number }>(sql`
      SELECT id, libelle, ordre FROM creneaux_horaires ORDER BY ordre
    `),
    db.execute<{
      jour: number;
      ordre: number;
      nb_creneaux: number;
      matiere: string;
      enseignant: string | null;
      classe: string;
      salle: string | null;
      semaine_type: string | null;
    }>(sql`
      SELECT e.jour_semaine AS jour,
             cr.ordre,
             e.nb_creneaux,
             m.libelle AS matiere,
             u.prenom || ' ' || u.nom AS enseignant,
             c.libelle AS classe,
             s.code AS salle,
             e.semaine_type
        FROM emploi_du_temps e
        JOIN creneaux_horaires cr ON cr.id = e.creneau_id
        JOIN matieres m ON m.id = e.matiere_id
        JOIN classes  c ON c.id = e.classe_id
        LEFT JOIN enseignants en ON en.id = e.enseignant_id
        LEFT JOIN utilisateurs u ON u.id = en.utilisateur_id
        LEFT JOIN salles s ON s.id = e.salle_id
       WHERE e.annee_id = ${anneeId}::uuid
         AND ${colonne} = ${portee.id}::uuid
       ORDER BY e.jour_semaine, cr.ordre
    `),
  ]);

  if (!annee.rows[0]) return null;

  const titres = await db.execute<{ libelle: string }>(
    portee.type === "classe"
      ? sql`SELECT libelle FROM classes WHERE id = ${portee.id}::uuid`
      : portee.type === "enseignant"
        ? sql`SELECT u.prenom || ' ' || u.nom AS libelle
                FROM enseignants en JOIN utilisateurs u ON u.id = en.utilisateur_id
               WHERE en.id = ${portee.id}::uuid`
        : sql`SELECT code || ' — ' || libelle AS libelle FROM salles WHERE id = ${portee.id}::uuid`,
  );

  const e: Etablissement = etab.rows[0] ?? {
    nom: "Établissement",
    sigle: "",
    adresse: null,
    ville: null,
    pays: null,
    telephone: null,
    email: null,
    ministereTutelle: null,
    autorisationNumero: null,
    nomProviseur: null,
    nomCenseur: null,
  };

  return {
    titre: titres.rows[0]?.libelle ?? "",
    sousTitre:
      portee.type === "classe"
        ? "Emploi du temps de la classe"
        : portee.type === "enseignant"
          ? "Emploi du temps du professeur"
          : "Occupation de la salle",
    etablissement: e,
    annee: annee.rows[0].libelle,
    creneaux: creneaux.rows.map((c) => ({ ...c, ordre: Number(c.ordre) })),
    cases: cases.rows.map((c) => ({
      jour: Number(c.jour),
      ordre: Number(c.ordre),
      nbCreneaux: Number(c.nb_creneaux),
      matiere: c.matiere,
      enseignant: c.enseignant,
      classe: c.classe,
      salle: c.salle,
      semaineType: c.semaine_type,
    })),
  };
}
