import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

import {
  PONDERATION_PAR_DEFAUT,
  calculerMoyenneGenerale,
  calculerMoyenneMatiere,
  calculerRangs,
  construireMoyenneMatiere,
  proposerMention,
  type NoteBrute,
  type Ponderation,
} from "./notes";

/**
 * Production des bulletins d'une classe pour une période.
 *
 * C'EST L'ÉTAPE QUI MANQUAIT
 * ---------------------------
 * Le moteur de calcul existait, testé et verrouillé. Le bulletin imprimable
 * existait. Mais rien ne reliait les deux : `moyennes_matiere` n'était écrite
 * par aucun code, et la table `bulletins` restait vide. L'établissement
 * continuait donc à calculer ses moyennes et ses rangs à la main.
 *
 * TROIS TEMPS, DANS CET ORDRE
 * ----------------------------
 *   1. Moyenne par matière, élève par élève. Elle dépend des seules notes de
 *      l'élève, donc peut se calculer isolément.
 *   2. Moyenne générale, puis RANG. Le rang est le seul chiffre qui dépende de
 *      toute la classe : il ne peut être calculé qu'une fois la première étape
 *      terminée pour tout le monde. C'est la raison de la barrière.
 *   3. Écriture des bulletins, avec mention proposée.
 *
 * ON N'ÉCRASE JAMAIS UNE APPRÉCIATION
 * ------------------------------------
 * Une regénération recalcule les chiffres mais conserve tout ce qu'un humain a
 * écrit : appréciation générale, décision du conseil, et le fait que le
 * bulletin soit publié ou non. Un conseil de classe qui verrait ses
 * appréciations effacées par un recalcul ne referait jamais confiance à
 * l'outil.
 */

export interface RapportGeneration {
  classe: string;
  periode: string;
  eleves: number;
  bulletinsEcrits: number;
  moyennesEcrites: number;
  sansNote: number;
  /** Élèves dont la moyenne n'a pas pu être calculée, avec la raison. */
  ignores: Array<{ nom: string; raison: string }>;
}

interface LigneNote extends Record<string, unknown> {
  inscription_id: string;
  matiere_id: string;
  valeur: string | null;
  statut: string;
  bareme: string;
  poids: string;
  type: string;
  compte_dans_moyenne: boolean;
}

/**
 * Pondérations du niveau, matière par matière.
 *
 * Elles vivent dans `coefficients` et varient selon le niveau et la série : un
 * devoir ne pèse pas le même poids en Terminale D qu'en 6ème. À défaut, on
 * retombe sur `PONDERATION_PAR_DEFAUT`, qui donne double poids à la composition.
 */
async function ponderations(
  classeId: string,
): Promise<Map<string, { coefficient: number; ponderation: Ponderation }>> {
  const r = await db.execute<{
    matiere_id: string;
    coefficient: string;
    poids_interro: string | null;
    poids_devoir: string | null;
    poids_composition: string | null;
  }>(sql`
    SELECT co.matiere_id, co.coefficient,
           co.poids_interro, co.poids_devoir, co.poids_composition
      FROM classes c
      JOIN coefficients co
        ON co.annee_id = c.annee_id
       AND co.niveau_id = c.niveau_id
       AND (co.serie_id IS NULL OR co.serie_id = c.serie_id)
     WHERE c.id = ${classeId}::uuid
  `);

  const table = new Map<string, { coefficient: number; ponderation: Ponderation }>();
  for (const l of r.rows) {
    table.set(l.matiere_id, {
      coefficient: Number(l.coefficient),
      ponderation: {
        interrogation: Number(l.poids_interro ?? PONDERATION_PAR_DEFAUT.interrogation),
        devoir: Number(l.poids_devoir ?? PONDERATION_PAR_DEFAUT.devoir),
        composition: Number(l.poids_composition ?? PONDERATION_PAR_DEFAUT.composition),
      },
    });
  }
  return table;
}

