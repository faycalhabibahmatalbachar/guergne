import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Lectures de l'application mobile des parents.
 *
 * Toutes les requêtes sont **cadrées par le tuteur** : le filtre sur
 * `eleve_tuteur` figure dans le SQL lui-même, pas dans une vérification en
 * amont qu'un appel futur pourrait oublier. Un identifiant d'élève trafiqué
 * ne ramène alors aucune ligne, au lieu de ramener les données d'un autre
 * enfant.
 *
 * Second principe : l'application affiche ce que l'école a **publié**. Une
 * note saisie mais non publiée, un bulletin non validé, une annonce
 * programmée pour demain ne doivent jamais apparaître — un parent qui
 * découvre une note avant le conseil de classe crée un incident bien réel.
 */

// ---------------------------------------------------------------------------
// Enfants
// ---------------------------------------------------------------------------

export interface EnfantMobile {
  eleveId: string;
  inscriptionId: string;
  matricule: string;
  nom: string;
  prenom: string;
  photoId: string | null;
  classeId: string;
  classe: string;
  niveau: string;
  anneeId: string;
  annee: string;
  lienParente: string;
  /** Moyenne générale de la période en cours, si le bulletin est publié. */
  moyenne: number | null;
  rang: number | null;
  effectif: number | null;
  /**
   * Moyenne de la classe sur la même période.
   *
   * Une note seule ne dit rien : « 11 » est un bon résultat dans une classe à
   * 9 et un mauvais dans une classe à 14. C'est la première question que pose
   * un parent au téléphone, et jusqu'ici l'application n'y répondait pas.
   */
  moyenneClasse: number | null;
  periodeId: string | null;
  periode: string | null;
  /** Heures d'absence non justifiées sur la période. */
  absencesNonJustifiees: number;
  retards: number;
  /** Reste dû, toutes échéances confondues, sur l'année en cours. */
  resteDuFcfa: number;
  /** Échéance impayée la plus proche. */
  prochaineEcheance: string | null;
  prochaineEcheanceLe: string | null;
  prochaineEcheanceFcfa: number | null;
}

