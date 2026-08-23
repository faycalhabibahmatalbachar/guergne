import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Les quatre volets du dossier scolaire d'un élève.
 *
 * POURQUOI UNE SEULE FONCTION
 * ----------------------------
 * Notes, assiduité, discipline et finances vivent dans quatre modules
 * différents, chacun avec ses propres requêtes conçues pour des LISTES —
 * « toutes les absences de la classe », « tous les impayés de l'année ». Les
 * réutiliser ici obligerait à les filtrer après coup, c'est-à-dire à rapatrier
 * mille lignes pour en garder dix.
 *
 * Ce module pose donc les quatre requêtes du point de vue d'UN élève, et les
 * lance en parallèle : la fiche s'affiche en un aller-retour, pas en quatre.
 */

export interface MatiereReleve {
  matiere: string;
  coefficient: number;
  moyenne: number | null;
  moyenneClasse: number | null;
  rang: number | null;
  nbEvaluations: number;
}

export interface PointEvolution {
  periode: string;
  moyenne: number | null;
  moyenneClasse: number | null;
  rang: number | null;
  effectif: number | null;
}

export interface LigneAssiduite {
  id: string;
  date: string;
  type: "absence" | "retard";
  duree: string;
  statut: string;
  motif: string | null;
  matiere: string | null;
}

export interface LigneDiscipline {
  id: string;
  date: string;
  nature: "incident" | "sanction";
  libelle: string;
  detail: string | null;
  gravite: string | null;
  executee: boolean | null;
}

export interface LigneFinance {
  id: string;
  libelle: string;
  nature: string;
  dateLimite: string;
  du: number;
  paye: number;
  exonere: number;
  reste: number;
  statut: string;
  enRetard: boolean;
}

export interface LignePaiement {
  id: string;
  numeroRecu: string;
  date: string;
  montant: number;
  mode: string;
  payeur: string | null;
  annule: boolean;
}

export interface DossierScolarite {
  releve: MatiereReleve[];
  evolution: PointEvolution[];
  assiduite: LigneAssiduite[];
  discipline: LigneDiscipline[];
  echeances: LigneFinance[];
  paiements: LignePaiement[];
  /** Période dont provient le relevé, pour l'afficher sans ambiguïté. */
  periodeReleve: string | null;
}

