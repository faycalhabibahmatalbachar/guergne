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

  await ecrireStatistiquesMatiere(classeId, periodeId);

  return rapport;
}

/**
 * Statistiques de classe, matière par matière (repère du relevé mobile).
 *
 * CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT
 * --------------------------------------
 * `moyennes_matiere` porte depuis l'origine quatre colonnes comparatives —
 * moyenne de la classe, note la plus basse, la plus haute, rang dans la
 * matière. L'API mobile les renvoie déjà. Mais AUCUNE phase de génération ne
 * les écrivait : les valeurs en base venaient des données de démonstration.
 *
 * À la première régénération réelle, l'application des parents aurait donc
 * affiché une moyenne de classe figée à la valeur semée — c'est-à-dire un
 * chiffre faux, à côté de la note de leur enfant, sans que rien ne le signale.
 * Une comparaison fausse est pire qu'une comparaison absente.
 *
 * POURQUOI UNE PASSE SÉPARÉE, APRÈS TOUT LE MONDE
 * ------------------------------------------------
 * Une statistique de classe ne peut pas se calculer pendant qu'on traite un
 * élève : elle a besoin des moyennes de tous les autres. C'est la même barrière
 * que le rang, et elle arrive au même moment — après la boucle.
 *
 * POURQUOI EN SQL PLUTÔT QU'EN MÉMOIRE
 * -------------------------------------
 * Les moyennes viennent d'être écrites : les relire pour les agréger côté
 * application ferait un aller-retour de plus par matière, et surtout
 * dupliquerait la règle de calcul du rang — qui doit traiter les ex æquo
 * exactement comme `RANK()`, sans quoi deux élèves à 14,25 recevraient des
 * rangs différents sur le relevé et le même sur le bulletin.
 */
async function ecrireStatistiquesMatiere(classeId: string, periodeId: string): Promise<void> {
  await db.execute(sql`
    WITH cible AS (
      SELECT mm.id, mm.matiere_id, mm.moyenne
        FROM moyennes_matiere mm
        JOIN inscriptions i ON i.id = mm.inscription_id
       WHERE i.classe_id = ${classeId}::uuid
         AND i.active
         AND mm.periode_id = ${periodeId}::uuid
    ),
    stats AS (
      SELECT matiere_id,
             round(avg(moyenne), 2) AS moy,
             min(moyenne) AS mini,
             max(moyenne) AS maxi
        FROM cible
       -- Les élèves sans moyenne dans la matière sont exclus du calcul : les
       -- compter comme des zéros ferait chuter la moyenne de classe d'un point
       -- sans qu'aucun élève ait mal travaillé, et le repère mentirait.
       WHERE moyenne IS NOT NULL
       GROUP BY matiere_id
    ),
    classement AS (
      SELECT id,
             RANK() OVER (PARTITION BY matiere_id ORDER BY moyenne DESC) AS rang
        FROM cible
       WHERE moyenne IS NOT NULL
    )
    UPDATE moyennes_matiere mm
       SET moyenne_classe  = s.moy,
           note_min_classe = s.mini,
           note_max_classe = s.maxi,
           rang_matiere    = c.rang
      FROM cible t
      LEFT JOIN stats s ON s.matiere_id = t.matiere_id
      LEFT JOIN classement c ON c.id = t.id
     WHERE mm.id = t.id
  `);
}

/** Moyenne de la classe, sur les seuls élèves ayant une moyenne. */
function moyenneDeClasse(
  calculs: Array<{ generale: { moyenne: number | null } }>,
): number | null {
  const notes = calculs.map((c) => c.generale.moyenne).filter((m): m is number => m !== null);
  if (notes.length === 0) return null;
  return Number((notes.reduce((t, m) => t + m, 0) / notes.length).toFixed(2));
}

// ---------------------------------------------------------------------------
// E-45 — Qui n'a pas saisi
// ---------------------------------------------------------------------------

export interface SaisieManquante {
  matiere: string;
  enseignant: string | null;
  evaluation: string;
  type: string;
  dateEvaluation: string | null;
  attendues: number;
  saisies: number;
  manquantes: number;
  verrouillee: boolean;
}

/**
 * Évaluations dont la saisie n'est pas terminée pour une classe et une période.
 *
 * POURQUOI CE TABLEAU EXISTE
 * ---------------------------
 * Un conseil de classe qui délibère sur des moyennes incomplètes prend des
 * décisions fausses : un élève dont il manque la note de mathématiques a une
 * moyenne calculée sur les autres matières, et son rang est faux — comme celui
 * de tous les autres, puisque le classement les compare.
 *
 * Le problème est qu'une moyenne incomplète ne se VOIT pas : elle a l'air d'une
 * moyenne normale. Ce tableau est le seul moyen de s'en apercevoir avant le
 * conseil plutôt qu'après.
 *
 * ON COMPTE LES NOTES ATTENDUES, PAS LES ÉLÈVES
 * ----------------------------------------------
 * « Attendues » vaut l'effectif de la classe : chaque élève inscrit doit avoir
 * une ligne, même absente ou dispensée — ces statuts SONT une saisie. Ne
 * compter que les notes chiffrées ferait apparaître comme incomplète une
 * évaluation où le professeur a consciencieusement marqué les absents.
 */
export async function saisiesManquantes(
  classeId: string,
  periodeId: string,
): Promise<SaisieManquante[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT m.libelle AS matiere,
           CASE WHEN ens.id IS NULL THEN NULL
                ELSE ens.prenom || ' ' || ens.nom END AS enseignant,
           ev.titre AS evaluation,
           ev.type::text AS type,
           ev.date_evaluation::text AS date_evaluation,
           ev.est_verrouillee AS verrouillee,
           (SELECT count(*) FROM inscriptions i
             WHERE i.classe_id = ${classeId}::uuid AND i.active)::int AS attendues,
           (SELECT count(*) FROM notes n
              JOIN inscriptions i2 ON i2.id = n.inscription_id
             WHERE n.evaluation_id = ev.id
               AND i2.classe_id = ${classeId}::uuid AND i2.active)::int AS saisies
      FROM evaluations ev
      JOIN matieres m       ON m.id = ev.matiere_id
      LEFT JOIN enseignants ens ON ens.id = ev.enseignant_id
     WHERE ev.classe_id = ${classeId}::uuid
       AND ev.periode_id = ${periodeId}::uuid
       AND ev.compte_dans_moyenne
     ORDER BY m.ordre_bulletin NULLS LAST, m.libelle, ev.date_evaluation
  `);

  return r.rows
    .map((l) => {
      const attendues = Number(l.attendues);
      const saisies = Number(l.saisies);
      return {
        matiere: String(l.matiere),
        enseignant: (l.enseignant as string) ?? null,
        evaluation: String(l.evaluation),
        type: String(l.type),
        dateEvaluation: (l.date_evaluation as string) ?? null,
        attendues,
        saisies,
        manquantes: Math.max(0, attendues - saisies),
        verrouillee: Boolean(l.verrouillee),
      };
    })
    .filter((l) => l.manquantes > 0);
}
