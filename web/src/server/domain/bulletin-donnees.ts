import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import type { BlocMatieres, DonneesBulletin, LigneMatiere } from "@/server/pdf/bulletin";

/**
 * Assemble les données d'un bulletin imprimable.
 *
 * DEUX COLONNES DE NOTES, PAS UNE
 * --------------------------------
 * Le bulletin de l'établissement sépare « Moyennes Devoirs » et « Notes
 * Compositions ». Ce ne sont pas deux vues d'un même chiffre : le devoir se
 * fait en cours de trimestre et se rattrape, la composition est l'épreuve de
 * fin de période. Les familles lisent l'écart entre les deux — un élève à 14 de
 * devoirs et 6 de composition n'a pas le même problème qu'un élève régulier à
 * 10.
 *
 * On les recalcule donc depuis les évaluations plutôt que de se contenter de
 * `moyennes_matiere.moyenne`, qui les a déjà fondues.
 *
 * LES MATIÈRES SANS NOTE SONT EXCLUES
 * ------------------------------------
 * Règle du projet, verrouillée par les tests du moteur de calcul : une matière
 * sans note ne compte ni au numérateur ni au dénominateur. Elle apparaît au
 * bulletin — sa ligne existe — mais avec des tirets, et son coefficient n'entre
 * pas dans le total.
 */

interface LigneBrute extends Record<string, unknown> {
  matiere: string;
  groupe: string;
  ordre: number | null;
  coefficient: number;
  moyenne: string | null;
  moyenne_devoirs: string | null;
  note_composition: string | null;
  appreciation_professeur: string | null;
}

const TITRES: Record<string, string> = {
  LITTERAIRE: "Moyenne des matières littéraires",
  SCIENTIFIQUE: "Moyenne des matières scientifiques",
  COMPLEMENTAIRE: "Moyenne des matières complémentaires",
};

const ORDRE_BLOCS = ["LITTERAIRE", "SCIENTIFIQUE", "COMPLEMENTAIRE"];

/**
 * Appréciation littérale d'une moyenne sur 20.
 *
 * Les seuils sont ceux du document papier de l'établissement. Ils ne sont pas
 * paramétrables ici : une appréciation qui changerait d'un bulletin à l'autre
 * ne voudrait plus rien dire.
 */
export function appreciationMoyenne(moyenne: number | null): string {
  if (moyenne === null) return "—";
  if (moyenne >= 16) return "Très Bien";
  if (moyenne >= 14) return "Bien";
  if (moyenne >= 12) return "Assez Bien";
  if (moyenne >= 10) return "Moyen";
  if (moyenne >= 8) return "Passable";
  if (moyenne >= 6) return "Insuffisant";
  return "Très Faible";
}

const nombre = (v: string | null): number | null => (v === null ? null : Number(v));

/**
 * Moyenne d'une famille d'évaluations, ramenée sur 20.
 *
 * Les règles de statut sont celles du moteur de calcul (`domain/notes.ts`),
 * recopiées ici en SQL parce que l'agrégation doit se faire en base — mille
 * notes remontées puis moyennées en JavaScript coûteraient un aller-retour par
 * matière et par élève :
 *
 *   NOTEE                    → la note
 *   ABSENT_ZERO, NON_RENDU   → zéro, l'élève est sanctionné
 *   ABSENT, DISPENSE         → EXCLUE, ni au numérateur ni au dénominateur
 *
 * Ce dernier point est la règle la plus importante du projet : une absence
 * justifiée n'est pas un zéro. `avg()` ignorant les NULL, le `CASE` sans
 * branche `ELSE` produit exactement ce comportement.
 *
 * Les deux colonnes affichées sont DESCRIPTIVES : la moyenne générale de la
 * matière vient de `moyennes_matiere`, calculée par le moteur avec les poids
 * propres à chaque niveau. Elles servent à montrer l'écart entre le travail
 * régulier et l'épreuve de fin de période.
 */