const nb = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function chargerDossierScolarite(
  inscriptionId: string,
  periodeId: string | null,
): Promise<DossierScolarite> {
  const [releve, evolution, assiduite, discipline, echeances, paiements, periode] =
    await Promise.all([
      // --- Relevé par matière ------------------------------------------------
      db.execute<Record<string, unknown>>(sql`
        SELECT m.libelle AS matiere, mm.coefficient, mm.moyenne::text AS moyenne,
               mm.moyenne_classe::text AS moyenne_classe, mm.rang_matiere AS rang,
               mm.nb_evaluations
          FROM moyennes_matiere mm
          JOIN matieres m ON m.id = mm.matiere_id
         WHERE mm.inscription_id = ${inscriptionId}::uuid
           AND (${periodeId}::uuid IS NULL OR mm.periode_id = ${periodeId}::uuid)
         ORDER BY m.ordre_bulletin NULLS LAST, m.libelle
      `),

      // --- Évolution sur l'année (E-34) --------------------------------------
      // Toutes les périodes, même celles sans bulletin : une courbe qui saute
      // un trimestre laisserait croire à une progression continue.
      db.execute<Record<string, unknown>>(sql`
        SELECT p.libelle AS periode,
               b.moyenne_generale::text AS moyenne,
               b.moyenne_classe::text   AS moyenne_classe,
               b.rang, b.effectif_classe AS effectif
          FROM periodes p
          LEFT JOIN bulletins b
            ON b.periode_id = p.id AND b.inscription_id = ${inscriptionId}::uuid
         WHERE p.annee_id = (SELECT annee_id FROM inscriptions WHERE id = ${inscriptionId}::uuid)
         ORDER BY p.numero
      `),

      // --- Assiduité : absences ET retards dans une seule liste --------------
      // Les deux se lisent ensemble : un élève à dix retards et zéro absence
      // n'a pas le même problème qu'un élève à dix absences.
      db.execute<Record<string, unknown>>(sql`
        SELECT a.id, a.date_absence::text AS date, 'absence' AS type,
               a.nb_heures::text || ' h' AS duree,
               a.statut::text AS statut, a.motif, m.libelle AS matiere
          FROM absences a
          LEFT JOIN matieres m ON m.id = a.matiere_id
         WHERE a.inscription_id = ${inscriptionId}::uuid
        UNION ALL
        SELECT r.id, r.date_retard::text, 'retard',
               r.duree_minutes::text || ' min',
               r.statut::text, r.motif, m.libelle
          FROM retards r
          LEFT JOIN matieres m ON m.id = r.matiere_id
         WHERE r.inscription_id = ${inscriptionId}::uuid
         ORDER BY 2 DESC
         LIMIT 100
      `),

      // --- Discipline : incidents ET sanctions -------------------------------
      db.execute<Record<string, unknown>>(sql`
        SELECT i.id, i.date_incident::text AS date, 'incident' AS nature,
               'Incident' AS libelle, i.description AS detail,
               i.gravite::text AS gravite, NULL::boolean AS executee
          FROM incidents i
         WHERE i.inscription_id = ${inscriptionId}::uuid
        UNION ALL
        SELECT s.id, s.date_debut::text, 'sanction',
               replace(s.type::text, '_', ' '), s.motif,
               NULL, s.executee
          FROM sanctions s
         WHERE s.inscription_id = ${inscriptionId}::uuid
         ORDER BY 2 DESC
         LIMIT 60
      `),

      // --- Échéancier ---------------------------------------------------------
      db.execute<Record<string, unknown>>(sql`
        SELECT ec.id, ec.libelle, ec.nature::text AS nature,
               ec.date_limite::text AS date_limite,
               ec.montant_du_fcfa AS du, ec.montant_paye_fcfa AS paye,
               ec.montant_exonere_fcfa AS exonere,
               ec.montant_du_fcfa - ec.montant_paye_fcfa - ec.montant_exonere_fcfa AS reste,
               ec.statut::text AS statut,
               ec.date_limite < CURRENT_DATE
                 AND ec.montant_du_fcfa > ec.montant_paye_fcfa + ec.montant_exonere_fcfa
                 AS en_retard
          FROM echeances ec
         WHERE ec.inscription_id = ${inscriptionId}::uuid
         ORDER BY ec.date_limite
      `),

      // --- Reçus --------------------------------------------------------------
      db.execute<Record<string, unknown>>(sql`
        SELECT p.id, p.numero_recu, p.date_paiement::text AS date,
               p.montant_fcfa AS montant, p.mode::text AS mode,
               p.nom_payeur, p.annule
          FROM paiements p
         WHERE p.inscription_id = ${inscriptionId}::uuid
         ORDER BY p.date_paiement DESC
      `),

      db.execute<{ libelle: string }>(sql`
        SELECT libelle FROM periodes WHERE id = ${periodeId}::uuid
      `),
    ]);

  return {
    releve: releve.rows.map((l) => ({
      matiere: String(l.matiere),
      coefficient: Number(l.coefficient),
      moyenne: nb(l.moyenne),
      moyenneClasse: nb(l.moyenne_classe),
      rang: nb(l.rang),
      nbEvaluations: Number(l.nb_evaluations ?? 0),
    })),

    evolution: evolution.rows.map((l) => ({
      periode: String(l.periode),
      moyenne: nb(l.moyenne),
      moyenneClasse: nb(l.moyenne_classe),
      rang: nb(l.rang),
      effectif: nb(l.effectif),
    })),

    assiduite: assiduite.rows.map((l) => ({
      id: String(l.id),
      date: String(l.date),
      type: l.type as "absence" | "retard",
      duree: String(l.duree),
      statut: String(l.statut),
      motif: (l.motif as string) ?? null,
      matiere: (l.matiere as string) ?? null,
    })),

    discipline: discipline.rows.map((l) => ({
      id: String(l.id),
      date: String(l.date),
      nature: l.nature as "incident" | "sanction",
      libelle: String(l.libelle),
      detail: (l.detail as string) ?? null,
      gravite: (l.gravite as string) ?? null,
      executee: l.executee === null ? null : Boolean(l.executee),
    })),

    echeances: echeances.rows.map((l) => ({
      id: String(l.id),
      libelle: String(l.libelle),
      nature: String(l.nature),
      dateLimite: String(l.date_limite),
      du: Number(l.du),
      paye: Number(l.paye),
      exonere: Number(l.exonere),
      reste: Number(l.reste),
      statut: String(l.statut),
      enRetard: Boolean(l.en_retard),
    })),

    paiements: paiements.rows.map((l) => ({
      id: String(l.id),
      numeroRecu: String(l.numero_recu),
      date: String(l.date),
      montant: Number(l.montant),
      mode: String(l.mode),
      payeur: (l.nom_payeur as string) ?? null,
      annule: Boolean(l.annule),
    })),

    periodeReleve: periode.rows[0]?.libelle ?? null,
  };
}
