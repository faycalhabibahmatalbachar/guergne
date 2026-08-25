import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./../db";

/**
 * Remplacements (E-49) et journée de cours (E-48).
 *
 * LA TABLE `remplacements` EXISTAIT ET N'ÉTAIT NI LUE NI ÉCRITE
 * --------------------------------------------------------------
 * Déclarée en 0015, jamais branchée. C'est la troisième du projet dans ce cas,
 * après `notes_conduite` et `appreciations_matiere`.
 *
 * CE QUE L'ÉCRAN DOIT RÉSOUDRE N'EST PAS « ENREGISTRER UNE ABSENCE »
 * -------------------------------------------------------------------
 * C'est « qui peut prendre ce cours ». Le censeur connaît l'absent en trente
 * secondes ; ce qu'il ne sait pas, c'est lequel de ses quarante professeurs est
 * libre mardi de 10 h à 11 h. Sans cette réponse il choisit de mémoire, désigne
 * quelqu'un qui a déjà cours, et produit une deuxième classe sans professeur.
 */

export interface CoursDuJour {
  emploiDuTempsId: string;
  creneauId: string;
  creneauLibelle: string;
  ordre: number;
  nbCreneaux: number;
  classeId: string;
  classe: string;
  matiere: string;
  enseignantId: string | null;
  enseignant: string | null;
  salle: string | null;
  /** Remplacement déjà déclaré pour ce cours À CETTE DATE, s'il existe. */
  remplacementId: string | null;
  remplacant: string | null;
  motif: string | null;
  dateRattrapage: string | null;
}

/**
 * Tous les cours d'une journée (E-48).
 *
 * UNE DATE, PAS UN JOUR DE LA SEMAINE
 * ------------------------------------
 * On saisit « mardi 3 mars », pas « mardi ». C'est indispensable aux
 * remplacements, qui portent sur une date précise : un professeur absent ce
 * mardi-ci ne l'est pas tous les mardis. Le jour de semaine est déduit par
 * `ISODOW`, qui numérote lundi = 1 comme la table.
 */
export async function coursDuJour(
  anneeId: string,
  date: string,
  filtres: { enseignantId?: string; classeId?: string } = {},
): Promise<CoursDuJour[]> {
  const r = await db.execute<{
    id: string;
    creneau_id: string;
    creneau: string;
    ordre: number;
    nb_creneaux: number;
    classe_id: string;
    classe: string;
    matiere: string;
    enseignant_id: string | null;
    enseignant: string | null;
    salle: string | null;
    remplacement_id: string | null;
    remplacant: string | null;
    motif: string | null;
    date_rattrapage: string | null;
  }>(sql`
    SELECT e.id,
           e.creneau_id,
           cr.libelle AS creneau,
           cr.ordre,
           e.nb_creneaux,
           e.classe_id,
           c.libelle  AS classe,
           m.libelle  AS matiere,
           e.enseignant_id,
           en.prenom || ' ' || en.nom AS enseignant,
           s.code AS salle,
           rm.id AS remplacement_id,
           enr.prenom || ' ' || enr.nom AS remplacant,
           rm.motif,
           rm.date_rattrapage::text AS date_rattrapage
      FROM emploi_du_temps e
      JOIN creneaux_horaires cr ON cr.id = e.creneau_id
      JOIN classes  c ON c.id = e.classe_id
      JOIN matieres m ON m.id = e.matiere_id
      -- Le nom du professeur vit dans la table enseignants, PAS dans
      -- utilisateurs : tous les enseignants n'ont pas de compte, la colonne
      -- utilisateur_id etant nullable. Passer par utilisateurs renvoyait des
      -- noms vides en LEFT JOIN, et surtout ZERO ligne en jointure interne --
      -- un ecran vide qu'on prend pour "personne n'est disponible".
      LEFT JOIN enseignants en ON en.id = e.enseignant_id
      LEFT JOIN salles s ON s.id = e.salle_id
      -- Le remplacement est rattaché au COURS et à la DATE : le même cours du
      -- mardi suivant n'est pas concerné.
      LEFT JOIN remplacements rm
             ON rm.emploi_du_temps_id = e.id
            AND rm.date_cours = ${date}::date
      LEFT JOIN enseignants enr ON enr.id = rm.enseignant_remplacant_id
     WHERE e.annee_id = ${anneeId}::uuid
       AND e.jour_semaine = EXTRACT(ISODOW FROM ${date}::date)
       AND (${filtres.enseignantId ?? null}::uuid IS NULL
            OR e.enseignant_id = ${filtres.enseignantId ?? null}::uuid)
       AND (${filtres.classeId ?? null}::uuid IS NULL
            OR e.classe_id = ${filtres.classeId ?? null}::uuid)
     ORDER BY cr.ordre, c.libelle
  `);

  return r.rows.map((x) => ({
    emploiDuTempsId: x.id,
    creneauId: x.creneau_id,
    creneauLibelle: x.creneau,
    ordre: Number(x.ordre),
    nbCreneaux: Number(x.nb_creneaux),
    classeId: x.classe_id,
    classe: x.classe,
    matiere: x.matiere,
    enseignantId: x.enseignant_id,
    enseignant: x.enseignant,
    salle: x.salle,
    remplacementId: x.remplacement_id,
    remplacant: x.remplacant,
    motif: x.motif,
    dateRattrapage: x.date_rattrapage,
  }));
}