export async function enfantsDuTuteur(tuteurId: string): Promise<EnfantMobile[]> {
  const lignes = await db.execute<EnfantMobile & Record<string, unknown>>(sql`
    WITH retenue AS (
      -- Période affichée par défaut : celle en cours ; à défaut — pendant les
      -- vacances — la dernière période close, sinon l'application resterait
      -- vide tout l'été.
      SELECT p.id, p.libelle, p.annee_id
        FROM periodes p
        JOIN annees_scolaires a ON a.id = p.annee_id AND a.est_courante
       ORDER BY (CURRENT_DATE BETWEEN p.date_debut AND p.date_fin) DESC,
                (p.date_fin < CURRENT_DATE) DESC,
                -- Parmi les periodes closes on veut la PLUS RECENTE ; parmi les
                -- periodes a venir -- avant la rentree -- la PREMIERE. D'ou le
                -- signe inverse selon le cas : trier par numero decroissant
                -- afficherait le 3e trimestre en plein mois d'aout.
                CASE WHEN p.date_fin < CURRENT_DATE THEN -p.numero ELSE p.numero END
       LIMIT 1
    )
    SELECT e.id                          AS "eleveId",
           i.id                          AS "inscriptionId",
           e.matricule,
           e.nom,
           e.prenom,
           e.photo_id::text              AS "photoId",
           c.id                          AS "classeId",
           c.libelle                     AS classe,
           n.libelle                     AS niveau,
           a.id                          AS "anneeId",
           a.libelle                     AS annee,
           et.lien::text                 AS "lienParente",
           b.moyenne_generale::float8    AS moyenne,
           b.rang                        AS rang,
           b.effectif_classe             AS effectif,
           b.moyenne_classe::float8      AS "moyenneClasse",
           r.id                          AS "periodeId",
           r.libelle                     AS periode,
           COALESCE(ab.nb, 0)::float8    AS "absencesNonJustifiees",
           COALESCE(rd.nb, 0)::int       AS retards,
           COALESCE(fin.reste, 0)::int   AS "resteDuFcfa",
           prochaine.libelle             AS "prochaineEcheance",
           prochaine.date_limite::text   AS "prochaineEcheanceLe",
           prochaine.montant::int        AS "prochaineEcheanceFcfa"
      FROM eleve_tuteur et
      JOIN eleves e        ON e.id = et.eleve_id
      JOIN inscriptions i  ON i.eleve_id = e.id AND i.active
      JOIN classes c       ON c.id = i.classe_id
      JOIN niveaux n       ON n.id = c.niveau_id
      JOIN annees_scolaires a ON a.id = i.annee_id AND a.est_courante
      LEFT JOIN retenue r  ON TRUE
      -- La moyenne provient du bulletin, et seulement s'il est publié : les
      -- moyennes calculées existent avant le conseil de classe.
      LEFT JOIN bulletins b
             ON b.inscription_id = i.id AND b.periode_id = r.id AND b.est_publie
      LEFT JOIN LATERAL (
        SELECT SUM(ab.nb_heures) AS nb
          FROM absences ab
         WHERE ab.inscription_id = i.id AND ab.periode_id = r.id
           AND ab.statut = 'NON_JUSTIFIEE'
      ) ab ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS nb FROM retards rt
         WHERE rt.inscription_id = i.id AND rt.periode_id = r.id
      ) rd ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(ec.montant_du_fcfa - ec.montant_paye_fcfa - ec.montant_exonere_fcfa) AS reste
          FROM echeances ec
         WHERE ec.inscription_id = i.id
           AND ec.statut IN ('A_PAYER', 'PARTIEL', 'EN_RETARD')
      ) fin ON TRUE
      LEFT JOIN LATERAL (
        SELECT ec.libelle, ec.date_limite,
               ec.montant_du_fcfa - ec.montant_paye_fcfa - ec.montant_exonere_fcfa AS montant
          FROM echeances ec
         WHERE ec.inscription_id = i.id
           AND ec.statut IN ('A_PAYER', 'PARTIEL', 'EN_RETARD')
         ORDER BY ec.date_limite
         LIMIT 1
      ) prochaine ON TRUE
     WHERE et.tuteur_id = ${tuteurId}
       AND e.statut NOT IN ('TRANSFERE', 'EXCLU', 'ARCHIVE', 'ABANDON')
     ORDER BY e.nom, e.prenom
  `);

  return lignes.rows as unknown as EnfantMobile[];
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export interface NoteMobile {
  id: string;
  titre: string;
  type: string;
  date: string;
  valeur: number | null;
  bareme: number;
  poids: number;
  statut: string;
}

export interface MatiereMobile {
  matiereId: string;
  code: string;
  matiere: string;
  couleur: string | null;
  coefficient: number;
  moyenne: number | null;
  moyenneClasse: number | null;
  noteMin: number | null;
  noteMax: number | null;
  rang: number | null;
  appreciation: string | null;
  enseignant: string | null;
  notes: NoteMobile[];
}

export interface ReleveMobile {
  periodeId: string;
  periode: string;
  publie: boolean;
  moyenne: number | null;
  rang: number | null;
  effectif: number | null;
  moyenneClasse: number | null;
  mention: string | null;
  appreciation: string | null;
  decision: string | null;
  noteConduite: number | null;
  heuresJustifiees: number;
  heuresNonJustifiees: number;
  nbRetards: number;
  matieres: MatiereMobile[];
}

/**
 * Relevé d'une période.
 *
 * Tant que le bulletin n'est pas publié, on renvoie `publie: false` et aucune
 * note : l'application affiche alors « Résultats en préparation » plutôt qu'un
 * relevé partiel que le conseil de classe pourrait encore modifier.
 */
export async function releveDeLEleve(
  tuteurId: string,
  eleveId: string,
  periodeId: string,
): Promise<ReleveMobile | null> {
  const entetes = await db.execute<{
    periode_id: string;
    periode: string;
    publie: boolean;
    moyenne: number | null;
    rang: number | null;
    effectif: number | null;
    moyenne_classe: number | null;
    mention: string | null;
    appreciation: string | null;
    decision: string | null;
    note_conduite: number | null;
    heures_justifiees: number;
    heures_non_justifiees: number;
    nb_retards: number;
    inscription_id: string;
  }>(sql`
    SELECT p.id AS periode_id, p.libelle AS periode,
           COALESCE(b.est_publie, FALSE) AS publie,
           b.moyenne_generale::float8 AS moyenne,
           b.rang,
           b.effectif_classe AS effectif,
           b.moyenne_classe::float8 AS moyenne_classe,
           NULLIF(b.mention::text, 'AUCUNE') AS mention,
           b.appreciation_generale AS appreciation,
           b.decision::text AS decision,
           b.note_conduite::float8 AS note_conduite,
           COALESCE(b.heures_absence_justifiees, 0)::float8 AS heures_justifiees,
           COALESCE(b.heures_absence_non_justifiees, 0)::float8 AS heures_non_justifiees,
           COALESCE(b.nb_retards, 0) AS nb_retards,
           i.id AS inscription_id
      FROM eleve_tuteur et
      JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
      JOIN periodes p ON p.id = ${periodeId}::uuid AND p.annee_id = i.annee_id
      LEFT JOIN bulletins b ON b.inscription_id = i.id AND b.periode_id = p.id
     WHERE et.tuteur_id = ${tuteurId} AND et.eleve_id = ${eleveId}::uuid
     LIMIT 1
  `);

  const entete = entetes.rows[0];
  if (!entete) return null;

  const base: ReleveMobile = {
    periodeId: entete.periode_id,
    periode: entete.periode,
    publie: entete.publie,
    moyenne: entete.moyenne,
    rang: entete.rang,
    effectif: entete.effectif,
    moyenneClasse: entete.moyenne_classe,
    mention: entete.mention,
    appreciation: entete.appreciation,
    decision: entete.decision,
    noteConduite: entete.note_conduite,
    heuresJustifiees: Number(entete.heures_justifiees ?? 0),
    heuresNonJustifiees: Number(entete.heures_non_justifiees ?? 0),
    nbRetards: Number(entete.nb_retards ?? 0),
    matieres: [],
  };

  // Bulletin non publié : on s'arrête là, sans le détail des matières.
  if (!entete.publie) {
    return { ...base, moyenne: null, rang: null, moyenneClasse: null, mention: null, appreciation: null, decision: null };
  }

  const matieres = await db.execute<MatiereMobile & Record<string, unknown>>(sql`
    SELECT m.id AS "matiereId", m.code, m.libelle AS matiere, m.couleur,
           mm.coefficient::float8 AS coefficient,
           mm.moyenne::float8 AS moyenne,
           mm.moyenne_classe::float8 AS "moyenneClasse",
           mm.note_min_classe::float8 AS "noteMin",
           mm.note_max_classe::float8 AS "noteMax",
           mm.rang_matiere AS rang,
           am.appreciation,
           ens.prenom || ' ' || ens.nom AS enseignant,
           COALESCE((
             SELECT json_agg(json_build_object(
                      'id', n.id, 'titre', ev.titre, 'type', ev.type::text,
                      'date', ev.date_evaluation::text, 'valeur', n.valeur::float8,
                      'bareme', ev.bareme::float8, 'poids', ev.poids::float8,
                      'statut', n.statut::text)
                    ORDER BY ev.date_evaluation)
               FROM notes n
               JOIN evaluations ev ON ev.id = n.evaluation_id
              WHERE n.inscription_id = mm.inscription_id
                AND ev.matiere_id = m.id AND ev.periode_id = mm.periode_id
                AND ev.statut = 'PUBLIEE'
           ), '[]'::json) AS notes
      FROM moyennes_matiere mm
      JOIN matieres m ON m.id = mm.matiere_id
      LEFT JOIN appreciations_matiere am
             ON am.inscription_id = mm.inscription_id
            AND am.periode_id = mm.periode_id AND am.matiere_id = mm.matiere_id
      LEFT JOIN enseignants ens ON ens.id = am.enseignant_id
     WHERE mm.inscription_id = ${entete.inscription_id}::uuid
       AND mm.periode_id = ${periodeId}::uuid
     ORDER BY m.ordre_bulletin, m.libelle
  `);

  base.matieres = matieres.rows as unknown as MatiereMobile[];
  return base;
}

export interface PeriodeMobile {
  id: string;
  libelle: string;
  ordre: number;
  debut: string;
  fin: string;
  publie: boolean;
  courante: boolean;
}

/** Périodes de l'année en cours, avec l'état de publication du bulletin. */
export async function periodesDeLEleve(tuteurId: string, eleveId: string): Promise<PeriodeMobile[]> {
  const lignes = await db.execute<PeriodeMobile & Record<string, unknown>>(sql`
    SELECT p.id::text, p.libelle, p.numero AS ordre, p.date_debut::text AS debut, p.date_fin::text AS fin,
           COALESCE(b.est_publie, FALSE) AS publie,
           (CURRENT_DATE BETWEEN p.date_debut AND p.date_fin) AS courante
      FROM eleve_tuteur et
      JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
      JOIN periodes p ON p.annee_id = i.annee_id
      LEFT JOIN bulletins b ON b.inscription_id = i.id AND b.periode_id = p.id
     WHERE et.tuteur_id = ${tuteurId} AND et.eleve_id = ${eleveId}::uuid
     ORDER BY p.numero
  `);
  return lignes.rows as unknown as PeriodeMobile[];
}

/**
 * Periode a afficher par defaut.
 *
 * Meme regle que le SQL de `enfantsDuTuteur`, exprimee ici pour les routes qui
 * disposent deja de la liste : celle en cours ; sinon la derniere close ;
 * sinon -- avant la rentree -- la premiere de l'annee.
 */
export function choisirPeriode(
  periodes: readonly PeriodeMobile[],
  demandee?: string | null,
): PeriodeMobile | null {
  if (periodes.length === 0) return null;

  const explicite = demandee ? periodes.find((p) => p.id === demandee) : undefined;
  if (explicite) return explicite;

  const enCours = periodes.find((p) => p.courante);
  if (enCours) return enCours;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const closes = periodes.filter((p) => p.fin < aujourdhui);
  if (closes.length > 0) return closes[closes.length - 1];

  return periodes[0];
}

// ---------------------------------------------------------------------------
// Assiduité et discipline
// ---------------------------------------------------------------------------

export interface EvenementAssiduite {
  id: string;
  genre: "ABSENCE" | "RETARD" | "SANCTION" | "INCIDENT";
  date: string;
  libelle: string;
  detail: string | null;
  statut: string | null;
  nbHeures: number | null;
  matiere: string | null;
}

/**
 * Journal d'assiduité et de discipline, tous genres confondus.
 *
 * Les quatre sources sont fusionnées et triées par date : c'est ainsi qu'un
 * parent lit l'information — « qu'est-ce qui s'est passé cette semaine » —
 * et non table par table.
 */
export async function assiduiteDeLEleve(
  tuteurId: string,
  eleveId: string,
  periodeId: string | null,
): Promise<EvenementAssiduite[]> {
  const lignes = await db.execute<EvenementAssiduite & Record<string, unknown>>(sql`
    WITH perimetre AS (
      SELECT i.id
        FROM eleve_tuteur et
        JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
       WHERE et.tuteur_id = ${tuteurId} AND et.eleve_id = ${eleveId}::uuid
    ), journal AS (
      SELECT ab.id::text AS id, 'ABSENCE' AS genre, ab.date_absence::text AS date,
             CASE ab.type WHEN 'JOURNEE' THEN 'Absence — journée entière'
                          WHEN 'DEMI_JOURNEE' THEN 'Absence — demi-journée'
                          ELSE 'Absence en cours' END AS libelle,
             ab.motif AS detail, ab.statut::text AS statut,
             ab.nb_heures::float8 AS "nbHeures", m.libelle AS matiere
        FROM absences ab
        JOIN perimetre pe ON pe.id = ab.inscription_id
        LEFT JOIN matieres m ON m.id = ab.matiere_id
       WHERE (${periodeId}::uuid IS NULL OR ab.periode_id = ${periodeId}::uuid)

      UNION ALL
      SELECT rt.id::text, 'RETARD', rt.date_retard::text,
             'Retard' || COALESCE(' de ' || rt.duree_minutes || ' min', ''),
             rt.motif, rt.statut::text, NULL, m.libelle
        FROM retards rt
        JOIN perimetre pe ON pe.id = rt.inscription_id
        LEFT JOIN matieres m ON m.id = rt.matiere_id
       WHERE (${periodeId}::uuid IS NULL OR rt.periode_id = ${periodeId}::uuid)

      UNION ALL
      SELECT sa.id::text, 'SANCTION', sa.date_debut::text,
             replace(sa.type::text, '_', ' '), sa.motif,
             CASE WHEN sa.executee THEN 'EXECUTEE' ELSE 'EN_COURS' END, NULL, NULL
        FROM sanctions sa
        JOIN perimetre pe ON pe.id = sa.inscription_id
       WHERE (${periodeId}::uuid IS NULL OR sa.periode_id = ${periodeId}::uuid)

      UNION ALL
      -- Seuls les incidents dont l'école a informé la famille remontent ici :
      -- un signalement encore en cours d'instruction n'a rien à faire sur le
      -- téléphone du parent.
      SELECT inc.id::text, 'INCIDENT', inc.date_incident::text,
             'Incident — ' || lower(inc.gravite::text), inc.description,
             inc.gravite::text, NULL, NULL
        FROM incidents inc
        JOIN perimetre pe ON pe.id = inc.inscription_id
       WHERE inc.parents_notifies
         AND (${periodeId}::uuid IS NULL OR inc.periode_id = ${periodeId}::uuid)
    )
    SELECT * FROM journal ORDER BY date DESC LIMIT 200
  `);

  return lignes.rows as unknown as EvenementAssiduite[];
}

// ---------------------------------------------------------------------------
// Finances
// ---------------------------------------------------------------------------

export interface EcheanceMobile {
  id: string;
  libelle: string;
  nature: string;
  dateLimite: string;
  montantDuFcfa: number;
  montantPayeFcfa: number;
  montantExonereFcfa: number;
  statut: string;
}

export interface PaiementMobile {
  id: string;
  numeroRecu: string;
  montantFcfa: number;
  mode: string;
  datePaiement: string;
  libelle: string | null;
}

export interface SituationFinanciere {
  totalDuFcfa: number;
  totalPayeFcfa: number;
  totalExonereFcfa: number;
  resteDuFcfa: number;
  echeances: EcheanceMobile[];
  paiements: PaiementMobile[];
}

export async function financesDeLEleve(tuteurId: string, eleveId: string): Promise<SituationFinanciere> {
  const [echeances, paiements] = await Promise.all([
    db.execute<EcheanceMobile & Record<string, unknown>>(sql`
      SELECT ec.id::text, ec.libelle, ec.nature::text AS nature,
             ec.date_limite::text AS "dateLimite",
             ec.montant_du_fcfa AS "montantDuFcfa",
             ec.montant_paye_fcfa AS "montantPayeFcfa",
             ec.montant_exonere_fcfa AS "montantExonereFcfa",
             ec.statut::text AS statut
        FROM echeances ec
        JOIN inscriptions i ON i.id = ec.inscription_id AND i.active
        JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id
       WHERE et.tuteur_id = ${tuteurId} AND et.eleve_id = ${eleveId}::uuid
       ORDER BY ec.date_limite
    `),
    db.execute<PaiementMobile & Record<string, unknown>>(sql`
      SELECT p.id::text, p.numero_recu AS "numeroRecu", p.montant_fcfa AS "montantFcfa",
             p.mode::text AS mode, p.date_paiement::text AS "datePaiement",
             ec.libelle
        FROM paiements p
        JOIN inscriptions i ON i.id = p.inscription_id AND i.active
        JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id
        LEFT JOIN echeances ec ON ec.id = p.echeance_id
       WHERE et.tuteur_id = ${tuteurId} AND et.eleve_id = ${eleveId}::uuid
         AND NOT p.annule
       ORDER BY p.date_paiement DESC, p.cree_le DESC
       LIMIT 100
    `),
  ]);

  const lignes = echeances.rows as unknown as EcheanceMobile[];
  const somme = (choisir: (l: EcheanceMobile) => number) =>
    lignes.reduce((total, l) => total + Number(choisir(l) ?? 0), 0);

  const totalDu = somme((l) => l.montantDuFcfa);
  const totalPaye = somme((l) => l.montantPayeFcfa);
  const totalExonere = somme((l) => l.montantExonereFcfa);

  return {
    totalDuFcfa: totalDu,
    totalPayeFcfa: totalPaye,
    totalExonereFcfa: totalExonere,
    resteDuFcfa: totalDu - totalPaye - totalExonere,
    echeances: lignes,
    paiements: paiements.rows as unknown as PaiementMobile[],
  };
}

// ---------------------------------------------------------------------------
// Annonces
// ---------------------------------------------------------------------------

export interface AnnonceMobile {
  id: string;
  titre: string;
  contenu: string;
  epinglee: boolean;
  publierLe: string;
  classe: string | null;
  lue: boolean;
}

/**
 * Annonces visibles par ce parent.
 *
 * Le ciblage est appliqué en SQL : annonces destinées à tous, au niveau de
 * l'un de ses enfants, ou à leur classe. Une annonce adressée aux enseignants
 * ou à une autre classe n'est jamais téléchargée, pas simplement masquée à
 * l'affichage.
 */
export async function annoncesDuTuteur(tuteurId: string, utilisateurId: string): Promise<AnnonceMobile[]> {
  const lignes = await db.execute<AnnonceMobile & Record<string, unknown>>(sql`
    WITH mes_classes AS (
      SELECT DISTINCT c.id AS classe_id, c.niveau_id
        FROM eleve_tuteur et
        JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
        JOIN classes c ON c.id = i.classe_id
       WHERE et.tuteur_id = ${tuteurId}
    )
    SELECT a.id::text, a.titre, a.contenu, a.epinglee,
           a.publier_le::text AS "publierLe",
           c.libelle AS classe,
           EXISTS (SELECT 1 FROM lectures_annonces la
                    WHERE la.annonce_id = a.id AND la.utilisateur_id = ${utilisateurId}::uuid) AS lue
      FROM annonces a
      JOIN annees_scolaires an ON an.id = a.annee_id AND an.est_courante
      LEFT JOIN classes c ON c.id = a.classe_id
     WHERE a.publiee
       AND a.publier_le <= now()
       AND (a.expire_le IS NULL OR a.expire_le > now())
       AND (
         a.cible = 'TOUS'
         OR (a.cible = 'NIVEAU' AND a.niveau_id IN (SELECT niveau_id FROM mes_classes))
         OR (a.cible = 'CLASSE' AND a.classe_id IN (SELECT classe_id FROM mes_classes))
       )
     ORDER BY a.epinglee DESC, a.publier_le DESC
     LIMIT 60
  `);

  return lignes.rows as unknown as AnnonceMobile[];
}

/** Marque une annonce comme lue. Idempotent : un double appui ne fait rien. */
export async function marquerAnnonceLue(utilisateurId: string, annonceId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO lectures_annonces (annonce_id, utilisateur_id)
    SELECT ${annonceId}::uuid, ${utilisateurId}::uuid
     WHERE NOT EXISTS (
       SELECT 1 FROM lectures_annonces
        WHERE annonce_id = ${annonceId}::uuid AND utilisateur_id = ${utilisateurId}::uuid
     )
  `);
}

// ---------------------------------------------------------------------------
// Emploi du temps
// ---------------------------------------------------------------------------

export interface CoursMobile {
  jour: number;
  debut: string;
  fin: string;
  matiere: string;
  code: string;
  couleur: string | null;
  enseignant: string | null;
  salle: string | null;
}

export async function emploiDuTempsDeLEleve(tuteurId: string, eleveId: string): Promise<CoursMobile[]> {
  const lignes = await db.execute<CoursMobile & Record<string, unknown>>(sql`
    SELECT edt.jour_semaine AS jour,
           ch.heure_debut::text AS debut, ch.heure_fin::text AS fin,
           m.libelle AS matiere, m.code, m.couleur,
           ens.prenom || ' ' || ens.nom AS enseignant,
           s.code AS salle
      FROM eleve_tuteur et
      JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
      JOIN emploi_du_temps edt ON edt.classe_id = i.classe_id AND edt.annee_id = i.annee_id
      JOIN creneaux_horaires ch ON ch.id = edt.creneau_id
      JOIN matieres m ON m.id = edt.matiere_id
      LEFT JOIN enseignants ens ON ens.id = edt.enseignant_id
      LEFT JOIN salles s ON s.id = edt.salle_id
     WHERE et.tuteur_id = ${tuteurId} AND et.eleve_id = ${eleveId}::uuid
     ORDER BY edt.jour_semaine, ch.heure_debut
  `);
  return lignes.rows as unknown as CoursMobile[];
}
