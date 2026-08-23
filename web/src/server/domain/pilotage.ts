import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Indicateurs de pilotage du tableau de bord.
 *
 * Tout est calculé en UNE requête par bloc, jamais en boucle : sur 548 élèves,
 * une requête par élève ferait des centaines d'allers-retours vers Francfort.
 */

export interface IndicateursCles {
  effectif: number;
  nouveauxInscrits: number;
  reinscriptions: number;
  enseignants: number;
  classes: number;
  presentsAujourdhui: number;
  absentsAujourdhui: number;
  retardsAujourdhui: number;
  suspendus: number;
  exclus: number;
  transferes: number;
  moyenneGenerale: number | null;
  tauxReussite: number | null;
  tauxAbsenteisme: number | null;
}

export async function indicateursCles(
  anneeId: string,
  periodeId: string | null,
): Promise<IndicateursCles> {
  const r = await db.execute<Record<string, unknown>>(sql`
    WITH inscrits AS (
      SELECT i.id, i.type, i.eleve_id
        FROM inscriptions i
       WHERE i.annee_id = ${anneeId}::uuid AND i.active
    )
    SELECT
      (SELECT count(*) FROM inscrits)                                          AS effectif,
      (SELECT count(*) FROM inscrits WHERE type = 'INSCRIPTION')               AS nouveaux,
      (SELECT count(*) FROM inscrits WHERE type = 'REINSCRIPTION')             AS reinscriptions,
      (SELECT count(*) FROM enseignants WHERE actif)                           AS enseignants,
      (SELECT count(*) FROM classes WHERE annee_id = ${anneeId}::uuid AND active) AS classes,

      (SELECT count(DISTINCT a.inscription_id) FROM absences a
        WHERE a.date_absence = CURRENT_DATE)                                   AS absents_jour,
      (SELECT count(*) FROM retards r WHERE r.date_retard = CURRENT_DATE)      AS retards_jour,

      (SELECT count(*) FROM eleves e
        JOIN inscrits x ON x.eleve_id = e.id
       WHERE e.statut IN ('SUSPENDU_DISCIPLINE', 'SUSPENDU_IMPAYE'))           AS suspendus,
      (SELECT count(*) FROM eleves WHERE statut = 'EXCLU')                     AS exclus,
      (SELECT count(*) FROM eleves WHERE statut = 'TRANSFERE')                 AS transferes,

      (SELECT ROUND(AVG(mg.moyenne)::numeric, 2) FROM moyennes_generales mg
        WHERE ${periodeId ?? null}::uuid IS NULL OR mg.periode_id = ${periodeId ?? null}::uuid)
                                                                               AS moyenne_generale,
      (SELECT ROUND(
                100.0 * count(*) FILTER (WHERE mg.moyenne >= 10) /
                NULLIF(count(*), 0), 1)
         FROM moyennes_generales mg
        WHERE ${periodeId ?? null}::uuid IS NULL OR mg.periode_id = ${periodeId ?? null}::uuid)
                                                                               AS taux_reussite,

      -- Absentéisme : heures manquées rapportées au volume théorique.
      -- On retient 30 h par semaine sur les semaines écoulées depuis la
      -- rentrée, faute d'un relevé de présence exhaustif.
      (SELECT ROUND(
                100.0 * COALESCE(SUM(a.nb_heures), 0) /
                NULLIF(
                  (SELECT count(*) FROM inscrits) *
                  -- EXTRACT(WEEK FROM interval) n'existe pas : age() rend un
                  -- intervalle, et l'unité « week » n'y est pas supportée. On
                  -- calcule donc les semaines par différence de dates.
                  GREATEST(1, (CURRENT_DATE -
                    (SELECT date_debut FROM annees_scolaires WHERE id = ${anneeId}::uuid)) / 7) * 30,
                  0), 2)
         FROM absences a
         JOIN inscrits x ON x.id = a.inscription_id
        WHERE a.statut <> 'JUSTIFIEE')                                         AS taux_absenteisme
  `);

  const l = r.rows[0] ?? {};
  const effectif = Number(l.effectif ?? 0);
  const absents = Number(l.absents_jour ?? 0);

  return {
    effectif,
    nouveauxInscrits: Number(l.nouveaux ?? 0),
    reinscriptions: Number(l.reinscriptions ?? 0),
    enseignants: Number(l.enseignants ?? 0),
    classes: Number(l.classes ?? 0),
    presentsAujourdhui: Math.max(0, effectif - absents),
    absentsAujourdhui: absents,
    retardsAujourdhui: Number(l.retards_jour ?? 0),
    suspendus: Number(l.suspendus ?? 0),
    exclus: Number(l.exclus ?? 0),
    transferes: Number(l.transferes ?? 0),
    moyenneGenerale: l.moyenne_generale == null ? null : Number(l.moyenne_generale),
    tauxReussite: l.taux_reussite == null ? null : Number(l.taux_reussite),
    tauxAbsenteisme: l.taux_absenteisme == null ? null : Number(l.taux_absenteisme),
  };
}