export interface EnseignantDisponible {
  id: string;
  nom: string;
  /** Enseigne-t-il la matière du cours à remplacer ? */
  memeMatiere: boolean;
  /** Créneaux déjà occupés ce jour-là — pour ne pas surcharger le même volontaire. */
  creneauxCeJour: number;
}

/**
 * Qui est libre sur ce créneau, ce jour-là.
 *
 * TROIS EXCLUSIONS, PAR ORDRE D'IMPORTANCE
 * -----------------------------------------
 * 1. Ceux qui ont cours sur la plage — sans quoi le remplacement laisse une
 *    AUTRE classe sans professeur : on a déplacé le problème, pas résolu.
 * 2. Ceux déjà désignés remplaçants ailleurs à la même heure ce jour-là.
 *    L'emploi du temps ne le dit pas, c'est une occupation ponctuelle.
 * 3. L'absent lui-même.
 *
 * Le tri met en tête ceux qui enseignent la matière, puis les moins chargés du
 * jour. Un remplacement dans la matière est un vrai cours ; hors matière, c'est
 * une surveillance — utile, mais différent, et l'écran ne doit pas les
 * confondre.
 */
export async function enseignantsDisponibles(
  anneeId: string,
  date: string,
  emploiDuTempsId: string,
): Promise<EnseignantDisponible[]> {
  const r = await db.execute<{
    id: string;
    nom: string;
    meme_matiere: boolean;
    creneaux: number;
  }>(sql`
    WITH cible AS (
      SELECT e.id, e.matiere_id, e.enseignant_id, e.jour_semaine,
             cr.ordre AS debut,
             cr.ordre + e.nb_creneaux - 1 AS fin
        FROM emploi_du_temps e
        JOIN creneaux_horaires cr ON cr.id = e.creneau_id
       WHERE e.id = ${emploiDuTempsId}::uuid
    )
    SELECT en.id,
           en.prenom || ' ' || en.nom AS nom,
           EXISTS (
             SELECT 1 FROM enseignant_matieres em
              WHERE em.enseignant_id = en.id
                AND em.matiere_id = (SELECT matiere_id FROM cible)
           ) AS meme_matiere,
           (SELECT COALESCE(SUM(x.nb_creneaux), 0)::int
              FROM emploi_du_temps x
             WHERE x.enseignant_id = en.id
               AND x.annee_id = ${anneeId}::uuid
               AND x.jour_semaine = (SELECT jour_semaine FROM cible)) AS creneaux
      FROM enseignants en
     WHERE en.actif
       AND en.id IS DISTINCT FROM (SELECT enseignant_id FROM cible)
       AND NOT EXISTS (
         SELECT 1
           FROM emploi_du_temps o
           JOIN creneaux_horaires oc ON oc.id = o.creneau_id
          WHERE o.enseignant_id = en.id
            AND o.annee_id = ${anneeId}::uuid
            AND o.jour_semaine = (SELECT jour_semaine FROM cible)
            AND oc.ordre <= (SELECT fin FROM cible)
            AND oc.ordre + o.nb_creneaux - 1 >= (SELECT debut FROM cible)
       )
       AND NOT EXISTS (
         SELECT 1
           FROM remplacements rr
           JOIN emploi_du_temps ro ON ro.id = rr.emploi_du_temps_id
           JOIN creneaux_horaires rc ON rc.id = ro.creneau_id
          WHERE rr.enseignant_remplacant_id = en.id
            AND rr.date_cours = ${date}::date
            AND rc.ordre <= (SELECT fin FROM cible)
            AND rc.ordre + ro.nb_creneaux - 1 >= (SELECT debut FROM cible)
       )
     ORDER BY meme_matiere DESC, creneaux, en.nom
  `);

  return r.rows.map((x) => ({
    id: x.id,
    nom: x.nom,
    memeMatiere: x.meme_matiere,
    creneauxCeJour: Number(x.creneaux),
  }));
}

