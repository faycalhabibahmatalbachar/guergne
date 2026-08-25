import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./../db";

/**
 * Conseils de discipline (E-54) et statistiques (E-55).
 *
 * `conseils_discipline` EST LA CINQUIÈME TABLE DÉCLARÉE ET JAMAIS BRANCHÉE
 * -------------------------------------------------------------------------
 * Après notes_conduite, appreciations_matiere, remplacements et exonerations.
 *
 * CE QUI MANQUAIT N'ÉTAIT PAS L'ENREGISTREMENT, C'ÉTAIT LE DOSSIER
 * -----------------------------------------------------------------
 * Un conseil de discipline se tient sur un élève, pas sur un incident. Convoqué
 * sur le dernier fait, il sanctionne une bagarre isolée aussi lourdement qu'une
 * cinquième récidive — ou l'inverse. Le dossier complet de l'année doit être
 * sous les yeux au moment de délibérer, sans quoi la décision se prend sur ce
 * dont le proviseur se souvient.
 */

export interface LigneConseil {
  id: string;
  inscriptionId: string;
  eleveId: string;
  eleve: string;
  matricule: string;
  classe: string;
  dateConvocation: string;
  dateSeance: string;
  motif: string;
  participants: string | null;
  tuteurConvoque: boolean;
  tuteurPresent: boolean | null;
  deliberation: string | null;
  decision: string | null;
  sanctionId: string | null;
  sanctionType: string | null;
  /** Vrai tant que la séance n'a pas donné lieu à une décision écrite. */
  enAttente: boolean;
}

export async function listerConseils(
  anneeId: string,
  filtres: { classeId?: string; enAttente?: boolean } = {},
): Promise<LigneConseil[]> {
  const r = await db.execute<{
    id: string;
    inscription_id: string;
    eleve_id: string;
    eleve: string;
    matricule: string;
    classe: string;
    date_convocation: string;
    date_seance: string;
    motif: string;
    participants: string | null;
    tuteur_convoque: boolean;
    tuteur_present: boolean | null;
    deliberation: string | null;
    decision: string | null;
    sanction_id: string | null;
    sanction_type: string | null;
  }>(sql`
    SELECT cd.id,
           cd.inscription_id,
           e.id AS eleve_id,
           e.nom || ' ' || e.prenom AS eleve,
           e.matricule,
           c.libelle AS classe,
           cd.date_convocation::text AS date_convocation,
           cd.date_seance::text AS date_seance,
           cd.motif,
           cd.participants,
           cd.tuteur_convoque,
           cd.tuteur_present,
           cd.deliberation,
           cd.decision,
           cd.sanction_id,
           s.type::text AS sanction_type
      FROM conseils_discipline cd
      JOIN inscriptions i ON i.id = cd.inscription_id
      JOIN eleves e       ON e.id = i.eleve_id
      JOIN classes c      ON c.id = i.classe_id
      LEFT JOIN sanctions s ON s.id = cd.sanction_id
     WHERE i.annee_id = ${anneeId}::uuid
       AND (${filtres.classeId ?? null}::uuid IS NULL OR i.classe_id = ${filtres.classeId ?? null}::uuid)
       AND (${filtres.enAttente ?? null}::boolean IS NULL
            OR (cd.decision IS NULL) = ${filtres.enAttente ?? null}::boolean)
     ORDER BY cd.date_seance DESC, e.nom
     LIMIT 200
  `);

  return r.rows.map((x) => ({
    id: x.id,
    inscriptionId: x.inscription_id,
    eleveId: x.eleve_id,
    eleve: x.eleve,
    matricule: x.matricule,
    classe: x.classe,
    dateConvocation: x.date_convocation,
    dateSeance: x.date_seance,
    motif: x.motif,
    participants: x.participants,
    tuteurConvoque: x.tuteur_convoque,
    tuteurPresent: x.tuteur_present,
    deliberation: x.deliberation,
    decision: x.decision,
    sanctionId: x.sanction_id,
    sanctionType: x.sanction_type,
    enAttente: x.decision === null,
  }));
}

export interface FaitDiscipline {
  nature: "INCIDENT" | "SANCTION";
  date: string;
  libelle: string;
  detail: string;
  periode: string;
}