// ---------------------------------------------------------------------------
// Séries pour les graphiques
// ---------------------------------------------------------------------------

export interface PointNiveau {
  niveau: string;
  cycle: string;
  garcons: number;
  filles: number;
  total: number;
}

export async function effectifsParNiveau(anneeId: string): Promise<PointNiveau[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT n.libelle AS niveau, n.cycle::text AS cycle, n.ordre,
           count(*) FILTER (WHERE e.sexe = 'M')::int AS garcons,
           count(*) FILTER (WHERE e.sexe = 'F')::int AS filles,
           count(*)::int AS total
      FROM inscriptions i
      JOIN eleves e  ON e.id = i.eleve_id
      JOIN classes c ON c.id = i.classe_id
      JOIN niveaux n ON n.id = c.niveau_id
     WHERE i.annee_id = ${anneeId}::uuid AND i.active
     GROUP BY n.id
     ORDER BY n.ordre
  `);

  return r.rows.map((l) => ({
    niveau: String(l.niveau),
    cycle: String(l.cycle),
    garcons: Number(l.garcons),
    filles: Number(l.filles),
    total: Number(l.total),
  }));
}

export interface PointMois {
  mois: string;
  libelle: string;
  justifiees: number;
  nonJustifiees: number;
}

export async function absencesParMois(anneeId: string): Promise<PointMois[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT to_char(a.date_absence, 'YYYY-MM') AS mois,
           to_char(a.date_absence, 'TMMon')   AS libelle,
           COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut = 'JUSTIFIEE'), 0)  AS justifiees,
           COALESCE(SUM(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'), 0) AS non_justifiees
      FROM absences a
      JOIN inscriptions i ON i.id = a.inscription_id
     WHERE i.annee_id = ${anneeId}::uuid
     GROUP BY 1, 2
     ORDER BY 1
  `);

  return r.rows.map((l) => ({
    mois: String(l.mois),
    libelle: String(l.libelle),
    justifiees: Number(l.justifiees),
    nonJustifiees: Number(l.non_justifiees),
  }));
}

export interface PointClasse {
  classeId: string;
  classe: string;
  effectif: number;
  moyenne: number | null;
  tauxReussite: number | null;
}

