import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { calculerStatistiques, type Statistiques } from "@/lib/statistiques-notes";
import { db } from "@/server/db";
import { eleves, evaluations, inscriptions, notes } from "@/server/db/schema";

/** Lectures du module Évaluations et Notes. */

export interface LigneEvaluation {
  id: string;
  titre: string;
  type: string;
  dateEvaluation: string;
  bareme: string;
  poids: string;
  statut: string;
  classeId: string;
  classe: string;
  matiereId: string;
  matiere: string;
  enseignantNom: string | null;
  effectif: number;
  nbSaisies: number;
  nbNotees: number;
  estVerrouillee: boolean;
}

export async function listerEvaluations(filtres: {
  periodeId: string;
  classeId?: string;
  matiereId?: string;
}): Promise<LigneEvaluation[]> {
  const lignes = await db.execute<LigneEvaluation & Record<string, unknown>>(sql`
    SELECT v.evaluation_id AS id, v.titre, v.type::text, v.date_evaluation AS "dateEvaluation",
           e.bareme, e.poids, v.statut::text, v.classe_id AS "classeId", v.classe,
           v.matiere_id AS "matiereId", v.matiere, v.enseignant_nom AS "enseignantNom",
           v.effectif, v.nb_saisies AS "nbSaisies", v.nb_notees AS "nbNotees",
           e.est_verrouillee AS "estVerrouillee"
      FROM v_avancement_saisie v
      JOIN evaluations e ON e.id = v.evaluation_id
     WHERE v.periode_id = ${filtres.periodeId}::uuid
       AND (${filtres.classeId ?? null}::uuid IS NULL OR v.classe_id = ${filtres.classeId ?? null}::uuid)
       AND (${filtres.matiereId ?? null}::uuid IS NULL OR v.matiere_id = ${filtres.matiereId ?? null}::uuid)
     ORDER BY v.date_evaluation DESC
     LIMIT 100
  `);

  return lignes.rows.map((l) => ({
    ...l,
    effectif: Number(l.effectif),
    nbSaisies: Number(l.nbSaisies),
    nbNotees: Number(l.nbNotees),
  }));
}

export interface LigneSaisie {
  inscriptionId: string;
  eleveId: string;
  matricule: string;
  nom: string;
  prenom: string;
  noteId: string | null;
  valeur: string | null;
  statut: string | null;
  appreciation: string | null;
}

/**
 * Grille de saisie d'une évaluation.
 *
 * On part de la LISTE DE CLASSE, pas des notes existantes : un élève sans note
 * doit apparaître avec une case vide, sinon le professeur ne peut pas le
 * noter. C'est l'inverse d'une simple lecture de la table `notes`.
 */
export async function chargerGrilleSaisie(evaluationId: string): Promise<{
  evaluation: typeof evaluations.$inferSelect;
  lignes: LigneSaisie[];
} | null> {
  const [evaluation] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId));
  if (!evaluation) return null;

  const lignes = await db
    .select({
      inscriptionId: inscriptions.id,
      eleveId: eleves.id,
      matricule: eleves.matricule,
      nom: eleves.nom,
      prenom: eleves.prenom,
      noteId: notes.id,
      valeur: notes.valeur,
      statut: notes.statut,
      appreciation: notes.appreciation,
    })
    .from(inscriptions)
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .leftJoin(
      notes,
      and(eq(notes.inscriptionId, inscriptions.id), eq(notes.evaluationId, evaluationId)),
    )
    .where(and(eq(inscriptions.classeId, evaluation.classeId), eq(inscriptions.active, true)))
    .orderBy(asc(eleves.nom), asc(eleves.prenom));

  return { evaluation, lignes };
}

/** Relevé de notes d'un élève sur une période, matière par matière. */
export async function releveEleve(inscriptionId: string, periodeId: string) {
  const lignes = await db
    .select({
      evaluationId: evaluations.id,
      titre: evaluations.titre,
      type: evaluations.type,
      date: evaluations.dateEvaluation,
      bareme: evaluations.bareme,
      poids: evaluations.poids,
      matiereId: evaluations.matiereId,
      compteDansMoyenne: evaluations.compteDansMoyenne,
      valeur: notes.valeur,
      statut: notes.statut,
      appreciation: notes.appreciation,
    })
    .from(notes)
    .innerJoin(evaluations, eq(evaluations.id, notes.evaluationId))
    .where(and(eq(notes.inscriptionId, inscriptionId), eq(evaluations.periodeId, periodeId)))
    .orderBy(desc(evaluations.dateEvaluation));

  return lignes;
}


/**
 * Statistiques d'une évaluation (E-42).
 *
 * La lecture est ici, le calcul est dans `@/lib/statistiques-notes` — module
 * pur, donc testable. Les règles qui font la justesse du résultat (le
 * traitement des absents, la normalisation sur 20, la médiane sur effectif
 * pair) sont exactement celles qui se cassent en silence.
 */
export type { Statistiques as StatistiquesEvaluation, TrancheNotes } from "@/lib/statistiques-notes";

export async function statistiquesEvaluation(
  evaluationId: string,
): Promise<Statistiques | null> {
  const r = await db.execute<{
    bareme: string;
    effectif: number;
    valeur: string | null;
    statut: string | null;
  }>(sql`
    SELECT e.bareme,
           (SELECT count(*) FROM inscriptions i
             WHERE i.classe_id = e.classe_id AND i.active) AS effectif,
           n.valeur::text AS valeur,
           n.statut::text AS statut
      FROM evaluations e
      -- On part de la LISTE DE CLASSE, pas de la table des notes : sans cela,
      -- « non saisies » vaudrait toujours zéro et l'écran annoncerait une
      -- évaluation complète alors que la moitié des élèves manque.
      LEFT JOIN inscriptions i ON i.classe_id = e.classe_id AND i.active
      LEFT JOIN notes n ON n.inscription_id = i.id AND n.evaluation_id = e.id
     WHERE e.id = ${evaluationId}::uuid
  `);

  if (r.rows.length === 0) return null;

  return calculerStatistiques(
    r.rows.map((l) => ({ statut: l.statut, valeur: l.valeur === null ? null : Number(l.valeur) })),
    Number(r.rows[0].bareme),
    Number(r.rows[0].effectif),
  );
}
