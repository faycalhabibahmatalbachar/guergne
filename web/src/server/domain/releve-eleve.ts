import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

import { ponderations } from "./generation-bulletins";
import { calculerMoyenneGenerale, calculerMoyenneMatiere, construireMoyenneMatiere, type NoteBrute } from "./notes";

/**
 * Relevé de notes d'un élève pour une période, tel qu'on le lit à quelqu'un.
 *
 * POURQUOI CE N'EST PAS `releveEleve`
 * ------------------------------------
 * `releveEleve` (evaluations.ts) rend des lignes brutes portant un `matiereId`
 * et aucune moyenne : illisibles au téléphone, et la tentation serait alors de
 * calculer la moyenne dans l'agent. Ce serait une seconde implémentation des
 * règles du bulletin — pondération par type, absences justifiées exclues,
 * matières sans coefficient écartées — qui finirait par diverger.
 *
 * Ici, les moyennes viennent des MÊMES fonctions que la génération des
 * bulletins (`ponderations`, `calculerMoyenneMatiere`,
 * `calculerMoyenneGenerale`). Elles sont annoncées comme PROVISOIRES : un
 * bulletin publié peut différer si des notes ont changé depuis, et c'est le
 * bulletin qui fait foi.
 */

export interface NoteReleve {
  titre: string;
  type: string;
  date: string;
  valeur: number | null;
  bareme: number;
  statut: string;
  compteDansMoyenne: boolean;
  appreciation: string | null;
}

export interface MatiereReleve {
  matiereId: string;
  matiere: string;
  coefficient: number | null;
  /** Faux : aucune ligne de coefficient pour ce niveau — hors bulletin. */
  noteeAuBulletin: boolean;
  moyenne: number | null;
  nbEvaluationsRetenues: number;
  notes: NoteReleve[];
}

export interface ReleveDetaille {
  eleve: { id: string; nom: string; prenom: string; matricule: string | null };
  classe: string;
  periode: { id: string; libelle: string; numero: number; dateDebut: string; dateFin: string };
  matieres: MatiereReleve[];
  moyenneGenerale: number | null;
  /** Le bulletin de la période, s'il existe déjà. C'est lui qui fait foi. */
  bulletin: { publie: boolean; moyenneGenerale: number | null; rang: number | null } | null;
  provisoire: true;
}

export async function releveDetailleEleve(inscriptionId: string, periodeId: string): Promise<ReleveDetaille | null> {
  const [contexte, lignes, bulletin] = await Promise.all([
    db.execute<{
      eleve_id: string;
      nom: string;
      prenom: string;
      matricule: string | null;
      classe_id: string;
      classe: string;
      periode_id: string | null;
      periode: string | null;
      numero: number | null;
      date_debut: string | null;
      date_fin: string | null;
    }>(sql`
      SELECT e.id AS eleve_id, e.nom, e.prenom, e.matricule,
             c.id AS classe_id, c.libelle AS classe,
             p.id AS periode_id, p.libelle AS periode, p.numero,
             p.date_debut::text AS date_debut, p.date_fin::text AS date_fin
        FROM inscriptions i
        JOIN eleves e  ON e.id = i.eleve_id
        JOIN classes c ON c.id = i.classe_id
        LEFT JOIN periodes p ON p.id = ${periodeId}::uuid AND p.annee_id = i.annee_id
       WHERE i.id = ${inscriptionId}::uuid
    `),
    db.execute<{
      matiere_id: string;
      matiere: string;
      titre: string;
      type: string;
      date: string;
      valeur: string | null;
      bareme: string;
      poids: string;
      statut: string;
      compte_dans_moyenne: boolean;
      appreciation: string | null;
    }>(sql`
      SELECT ev.matiere_id, m.libelle AS matiere, ev.titre, ev.type::text AS type,
             ev.date_evaluation::text AS date, n.valeur::text AS valeur,
             ev.bareme::text AS bareme, ev.poids::text AS poids,
             n.statut::text AS statut, ev.compte_dans_moyenne, n.appreciation
        FROM notes n
        JOIN evaluations ev ON ev.id = n.evaluation_id
        JOIN matieres m     ON m.id = ev.matiere_id
       WHERE n.inscription_id = ${inscriptionId}::uuid
         AND ev.periode_id = ${periodeId}::uuid
       ORDER BY m.ordre_bulletin NULLS LAST, m.libelle, ev.date_evaluation
    `),
    db.execute<{ est_publie: boolean; moyenne_generale: string | null; rang: number | null }>(sql`
      SELECT b.est_publie, b.moyenne_generale::text AS moyenne_generale, b.rang
        FROM bulletins b
       WHERE b.inscription_id = ${inscriptionId}::uuid AND b.periode_id = ${periodeId}::uuid
       LIMIT 1
    `),
  ]);

  const ctx = contexte.rows[0];
  // Une période d'une AUTRE année que l'inscription n'est pas « sans note » :
  // c'est une demande incohérente, et on refuse de la maquiller en relevé vide.
  if (!ctx?.periode_id) return null;

  const table = await ponderations(ctx.classe_id);

  const parMatiere = new Map<string, { libelle: string; brutes: NoteBrute[]; notes: NoteReleve[] }>();
  for (const l of lignes.rows) {
    const acc = parMatiere.get(l.matiere_id) ?? { libelle: l.matiere, brutes: [], notes: [] };
    const valeur = l.valeur === null ? null : Number(l.valeur);
    acc.brutes.push({
      valeur,
      statut: l.statut as NoteBrute["statut"],
      bareme: Number(l.bareme),
      poids: Number(l.poids),
      type: l.type as NoteBrute["type"],
      compteDansMoyenne: l.compte_dans_moyenne,
    });
    acc.notes.push({
      titre: l.titre,
      type: l.type,
      date: l.date,
      valeur,
      bareme: Number(l.bareme),
      statut: l.statut,
      compteDansMoyenne: l.compte_dans_moyenne,
      appreciation: l.appreciation,
    });
    parMatiere.set(l.matiere_id, acc);
  }

  const matieres: MatiereReleve[] = [];
  const pourGenerale = [];
  for (const [matiereId, acc] of parMatiere) {
    const config = table.get(matiereId);
    const { moyenne, nbEvaluations } = calculerMoyenneMatiere(acc.brutes, config?.ponderation);
    matieres.push({
      matiereId,
      matiere: acc.libelle,
      coefficient: config?.coefficient ?? null,
      noteeAuBulletin: Boolean(config),
      moyenne,
      nbEvaluationsRetenues: nbEvaluations,
      notes: acc.notes,
    });
    // Même règle que le bulletin : sans coefficient déclaré, pas de place dans
    // la moyenne générale.
    if (config) pourGenerale.push(construireMoyenneMatiere(matiereId, moyenne, config.coefficient, nbEvaluations));
  }

  const b = bulletin.rows[0];
  return {
    eleve: { id: ctx.eleve_id, nom: ctx.nom, prenom: ctx.prenom, matricule: ctx.matricule },
    classe: ctx.classe,
    periode: {
      id: ctx.periode_id,
      libelle: ctx.periode ?? "",
      numero: Number(ctx.numero ?? 0),
      dateDebut: ctx.date_debut ?? "",
      dateFin: ctx.date_fin ?? "",
    },
    matieres,
    moyenneGenerale: calculerMoyenneGenerale(pourGenerale).moyenne,
    bulletin: b
      ? {
          publie: b.est_publie,
          moyenneGenerale: b.moyenne_generale === null ? null : Number(b.moyenne_generale),
          rang: b.rang,
        }
      : null,
    provisoire: true,
  };
}