export async function moyennesParClasse(
  anneeId: string,
  periodeId: string | null,
): Promise<PointClasse[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT c.id AS classe_id, c.libelle AS classe, n.ordre,
           count(DISTINCT i.id)::int AS effectif,
           ROUND(AVG(mg.moyenne)::numeric, 2) AS moyenne,
           ROUND(100.0 * count(*) FILTER (WHERE mg.moyenne >= 10) /
                 NULLIF(count(mg.moyenne), 0), 1) AS taux_reussite
      FROM classes c
      JOIN niveaux n ON n.id = c.niveau_id
      LEFT JOIN inscriptions i ON i.classe_id = c.id AND i.active
      LEFT JOIN moyennes_generales mg ON mg.inscription_id = i.id
        AND (${periodeId ?? null}::uuid IS NULL OR mg.periode_id = ${periodeId ?? null}::uuid)
     WHERE c.annee_id = ${anneeId}::uuid AND c.active
     GROUP BY c.id, n.ordre
     ORDER BY n.ordre, c.libelle
  `);

  return r.rows.map((l) => ({
    classeId: String(l.classe_id),
    classe: String(l.classe),
    effectif: Number(l.effectif),
    moyenne: l.moyenne == null ? null : Number(l.moyenne),
    tauxReussite: l.taux_reussite == null ? null : Number(l.taux_reussite),
  }));
}

// ---------------------------------------------------------------------------
// Classement des classes
// ---------------------------------------------------------------------------

export interface RangClasse {
  rang: number;
  classe: string;
  niveau: string;
  effectif: number;
  notes: number;
  moyenne: number | null;
  tauxReussite: number | null;
  meilleure: number | null;
  plusFaible: number | null;
  /** Écart à la moyenne de l'établissement, en points. */
  ecart: number | null;
}

/**
 * Classement des classes par moyenne.
 *
 * CE QU'IL SERT À VOIR
 * --------------------
 * `moyennesParClasse` ordonne par niveau — c'est ce qu'il faut pour un
 * graphique, où l'on compare des sixièmes entre elles. Ce classement-ci fait
 * l'inverse : il met toutes les classes sur une même échelle, du meilleur au
 * moins bon, ce qui n'a de sens qu'en conseil de direction.
 *
 * L'ÉCART EST PLUS PARLANT QUE LE RANG
 * -------------------------------------
 * Une classe première avec 11,2 dans un établissement à 11,0 n'a rien
 * d'exceptionnel ; une dernière à 8,1 quand la moyenne est à 11,0 appelle une
 * décision. Le rang seul masque cela — d'où l'écart, affiché à côté.
 *
 * Les classes SANS NOTE gardent leur ligne, avec un rang vide : les faire
 * disparaître laisserait croire qu'elles n'existent pas, alors qu'elles
 * signalent simplement une saisie en retard.
 */
export async function classementClasses(
  anneeId: string,
  periodeId: string | null,
): Promise<RangClasse[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    WITH par_classe AS (
      SELECT c.libelle AS classe, n.libelle AS niveau, n.ordre,
             count(DISTINCT i.id)::int                       AS effectif,
             -- Les ELEVES ayant une moyenne, pas les lignes de moyenne : sans
             -- periode choisie, moyennes_generales en porte une par trimestre,
             -- et l'on afficherait 111 notes pour 37 inscrits.
             -- (Pas d'accent grave ici : le SQL vit dans un litteral de gabarit
             --  JavaScript, qu'un accent grave refermerait.)
             count(DISTINCT i.id) FILTER (WHERE mg.moyenne IS NOT NULL)::int AS notes,
             ROUND(AVG(mg.moyenne)::numeric, 2)              AS moyenne,
             ROUND(100.0 * count(*) FILTER (WHERE mg.moyenne >= 10) /
                   NULLIF(count(mg.moyenne), 0), 1)          AS taux_reussite,
             ROUND(MAX(mg.moyenne)::numeric, 2)              AS meilleure,
             ROUND(MIN(mg.moyenne)::numeric, 2)              AS plus_faible
        FROM classes c
        JOIN niveaux n ON n.id = c.niveau_id
        LEFT JOIN inscriptions i ON i.classe_id = c.id AND i.active
        LEFT JOIN moyennes_generales mg ON mg.inscription_id = i.id
          AND (${periodeId ?? null}::uuid IS NULL OR mg.periode_id = ${periodeId ?? null}::uuid)
       WHERE c.annee_id = ${anneeId}::uuid AND c.active
       GROUP BY c.id, c.libelle, n.libelle, n.ordre
    )
    SELECT *,
           -- Le rang saute les classes sans moyenne : les classer à zéro les
           -- placerait bonnes dernières, ce qui serait un jugement et non un
           -- constat.
           CASE WHEN moyenne IS NULL THEN NULL
                ELSE RANK() OVER (ORDER BY moyenne DESC NULLS LAST)
           END AS rang,
           ROUND((moyenne - AVG(moyenne) OVER ())::numeric, 2) AS ecart
      FROM par_classe
     ORDER BY moyenne DESC NULLS LAST, ordre, classe
  `);

  return r.rows.map((l) => ({
    rang: l.rang == null ? 0 : Number(l.rang),
    classe: String(l.classe),
    niveau: String(l.niveau),
    effectif: Number(l.effectif),
    notes: Number(l.notes),
    moyenne: l.moyenne == null ? null : Number(l.moyenne),
    tauxReussite: l.taux_reussite == null ? null : Number(l.taux_reussite),
    meilleure: l.meilleure == null ? null : Number(l.meilleure),
    plusFaible: l.plus_faible == null ? null : Number(l.plus_faible),
    ecart: l.ecart == null ? null : Number(l.ecart),
  }));
}