export interface DossierDiscipline {
  eleve: string;
  matricule: string;
  classe: string;
  faits: FaitDiscipline[];
  nbIncidents: number;
  nbGraves: number;
  nbSanctions: number;
  absencesNonJustifiees: number;
  /** Notes de conduite de l'année, période par période. */
  conduites: Array<{ periode: string; note: number | null }>;
  /** Conseils antérieurs — la récidive après conseil est le fait le plus lourd. */
  conseilsAnterieurs: number;
}

/**
 * Le dossier que le conseil doit avoir sous les yeux.
 *
 * TOUTE L'ANNÉE, PAS LA PÉRIODE EN COURS
 * ---------------------------------------
 * Un élève exclu trois jours au premier trimestre et récidivant au troisième
 * n'est pas un primo-délinquant. Borner au trimestre ferait disparaître
 * exactement l'antécédent qui justifie l'aggravation.
 *
 * Les incidents et les sanctions sont FUSIONNÉS dans une seule chronologie :
 * lus dans deux tableaux séparés, on perd le lien entre le fait et ce qui l'a
 * suivi — or c'est précisément « signalé trois fois, jamais sanctionné » qui
 * doit sauter aux yeux.
 */
export async function dossierDiscipline(inscriptionId: string): Promise<DossierDiscipline | null> {
  const entete = await db.execute<{
    eleve: string;
    matricule: string;
    classe: string;
    annee_id: string;
    eleve_id: string;
  }>(sql`
    SELECT e.nom || ' ' || e.prenom AS eleve, e.matricule, c.libelle AS classe,
           i.annee_id, e.id AS eleve_id
      FROM inscriptions i
      JOIN eleves e  ON e.id = i.eleve_id
      JOIN classes c ON c.id = i.classe_id
     WHERE i.id = ${inscriptionId}::uuid
  `);

  const tete = entete.rows[0];
  if (!tete) return null;

  const [faits, compteurs, conduites, conseils] = await Promise.all([
    db.execute<{
      nature: string;
      date: string;
      libelle: string;
      detail: string;
      periode: string;
    }>(sql`
      SELECT 'INCIDENT' AS nature,
             inc.date_incident::text AS date,
             inc.gravite::text AS libelle,
             inc.description AS detail,
             p.libelle AS periode
        FROM incidents inc
        JOIN periodes p ON p.id = inc.periode_id
       WHERE inc.inscription_id = ${inscriptionId}::uuid
      UNION ALL
      SELECT 'SANCTION' AS nature,
             s.date_debut::text AS date,
             s.type::text AS libelle,
             s.motif AS detail,
             p.libelle AS periode
        FROM sanctions s
        JOIN periodes p ON p.id = s.periode_id
       WHERE s.inscription_id = ${inscriptionId}::uuid
       ORDER BY date DESC
    `),
    db.execute<{ incidents: number; graves: number; sanctions: number; absences: number }>(sql`
      SELECT (SELECT count(*) FROM incidents WHERE inscription_id = ${inscriptionId}::uuid)::int AS incidents,
             (SELECT count(*) FROM incidents WHERE inscription_id = ${inscriptionId}::uuid
               AND gravite IN ('GRAVE', 'TRES_GRAVE'))::int AS graves,
             (SELECT count(*) FROM sanctions WHERE inscription_id = ${inscriptionId}::uuid)::int AS sanctions,
             (SELECT count(*) FROM absences WHERE inscription_id = ${inscriptionId}::uuid
               AND statut = 'NON_JUSTIFIEE')::int AS absences
    `),
    db.execute<{ periode: string; note: string | null }>(sql`
      SELECT p.libelle AS periode, nc.note::text AS note
        FROM periodes p
        LEFT JOIN notes_conduite nc
               ON nc.periode_id = p.id AND nc.inscription_id = ${inscriptionId}::uuid
       WHERE p.annee_id = ${tete.annee_id}::uuid
       ORDER BY p.numero
    `),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM conseils_discipline
       WHERE inscription_id = ${inscriptionId}::uuid AND decision IS NOT NULL
    `),
  ]);

  const c = compteurs.rows[0];

  return {
    eleve: tete.eleve,
    matricule: tete.matricule,
    classe: tete.classe,
    faits: faits.rows.map((f) => ({
      nature: f.nature as "INCIDENT" | "SANCTION",
      date: f.date,
      libelle: f.libelle,
      detail: f.detail,
      periode: f.periode,
    })),
    nbIncidents: Number(c?.incidents ?? 0),
    nbGraves: Number(c?.graves ?? 0),
    nbSanctions: Number(c?.sanctions ?? 0),
    absencesNonJustifiees: Number(c?.absences ?? 0),
    conduites: conduites.rows.map((x) => ({
      periode: x.periode,
      note: x.note === null ? null : Number(x.note),
    })),
    conseilsAnterieurs: Number(conseils.rows[0]?.n ?? 0),
  };
}

// ===========================================================================
// Statistiques de discipline (E-55)
// ===========================================================================

export interface StatistiquesDiscipline {
  parGravite: Array<{ gravite: string; nombre: number }>;
  parType: Array<{ type: string; nombre: number }>;
  parMois: Array<{ mois: string; incidents: number; sanctions: number }>;
  parClasse: Array<{ classe: string; incidents: number; sanctions: number; effectif: number }>;
  recidivistes: Array<{
    inscriptionId: string;
    eleveId: string;
    eleve: string;
    classe: string;
    incidents: number;
    sanctions: number;
  }>;
  totalIncidents: number;
  totalSanctions: number;
}

/**
 * Ce que les statistiques doivent montrer, et ce qu'elles ne doivent pas.
 *
 * LE COMPTE PAR CLASSE EST RAPPORTÉ À L'EFFECTIF
 * -----------------------------------------------
 * Une classe de 45 élèves produit mécaniquement plus d'incidents qu'une classe
 * de 20. Un classement brut désignerait toujours les grosses classes et ferait
 * conclure à un problème d'encadrement là où il n'y a qu'un problème de taille.
 * L'effectif accompagne donc chaque ligne.
 *
 * LA COURBE MENSUELLE EST LA PLUS UTILE
 * --------------------------------------
 * La discipline se dégrade par vagues — avant les compositions, après une
 * longue absence de professeur. Un total annuel ne le montre jamais.
 *
 * LES RÉCIDIVISTES SONT NOMMÉS
 * -----------------------------
 * C'est le seul tableau nominatif, et il est assumé : la vie scolaire existe
 * pour repérer les quelques élèves qui décrochent avant qu'on ne les exclue.
 * Un chiffre agrégé ne permet d'agir sur personne.
 */
export async function statistiquesDiscipline(
  anneeId: string,
  filtres: { periodeId?: string; classeId?: string } = {},
): Promise<StatistiquesDiscipline> {
  const p = filtres.periodeId ?? null;
  const cl = filtres.classeId ?? null;

  const [gravite, type, mois, classe, recidive] = await Promise.all([
    db.execute<{ gravite: string; nombre: number }>(sql`
      SELECT inc.gravite::text AS gravite, count(*)::int AS nombre
        FROM incidents inc
        JOIN inscriptions i ON i.id = inc.inscription_id
       WHERE i.annee_id = ${anneeId}::uuid
         AND (${p}::uuid IS NULL OR inc.periode_id = ${p}::uuid)
         AND (${cl}::uuid IS NULL OR i.classe_id = ${cl}::uuid)
       GROUP BY 1
       ORDER BY 2 DESC
    `),
    db.execute<{ type: string; nombre: number }>(sql`
      SELECT s.type::text AS type, count(*)::int AS nombre
        FROM sanctions s
        JOIN inscriptions i ON i.id = s.inscription_id
       WHERE i.annee_id = ${anneeId}::uuid
         AND (${p}::uuid IS NULL OR s.periode_id = ${p}::uuid)
         AND (${cl}::uuid IS NULL OR i.classe_id = ${cl}::uuid)
       GROUP BY 1
       ORDER BY 2 DESC
    `),
    db.execute<{ mois: string; incidents: number; sanctions: number }>(sql`
      WITH tous AS (
        SELECT to_char(inc.date_incident, 'YYYY-MM') AS mois, 1 AS inc, 0 AS san
          FROM incidents inc
          JOIN inscriptions i ON i.id = inc.inscription_id
         WHERE i.annee_id = ${anneeId}::uuid
           AND (${cl}::uuid IS NULL OR i.classe_id = ${cl}::uuid)
        UNION ALL
        SELECT to_char(s.date_debut, 'YYYY-MM') AS mois, 0, 1
          FROM sanctions s
          JOIN inscriptions i ON i.id = s.inscription_id
         WHERE i.annee_id = ${anneeId}::uuid
           AND (${cl}::uuid IS NULL OR i.classe_id = ${cl}::uuid)
      )
      SELECT mois, sum(inc)::int AS incidents, sum(san)::int AS sanctions
        FROM tous GROUP BY 1 ORDER BY 1
    `),
    db.execute<{ classe: string; incidents: number; sanctions: number; effectif: number }>(sql`
      SELECT c.libelle AS classe,
             (SELECT count(*) FROM incidents inc
               JOIN inscriptions i2 ON i2.id = inc.inscription_id
              WHERE i2.classe_id = c.id
                AND (${p}::uuid IS NULL OR inc.periode_id = ${p}::uuid))::int AS incidents,
             (SELECT count(*) FROM sanctions s
               JOIN inscriptions i3 ON i3.id = s.inscription_id
              WHERE i3.classe_id = c.id
                AND (${p}::uuid IS NULL OR s.periode_id = ${p}::uuid))::int AS sanctions,
             (SELECT count(*) FROM inscriptions i4
               WHERE i4.classe_id = c.id AND i4.active)::int AS effectif
        FROM classes c
       WHERE c.annee_id = ${anneeId}::uuid
         AND (${cl}::uuid IS NULL OR c.id = ${cl}::uuid)
       ORDER BY 2 DESC, c.libelle
    `),
    db.execute<{
      inscription_id: string;
      eleve_id: string;
      eleve: string;
      classe: string;
      incidents: number;
      sanctions: number;
    }>(sql`
      -- Le tri passe par une sous-requete : PostgreSQL accepte un alias de
      -- colonne SEUL dans ORDER BY, jamais dans une expression. Ecrire
      -- « ORDER BY incidents + sanctions » leve « column inc does not exist »
      -- a l'execution — invisible au typage, invisible au build.
      SELECT * FROM (
        SELECT i.id AS inscription_id,
               e.id AS eleve_id,
               e.nom || ' ' || e.prenom AS eleve,
               c.libelle AS classe,
               e.nom AS tri_nom,
               (SELECT count(*) FROM incidents inc
                 WHERE inc.inscription_id = i.id
                   AND (${p}::uuid IS NULL OR inc.periode_id = ${p}::uuid))::int AS incidents,
               (SELECT count(*) FROM sanctions s
                 WHERE s.inscription_id = i.id
                   AND (${p}::uuid IS NULL OR s.periode_id = ${p}::uuid))::int AS sanctions
          FROM inscriptions i
          JOIN eleves e  ON e.id = i.eleve_id
          JOIN classes c ON c.id = i.classe_id
         WHERE i.annee_id = ${anneeId}::uuid
           AND i.active
           AND (${cl}::uuid IS NULL OR i.classe_id = ${cl}::uuid)
      ) x
       -- Filtre ici plutot qu'en TypeScript : sans lui, LIMIT 15 remonterait
       -- quinze eleves a zero fait des qu'une periode est calme.
       WHERE x.incidents + x.sanctions > 1
       ORDER BY x.incidents + x.sanctions DESC, x.tri_nom
       LIMIT 15
    `),
  ]);

  const parGravite = gravite.rows.map((x) => ({ gravite: x.gravite, nombre: Number(x.nombre) }));
  const parType = type.rows.map((x) => ({ type: x.type, nombre: Number(x.nombre) }));

  return {
    parGravite,
    parType,
    parMois: mois.rows.map((x) => ({
      mois: x.mois,
      incidents: Number(x.incidents),
      sanctions: Number(x.sanctions),
    })),
    parClasse: classe.rows.map((x) => ({
      classe: x.classe,
      incidents: Number(x.incidents),
      sanctions: Number(x.sanctions),
      effectif: Number(x.effectif),
    })),
    // Le filtre « plus d'un fait » est applique EN SQL, avant le LIMIT : le
    // faire ici ecarterait des lignes deja retenues et pourrait rendre une
    // liste vide alors que des recidivistes existent au-dela du quinzieme.
    recidivistes: recidive.rows.map((x) => ({
      inscriptionId: x.inscription_id,
      eleveId: x.eleve_id,
      eleve: x.eleve,
      classe: x.classe,
      incidents: Number(x.incidents),
      sanctions: Number(x.sanctions),
    })),
    totalIncidents: parGravite.reduce((t, x) => t + x.nombre, 0),
    totalSanctions: parType.reduce((t, x) => t + x.nombre, 0),
  };
}