export interface LigneRemplacement {
  id: string;
  dateCours: string;
  classe: string;
  matiere: string;
  creneau: string;
  absent: string;
  remplacant: string | null;
  motif: string;
  dateRattrapage: string | null;
}

/**
 * Historique des remplacements.
 *
 * Il sert au suivi de l'absentéisme enseignant : un professeur remplacé quinze
 * fois dans le trimestre est un problème de service, pas une suite de hasards.
 * On liste donc TOUT, y compris les cours ni remplacés ni rattrapés — ce sont
 * eux qui comptent le plus, et ils n'apparaîtraient nulle part si l'on ne
 * gardait que les remplacements effectifs.
 */
export async function listerRemplacements(
  anneeId: string,
  filtres: { depuis?: string; enseignantId?: string } = {},
): Promise<LigneRemplacement[]> {
  const r = await db.execute<{
    id: string;
    date_cours: string;
    classe: string;
    matiere: string;
    creneau: string;
    absent: string;
    remplacant: string | null;
    motif: string;
    date_rattrapage: string | null;
  }>(sql`
    SELECT rm.id,
           rm.date_cours::text AS date_cours,
           c.libelle  AS classe,
           m.libelle  AS matiere,
           cr.libelle AS creneau,
           ea.prenom || ' ' || ea.nom AS absent,
           er.prenom || ' ' || er.nom AS remplacant,
           rm.motif,
           rm.date_rattrapage::text AS date_rattrapage
      FROM remplacements rm
      JOIN enseignants ea ON ea.id = rm.enseignant_absent_id
      LEFT JOIN enseignants er ON er.id = rm.enseignant_remplacant_id
      LEFT JOIN emploi_du_temps e ON e.id = rm.emploi_du_temps_id
      LEFT JOIN classes  c ON c.id = e.classe_id
      LEFT JOIN matieres m ON m.id = e.matiere_id
      LEFT JOIN creneaux_horaires cr ON cr.id = e.creneau_id
     WHERE (e.annee_id IS NULL OR e.annee_id = ${anneeId}::uuid)
       AND (${filtres.depuis ?? null}::date IS NULL
            OR rm.date_cours >= ${filtres.depuis ?? null}::date)
       AND (${filtres.enseignantId ?? null}::uuid IS NULL
            OR rm.enseignant_absent_id = ${filtres.enseignantId ?? null}::uuid)
     ORDER BY rm.date_cours DESC, cr.ordre
     LIMIT 200
  `);

  return r.rows.map((x) => ({
    id: x.id,
    dateCours: x.date_cours,
    classe: x.classe ?? "—",
    matiere: x.matiere ?? "—",
    creneau: x.creneau ?? "—",
    absent: x.absent,
    remplacant: x.remplacant,
    motif: x.motif,
    dateRattrapage: x.date_rattrapage,
  }));
}