export interface PointMatiere {
  matiere: string;
  couleur: string | null;
  moyenne: number | null;
  nbNotes: number;
}

export async function resultatsParMatiere(periodeId: string | null): Promise<PointMatiere[]> {
  if (!periodeId) return [];

  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT m.libelle AS matiere, m.couleur, m.ordre_bulletin,
           ROUND(AVG(mm.moyenne)::numeric, 2) AS moyenne,
           count(mm.moyenne)::int AS nb_notes
      FROM moyennes_matiere mm
      JOIN matieres m ON m.id = mm.matiere_id
     WHERE mm.periode_id = ${periodeId}::uuid
     GROUP BY m.id
     ORDER BY m.ordre_bulletin
  `);

  return r.rows.map((l) => ({
    matiere: String(l.matiere),
    couleur: l.couleur == null ? null : String(l.couleur),
    moyenne: l.moyenne == null ? null : Number(l.moyenne),
    nbNotes: Number(l.nb_notes),
  }));
}

export interface PointRecouvrement {
  mois: string;
  libelle: string;
  encaisse: number;
  cumul: number;
}

export async function evolutionRecouvrement(anneeId: string): Promise<PointRecouvrement[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT to_char(p.date_paiement, 'YYYY-MM') AS mois,
           to_char(p.date_paiement, 'TMMon')   AS libelle,
           SUM(p.montant_fcfa)::bigint AS encaisse,
           SUM(SUM(p.montant_fcfa)) OVER (ORDER BY to_char(p.date_paiement, 'YYYY-MM'))::bigint AS cumul
      FROM paiements p
      JOIN inscriptions i ON i.id = p.inscription_id
     WHERE i.annee_id = ${anneeId}::uuid
     GROUP BY 1, 2
     ORDER BY 1
  `);

  return r.rows.map((l) => ({
    mois: String(l.mois),
    libelle: String(l.libelle),
    encaisse: Number(l.encaisse),
    cumul: Number(l.cumul),
  }));
}

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------

export interface Alerte {
  categorie: string;
  libelle: string;
  nombre: number;
  gravite: "info" | "alerte" | "danger";
  url: string;
}

/**
 * Alertes du tableau de bord.
 *
 * Chacune répond à « qu'est-ce qui demande une action aujourd'hui ». Une
 * alerte à zéro n'est pas affichée : une liste de zéros noie les vraies.
 */