function moyenneFamille(famille: "controle" | "composition") {
  const types =
    famille === "controle"
      ? sql`('INTERROGATION', 'DEVOIR', 'TP', 'ORAL')`
      : sql`('COMPOSITION', 'EXAMEN_BLANC')`;

  return sql`(SELECT round(avg(CASE n.statut
                                 WHEN 'NOTEE'       THEN n.valeur * 20.0 / ev.bareme
                                 WHEN 'ABSENT_ZERO' THEN 0
                                 WHEN 'NON_RENDU'   THEN 0
                               END), 2)::text
                FROM notes n
                JOIN evaluations ev ON ev.id = n.evaluation_id
               WHERE n.inscription_id = mm.inscription_id
                 AND ev.matiere_id = mm.matiere_id
                 AND ev.periode_id = mm.periode_id
                 AND ev.compte_dans_moyenne
                 AND ev.type::text IN ${types})`;
}

export async function chargerBulletin(
  inscriptionId: string,
  periodeId: string,
): Promise<DonneesBulletin | null> {
  // --- Contexte : élève, classe, période, établissement ---------------------
  const contexte = await db.execute<{
    nom: string;
    prenom: string;
    matricule: string;
    classe: string;
    effectif: number;
    annee: string;
    periode: string;
    est_derniere_periode: boolean;
    retards: number;
    heures_manquees: number;
    jours_manques: number;
    statut_inscription: string;
  }>(sql`
    SELECT e.nom, e.prenom, e.matricule,
           c.libelle AS classe,
           (SELECT count(*) FROM inscriptions i2 WHERE i2.classe_id = c.id AND i2.active) AS effectif,
           a.libelle AS annee,
           p.libelle AS periode,
           p.numero = (SELECT max(numero) FROM periodes WHERE annee_id = a.id) AS est_derniere_periode,
           (SELECT count(*) FROM retards r WHERE r.inscription_id = i.id AND r.periode_id = ${periodeId}::uuid) AS retards,
           COALESCE((SELECT sum(ab.nb_heures) FROM absences ab
                      WHERE ab.inscription_id = i.id AND ab.periode_id = ${periodeId}::uuid), 0) AS heures_manquees,
           COALESCE((SELECT count(*) FROM absences ab
                      WHERE ab.inscription_id = i.id AND ab.periode_id = ${periodeId}::uuid
                        AND ab.type = 'JOURNEE'), 0) AS jours_manques,
           i.type::text AS statut_inscription
      FROM inscriptions i
      JOIN eleves e            ON e.id = i.eleve_id
      JOIN classes c           ON c.id = i.classe_id
      JOIN annees_scolaires a  ON a.id = i.annee_id
      JOIN periodes p          ON p.id = ${periodeId}::uuid
     WHERE i.id = ${inscriptionId}::uuid
  `);

  const ctx = contexte.rows[0];
  if (!ctx) return null;

  const etab = await db.execute<Record<string, string | null>>(sql`
    SELECT nom, sigle, adresse, ville, pays, telephone, email,
           ministere_tutelle, autorisation_numero, nom_proviseur, nom_censeur
      FROM etablissement LIMIT 1
  `);
  const e = etab.rows[0] ?? {};

  // --- Les notes, devoirs et compositions séparés ---------------------------
  const lignes = await db.execute<LigneBrute>(sql`
    SELECT m.libelle                       AS matiere,
           m.groupe_bulletin::text         AS groupe,
           m.ordre_bulletin                AS ordre,
           mm.coefficient,
           mm.moyenne::text                AS moyenne,
           ${moyenneFamille("controle")}  AS moyenne_devoirs,
           ${moyenneFamille("composition")} AS note_composition,
           am.appreciation                 AS appreciation_professeur
      FROM moyennes_matiere mm
      JOIN matieres m ON m.id = mm.matiere_id
      -- E-41 : l'appréciation écrite par le professeur, quand elle existe.
      LEFT JOIN appreciations_matiere am
             ON am.inscription_id = mm.inscription_id
            AND am.periode_id     = mm.periode_id
            AND am.matiere_id     = mm.matiere_id
     WHERE mm.inscription_id = ${inscriptionId}::uuid
       AND mm.periode_id = ${periodeId}::uuid
     ORDER BY m.ordre_bulletin NULLS LAST, m.libelle
  `);

  const blocs = ORDRE_BLOCS.map((groupe) => {
    const duGroupe = lignes.rows.filter((l) => l.groupe === groupe);

    const matieres: LigneMatiere[] = duGroupe.map((l) => {
      const moyenne = nombre(l.moyenne);
      return {
        libelle: l.matiere,
        moyenneDevoirs: nombre(l.moyenne_devoirs),
        noteComposition: nombre(l.note_composition),
        moyenne,
        coefficient: Number(l.coefficient),
        points: moyenne === null ? null : moyenne * Number(l.coefficient),
        // La phrase du professeur prime sur la mention déduite de la moyenne
        // (E-41). Cette dernière ne fait que paraphraser le chiffre imprimé
        // juste à côté : « 14 » suivi de « Bien » n'apprend rien à personne.
        // Ce que la famille lit vraiment, c'est « des progrès à l'oral, mais
        // un manque de méthode à l'écrit » — et c'est là-dessus que se règle
        // le travail du trimestre suivant.
        //
        // On retombe sur la mention automatique quand rien n'est saisi : le
        // bulletin reste imprimable même si un professeur est en retard.
        appreciation: (l.appreciation_professeur ?? "").trim() || appreciationMoyenne(moyenne),
      };
    });

    // Seules les matières NOTÉES entrent dans la moyenne du bloc — au
    // numérateur comme au dénominateur.
    const notees = matieres.filter((m) => m.moyenne !== null);
    const coeffs = notees.reduce((t, m) => t + m.coefficient, 0);
    const points = notees.reduce((t, m) => t + (m.points ?? 0), 0);

    return {
      titre: TITRES[groupe]!,
      matieres,
      totalCoefficients: coeffs,
      moyenne: coeffs > 0 ? points / coeffs : null,
    };
  }).filter((b) => b.matieres.length > 0) as BlocMatieres[];

  // --- La conduite est une LIGNE NOTÉE du bulletin --------------------------
  //
  // Elle ne vit pas dans `matieres` mais dans `notes_conduite`, et le document
  // papier lui donne un coefficient — 2 dans l'exemplaire fourni. Sans elle, la
  // moyenne des matières complémentaires est fausse : c'est la note qui pèse le
  // plus lourd de ce bloc.
  const conduite = await db.execute<{ note: string | null; appreciation: string | null; coefficient: string }>(sql`
    SELECT nc.note::text AS note,
           nc.appreciation,
           COALESCE((SELECT valeur FROM parametres WHERE cle = 'coefficient_conduite'), '2') AS coefficient
      FROM notes_conduite nc
     WHERE nc.inscription_id = ${inscriptionId}::uuid
       AND nc.periode_id = ${periodeId}::uuid
  `);

  const c = conduite.rows[0];
  if (c && c.note !== null) {
    const note = Number(c.note);
    const coefficient = Number(c.coefficient) || 2;

    // Elle rejoint les matières complémentaires — le bloc du document papier —
    // ou fonde ce bloc s'il n'existe pas encore.
    let complementaires = blocs.find((b) => b.titre === TITRES.COMPLEMENTAIRE);
    if (!complementaires) {
      complementaires = {
        titre: TITRES.COMPLEMENTAIRE,
        matieres: [],
        totalCoefficients: 0,
        moyenne: null,
      };
      blocs.push(complementaires);
    }

    complementaires.matieres.push({
      libelle: "Conduite",
      moyenneDevoirs: null,
      noteComposition: note,
      moyenne: note,
      coefficient,
      points: note * coefficient,
      // L'appréciation de conduite est écrite par le conseil, pas déduite d'un
      // seuil : « Le conseil » figure sur le document papier quand elle manque.
      appreciation: c.appreciation ?? "Le conseil",
    });

    const notees = complementaires.matieres.filter((m) => m.moyenne !== null);
    complementaires.totalCoefficients = notees.reduce((t, m) => t + m.coefficient, 0);
    const pointsBloc = notees.reduce((t, m) => t + (m.points ?? 0), 0);
    complementaires.moyenne =
      complementaires.totalCoefficients > 0 ? pointsBloc / complementaires.totalCoefficients : null;
  }

  const totalCoefficients = blocs.reduce((t, b) => t + b.totalCoefficients, 0);
  const totalPoints = blocs.reduce(
    (t, b) => t + b.matieres.filter((m) => m.moyenne !== null).reduce((s, m) => s + (m.points ?? 0), 0),
    0,
  );

  // --- Le bulletin enregistré : rang, appréciations, décision ---------------
  const enregistre = await db.execute<{
    moyenne_generale: string | null;
    rang: number | null;
    appreciation_generale: string | null;
    mention: string | null;
    decision: string | null;
    note_conduite: string | null;
  }>(sql`
    SELECT moyenne_generale::text, rang, appreciation_generale,
           mention::text, decision::text, note_conduite::text
      FROM bulletins
     WHERE inscription_id = ${inscriptionId}::uuid AND periode_id = ${periodeId}::uuid
  `);
  const b = enregistre.rows[0];

  // --- Historique des périodes déjà closes ----------------------------------
  const historique = await db.execute<{ libelle: string; moyenne: string | null; rang: number | null }>(sql`
    SELECT p.libelle, bu.moyenne_generale::text AS moyenne, bu.rang
      FROM periodes p
      LEFT JOIN bulletins bu ON bu.periode_id = p.id AND bu.inscription_id = ${inscriptionId}::uuid
     WHERE p.annee_id = (SELECT annee_id FROM inscriptions WHERE id = ${inscriptionId}::uuid)
     ORDER BY p.numero
  `);

  const moyennes = historique.rows.map((h) => nombre(h.moyenne)).filter((m): m is number => m !== null);
  const moyenneAnnuelle = moyennes.length > 0 ? moyennes.reduce((a, x) => a + x, 0) / moyennes.length : null;

  return {
    etablissement: {
      nom: e.nom ?? "Lycée Guergné La Renaissance",
      sigle: e.sigle ?? "LGR",
      adresse: e.adresse ?? null,
      ville: e.ville ?? null,
      pays: e.pays ?? null,
      telephone: e.telephone ?? null,
      email: e.email ?? null,
      ministereTutelle: e.ministere_tutelle ?? null,
      autorisationNumero: e.autorisation_numero ?? null,
      nomProviseur: e.nom_proviseur ?? null,
      nomCenseur: e.nom_censeur ?? null,
    },
    anneeScolaire: ctx.annee,
    periodeLibelle: ctx.periode,

    eleve: {
      nomComplet: `${ctx.prenom} ${ctx.nom}`,
      matricule: ctx.matricule,
      statut: ctx.statut_inscription === "INSCRIPTION" ? "Nouveau" : "Ancien",
      classe: ctx.classe,
      effectifClasse: Number(ctx.effectif),
      retards: Number(ctx.retards),
      heuresManquees: Number(ctx.heures_manquees),
      joursManques: Number(ctx.jours_manques),
    },

    blocs,
    totalCoefficients,
    totalPoints,
    moyenneGenerale: b ? nombre(b.moyenne_generale) : totalCoefficients > 0 ? totalPoints / totalCoefficients : null,
    rang: b?.rang ?? null,

    historique: historique.rows.map((h) => ({
      libelle: h.libelle,
      moyenne: nombre(h.moyenne),
      rang: h.rang,
    })),
    moyenneAnnuelle,
    // Le rang annuel n'est arrêté qu'au conseil de fin d'année : l'inventer
    // avant reviendrait à classer des élèves sur des trimestres incomplets.
    rangAnnuel: ctx.est_derniere_periode ? (b?.rang ?? null) : null,

    appreciationTravail: b?.appreciation_generale ?? null,
    appreciationDiscipline: c?.appreciation ?? (b?.note_conduite ? `Conduite : ${b.note_conduite}/20` : null),
    decisionConseil: b?.mention ? String(b.mention).replace(/_/g, " ") : null,
    orientation: ctx.est_derniere_periode && b?.decision ? String(b.decision).replace(/_/g, " ") : null,

    ville: e.ville ?? "N'Djamena",
    dateEdition: new Date().toLocaleDateString("fr-FR"),
  };
}