export async function genererBulletins(
  classeId: string,
  periodeId: string,
): Promise<RapportGeneration> {
  const contexte = await db.execute<{ classe: string; periode: string; verrouillee: boolean }>(sql`
    SELECT c.libelle AS classe, p.libelle AS periode, p.est_verrouillee AS verrouillee
      FROM classes c, periodes p
     WHERE c.id = ${classeId}::uuid AND p.id = ${periodeId}::uuid
  `);
  const ctx = contexte.rows[0];
  if (!ctx) throw new Error("Classe ou période introuvable.");

  const inscrits = await db.execute<{ id: string; nom: string; prenom: string }>(sql`
    SELECT i.id, e.nom, e.prenom
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
     WHERE i.classe_id = ${classeId}::uuid AND i.active
     ORDER BY e.nom, e.prenom
  `);

  const rapport: RapportGeneration = {
    classe: ctx.classe,
    periode: ctx.periode,
    eleves: inscrits.rows.length,
    bulletinsEcrits: 0,
    moyennesEcrites: 0,
    sansNote: 0,
    ignores: [],
  };

  if (inscrits.rows.length === 0) return rapport;

  const table = await ponderations(classeId);

  // Toutes les notes de la classe en UNE requête. Une requête par élève et par
  // matière ferait plusieurs milliers d'allers-retours vers une base distante.
  const notes = await db.execute<LigneNote>(sql`
    SELECT n.inscription_id, ev.matiere_id, n.valeur::text, n.statut::text AS statut,
           ev.bareme::text, ev.poids::text, ev.type::text AS type, ev.compte_dans_moyenne
      FROM notes n
      JOIN evaluations ev ON ev.id = n.evaluation_id
      JOIN inscriptions i ON i.id = n.inscription_id
     WHERE i.classe_id = ${classeId}::uuid
       AND i.active
       AND ev.periode_id = ${periodeId}::uuid
  `);

  const parEleve = new Map<string, Map<string, NoteBrute[]>>();
  for (const l of notes.rows) {
    const parMatiere = parEleve.get(l.inscription_id) ?? new Map<string, NoteBrute[]>();
    const liste = parMatiere.get(l.matiere_id) ?? [];
    liste.push({
      valeur: l.valeur === null ? null : Number(l.valeur),
      statut: l.statut as NoteBrute["statut"],
      bareme: Number(l.bareme),
      poids: Number(l.poids),
      type: l.type as NoteBrute["type"],
      compteDansMoyenne: l.compte_dans_moyenne,
    });
    parMatiere.set(l.matiere_id, liste);
    parEleve.set(l.inscription_id, parMatiere);
  }

  // --- Temps 1 et 2 : moyennes, puis classement -----------------------------
  const calculs = inscrits.rows.map((eleve) => {
    const parMatiere = parEleve.get(eleve.id) ?? new Map<string, NoteBrute[]>();
    const moyennes = [];

    for (const [matiereId, liste] of parMatiere) {
      const config = table.get(matiereId);
      // Une matière sans coefficient déclaré pour ce niveau n'est pas notée au
      // bulletin : l'inclure avec un coefficient inventé fausserait la moyenne.
      if (!config) continue;

      // `calculerMoyenneMatiere` rend aussi le NOMBRE d'évaluations retenues,
      // qui n'est pas la taille de la liste : les absences justifiées et les
      // dispenses en sont exclues. C'est ce compte-là qui doit être stocké,
      // sinon le bulletin annonce des évaluations qui n'ont pas compté.
      const { moyenne, nbEvaluations } = calculerMoyenneMatiere(liste, config.ponderation);
      moyennes.push(
        construireMoyenneMatiere(matiereId, moyenne, config.coefficient, nbEvaluations),
      );
    }

    const generale = calculerMoyenneGenerale(moyennes);
    return { eleve, moyennes, generale };
  });

  const rangs = new Map(
    calculerRangs(
      calculs.map((c) => ({ inscriptionId: c.eleve.id, moyenne: c.generale.moyenne })),
    ).map((r) => [r.inscriptionId, r]),
  );

  // --- Temps 3 : écriture ---------------------------------------------------
  for (const { eleve, moyennes, generale } of calculs) {
    if (generale.moyenne === null) {
      rapport.sansNote += 1;
      rapport.ignores.push({
        nom: `${eleve.prenom} ${eleve.nom}`,
        raison: "aucune note exploitable sur la période",
      });
      continue;
    }

    await db.transaction(async (tx) => {
      for (const m of moyennes) {
        await tx.execute(sql`
          INSERT INTO moyennes_matiere
            (inscription_id, periode_id, matiere_id, moyenne, coefficient, points, nb_evaluations, calcule_le)
          VALUES (
            ${eleve.id}::uuid, ${periodeId}::uuid, ${m.matiereId}::uuid,
            ${m.moyenne}, ${m.coefficient}, ${m.points}, ${m.nbEvaluations}, now()
          )
          ON CONFLICT (inscription_id, periode_id, matiere_id) DO UPDATE
            SET moyenne = EXCLUDED.moyenne,
                coefficient = EXCLUDED.coefficient,
                points = EXCLUDED.points,
                nb_evaluations = EXCLUDED.nb_evaluations,
                calcule_le = now()
        `);
        rapport.moyennesEcrites += 1;
      }

      const assiduite = await tx.execute<{ justifiees: string; non_justifiees: string; retards: string }>(sql`
        SELECT
          COALESCE(sum(a.nb_heures) FILTER (WHERE a.statut = 'JUSTIFIEE'), 0)     AS justifiees,
          COALESCE(sum(a.nb_heures) FILTER (WHERE a.statut <> 'JUSTIFIEE'), 0)    AS non_justifiees,
          (SELECT count(*) FROM retards r
            WHERE r.inscription_id = ${eleve.id}::uuid AND r.periode_id = ${periodeId}::uuid) AS retards
        FROM absences a
       WHERE a.inscription_id = ${eleve.id}::uuid AND a.periode_id = ${periodeId}::uuid
      `);
      const a = assiduite.rows[0] ?? { justifiees: "0", non_justifiees: "0", retards: "0" };

      const conduite = await tx.execute<{ note: string | null }>(sql`
        SELECT note::text AS note FROM notes_conduite
         WHERE inscription_id = ${eleve.id}::uuid AND periode_id = ${periodeId}::uuid
      `);
      const noteConduite = conduite.rows[0]?.note === undefined || conduite.rows[0]?.note === null
        ? null
        : Number(conduite.rows[0].note);

      const rang = rangs.get(eleve.id);
      const mention = proposerMention(generale.moyenne, noteConduite, Number(a.non_justifiees));

      // Le `DO UPDATE` ne touche QUE les chiffres. `appreciation_generale`,
      // `decision`, `est_publie` et `conseil_classe_id` appartiennent au
      // conseil de classe et survivent à un recalcul.
      await tx.execute(sql`
        INSERT INTO bulletins (
          inscription_id, periode_id, moyenne_generale, rang, effectif_classe,
          moyenne_classe, heures_absence_justifiees, heures_absence_non_justifiees,
          nb_retards, note_conduite, mention, genere_le
        ) VALUES (
          ${eleve.id}::uuid, ${periodeId}::uuid, ${generale.moyenne}, ${rang?.rang ?? null},
          ${rapport.eleves},
          ${moyenneDeClasse(calculs)},
          ${Number(a.justifiees)}, ${Number(a.non_justifiees)}, ${Number(a.retards)},
          ${noteConduite}, ${mention}::mention_bulletin, now()
        )
        ON CONFLICT (inscription_id, periode_id) DO UPDATE
          SET moyenne_generale = EXCLUDED.moyenne_generale,
              rang = EXCLUDED.rang,
              effectif_classe = EXCLUDED.effectif_classe,
              moyenne_classe = EXCLUDED.moyenne_classe,
              heures_absence_justifiees = EXCLUDED.heures_absence_justifiees,
              heures_absence_non_justifiees = EXCLUDED.heures_absence_non_justifiees,
              nb_retards = EXCLUDED.nb_retards,
              note_conduite = EXCLUDED.note_conduite,
              mention = EXCLUDED.mention,
              genere_le = now()
      `);

      rapport.bulletinsEcrits += 1;
    });
  }

  return rapport;
}

/** Moyenne de la classe, sur les seuls élèves ayant une moyenne. */
function moyenneDeClasse(
  calculs: Array<{ generale: { moyenne: number | null } }>,
): number | null {
  const notes = calculs.map((c) => c.generale.moyenne).filter((m): m is number => m !== null);
  if (notes.length === 0) return null;
  return Number((notes.reduce((t, m) => t + m, 0) / notes.length).toFixed(2));
}