export async function alertes(anneeId: string, periodeId: string | null): Promise<Alerte[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT count(*) FROM v_alertes_assiduite
        WHERE ${periodeId ?? null}::uuid IS NULL OR periode_id = ${periodeId ?? null}::uuid)
                                                                        AS absences_repetees,
      (SELECT count(*) FROM moyennes_generales mg
        WHERE mg.moyenne < 8
          AND (${periodeId ?? null}::uuid IS NULL OR mg.periode_id = ${periodeId ?? null}::uuid))
                                                                        AS en_difficulte,
      (SELECT count(*) FROM v_avancement_saisie
        WHERE statut IN ('PASSEE', 'CORRIGEE') AND nb_saisies < effectif
          AND (${periodeId ?? null}::uuid IS NULL OR periode_id = ${periodeId ?? null}::uuid))
                                                                        AS notes_manquantes,
      (SELECT count(*) FROM evaluations e
        WHERE e.statut = 'CORRIGEE'
          AND (${periodeId ?? null}::uuid IS NULL OR e.periode_id = ${periodeId ?? null}::uuid))
                                                                        AS notes_non_publiees,
      (SELECT count(*) FROM echeances e
        JOIN inscriptions i ON i.id = e.inscription_id
       WHERE i.annee_id = ${anneeId}::uuid AND i.active AND e.statut = 'EN_RETARD')
                                                                        AS impayes,
      (SELECT count(*) FROM inscriptions i
        WHERE i.annee_id = ${anneeId}::uuid AND i.active
          AND i.statut_dossier IN ('A_VALIDER', 'INCOMPLET'))           AS dossiers_incomplets,
      (SELECT count(*) FROM devoirs d
        JOIN classes c ON c.id = d.classe_id
       WHERE c.annee_id = ${anneeId}::uuid
         AND d.date_remise BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)   AS devoirs_a_venir,
      (SELECT count(*) FROM notifications WHERE statut = 'EN_ATTENTE')  AS notifications_en_file
  `);

  const l = r.rows[0] ?? {};

  const toutes: Alerte[] = [
    {
      categorie: "Assiduité",
      libelle: "élève(s) au-delà du seuil d'absences",
      nombre: Number(l.absences_repetees ?? 0),
      gravite: "danger",
      url: "/dashboard/assiduite",
    },
    {
      categorie: "Résultats",
      libelle: "élève(s) sous 8 de moyenne",
      nombre: Number(l.en_difficulte ?? 0),
      gravite: "alerte",
      url: "/dashboard/notes",
    },
    {
      categorie: "Notes",
      libelle: "évaluation(s) à la saisie incomplète",
      nombre: Number(l.notes_manquantes ?? 0),
      gravite: "alerte",
      url: "/dashboard/notes",
    },
    {
      categorie: "Notes",
      libelle: "évaluation(s) corrigée(s) non publiée(s)",
      nombre: Number(l.notes_non_publiees ?? 0),
      gravite: "info",
      url: "/dashboard/notes",
    },
    {
      categorie: "Finances",
      libelle: "échéance(s) en retard",
      nombre: Number(l.impayes ?? 0),
      gravite: "danger",
      url: "/dashboard/finances",
    },
    {
      categorie: "Scolarité",
      libelle: "dossier(s) d'inscription incomplet(s)",
      nombre: Number(l.dossiers_incomplets ?? 0),
      gravite: "alerte",
      url: "/dashboard/eleves",
    },
    {
      categorie: "Travail",
      libelle: "devoir(s) à rendre sous 7 jours",
      nombre: Number(l.devoirs_a_venir ?? 0),
      gravite: "info",
      url: "/dashboard/notes",
    },
    {
      categorie: "Communication",
      libelle: "notification(s) en attente d'envoi",
      nombre: Number(l.notifications_en_file ?? 0),
      gravite: "info",
      url: "/dashboard/communication",
    },
  ];

  // Une alerte à zéro n'est pas une alerte.
  return toutes.filter((a) => a.nombre > 0);
}
