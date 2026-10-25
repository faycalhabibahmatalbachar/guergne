import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import type { BlocMatieres, DonneesBulletin, LigneMatiere } from "@/server/pdf/bulletin";
import { libelleAppreciationTravail } from "./appreciations-travail";

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
 * bulletin — sa ligne existe — mais avec les cellules de notes vides, et son coefficient n'entre
 * pas dans le total.
 */

interface LigneBrute extends Record<string, unknown> {
  code: string;
  matiere: string;
  groupe: string;
  ordre: number | null;
  coefficient: number | null;
  moyenne: string | null;
  moyenne_devoirs: string | null;
  note_composition: string | null;
  appreciation_professeur: string | null;
}

const TITRES: Record<string, string> = {
  LITTERAIRE: "Moyenne des Matières Littéraires",
  SCIENTIFIQUE: "Moyenne des Matières Scientifiques",
  COMPLEMENTAIRE: "Moyenne des Matières Complémentaires",
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
  if (moyenne === null) return "";
  if (moyenne >= 18) return "Excellent";
  if (moyenne >= 16) return "Très Bien";
  if (moyenne >= 14) return "Bien";
  if (moyenne >= 12) return "Assez Bien";
  if (moyenne >= 11) return "Passable";
  if (moyenne >= 10) return "Moyen";
  if (moyenne >= 8) return "Insuffisant";
  if (moyenne >= 7) return "Faible";
  if (moyenne >= 5) return "Très Faible";
  if (moyenne >= 2) return "Médiocre";
  return "Travail Nul";
}
const nombre = (v: string | null): number | null => (v === null ? null : Number(v));

function libelleDecisionConseil(decision: string | null): string | null {
  if (!decision) return null;
  const libelles: Record<string, string> = {
    ADMIS: "Admis (e) en Classe Supérieure",
    ADMIS_CONDITION: "Admis (e) en Classe Supérieure mais efforts à fournir",
    REDOUBLE: "Admis (e)  à Redoubler",
    EXCLU: "Exclu (e)",
    REORIENTE: "Réorienté (e)",
    EN_ATTENTE: "En attente d'une décision",
  };
  return libelles[decision] ?? decision.replace(/_/g, " ");
}

function libelleOrientation(moyenneAnnuelle: number | null, conduite: number | null): string | null {
  if (moyenneAnnuelle === null) return null;
  const noteConduite = conduite ?? 0;
  if (moyenneAnnuelle >= 9.99 && noteConduite >= 8) return "Admis (e) en Classe Supérieure";
  if (moyenneAnnuelle >= 9.5 && noteConduite >= 8) return "Admis (e) en Classe Supérieure mais efforts à fournir";
  if (moyenneAnnuelle >= 6 && noteConduite >= 8) return "Admis (e)  à Redoubler";
  return "Exclu (e)";
}

function libelleMention(mention: string | null): string | null {
  if (!mention || mention === "AUCUNE") return null;
  const libelles: Record<string, string> = {
    FELICITATIONS: "Félicitations",
    ENCOURAGEMENTS: "Encouragement",
    TABLEAU_HONNEUR: "Tableau d'honneur",
    AVERTISSEMENT_TRAVAIL: "Avertissement",
    AVERTISSEMENT_CONDUITE: "Avertissement",
    BLAME: "Blâme",
  };
  return libelles[mention] ?? mention.replace(/_/g, " ");
}

function libelleTravail(moyenne: number | null): string | null {
  return libelleAppreciationTravail(moyenne);
}

function libelleDiscipline(note: number | null): string | null {
  if (note === null) return null;
  if (note >= 16) return "Élève exemplaire";
  if (note >= 13) return "Assez bon élève";
  if (note >= 10) return "Manque du serieux";
  if (note >= 7) return "Avertissement";
  return "Blâme";
}

function libelleDecisionTravail(moyenne: number | null): string | null {
  if (moyenne === null) return null;
  if (moyenne >= 18) return "Excellent Travail";
  if (moyenne >= 16) return "Très Bon Travail";
  if (moyenne >= 14) return "Bon Travail";
  if (moyenne >= 12) return "Assez Bon Travail";
  if (moyenne >= 11) return "Travail Passable";
  if (moyenne >= 10) return "Travail Moyen";
  if (moyenne >= 8) return "Travail Insuffisant";
  if (moyenne >= 7) return "Travail Faible";
  if (moyenne >= 5) return "Travail Très Faible";
  if (moyenne >= 2) return "Travail Médiocre";
  return "Travail Nul";
}
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
function moyenneFamille(
  famille: "controle" | "composition",
  inscriptionId: string,
  periodeId: string,
) {
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
               WHERE n.inscription_id = ${inscriptionId}::uuid
                 AND ev.matiere_id = m.id
                 AND ev.periode_id = ${periodeId}::uuid
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
    est_redoublant: boolean;
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
           i.type::text AS statut_inscription,
           i.est_redoublant AS est_redoublant
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
    SELECT m.code AS code,
           CASE WHEN m.code = 'PC' THEN 'Physique - Chimie' ELSE m.libelle END AS matiere,
           m.groupe_bulletin::text AS groupe,
           m.ordre_bulletin AS ordre,
           COALESCE(mm.coefficient, co.coefficient, CASE WHEN m.code = 'PC' AND n.code IN ('6EME', '5EME') THEN 2::numeric END)::float8 AS coefficient,
           mm.moyenne::text AS moyenne,
           ${moyenneFamille("controle", inscriptionId, periodeId)} AS moyenne_devoirs,
           ${moyenneFamille("composition", inscriptionId, periodeId)} AS note_composition,
           am.appreciation AS appreciation_professeur
      FROM inscriptions i
      JOIN classes cl ON cl.id = i.classe_id
      JOIN matieres m ON m.active
      LEFT JOIN niveaux n ON n.id = cl.niveau_id
      LEFT JOIN LATERAL (
        SELECT co.coefficient
          FROM coefficients co
         WHERE co.annee_id = cl.annee_id
           AND co.niveau_id = cl.niveau_id
           AND co.matiere_id = m.id
           AND (co.serie_id IS NULL OR co.serie_id IS NOT DISTINCT FROM cl.serie_id)
         ORDER BY CASE WHEN co.serie_id IS NOT DISTINCT FROM cl.serie_id THEN 0 ELSE 1 END
         LIMIT 1
      ) co ON TRUE
      LEFT JOIN moyennes_matiere mm
             ON mm.inscription_id = i.id
            AND mm.periode_id = ${periodeId}::uuid
            AND mm.matiere_id = m.id
      LEFT JOIN appreciations_matiere am
             ON am.inscription_id = i.id
            AND am.periode_id = ${periodeId}::uuid
            AND am.matiere_id = m.id
     WHERE i.id = ${inscriptionId}::uuid
       AND (co.coefficient IS NOT NULL OR mm.coefficient IS NOT NULL OR m.code = 'PC' OR n.code IN ('6EME', '5EME'))
     ORDER BY m.ordre_bulletin NULLS LAST, m.libelle
  `);

  const niveauModele = ctx.classe.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const modeleCollege = /^6/.test(niveauModele) || /^5/.test(niveauModele) || niveauModele.includes("sixieme") || niveauModele.includes("cinquieme");
  const periodeNormalisee = ctx.periode.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const premierTrimestre = /^1er|^1e|^premier/i.test(periodeNormalisee);

  const modeleCollegeParGroupe: Record<string, Array<{ libelle: string; coefficient: number; cles: string[] }>> = {
    LITTERAIRE: [
      { libelle: "Rédaction", coefficient: 2, cles: ["redaction", "RED"] },
      { libelle: "Dictée - Questions", coefficient: 2, cles: ["dicteequestions", "DIC", "DICTEE"] },
      { libelle: "Arabe", coefficient: 2, cles: ["arabe", "AR"] },
      { libelle: "Anglais", coefficient: 2, cles: ["anglais", "ANG"] },
      { libelle: "Histoire", coefficient: 2, cles: ["histoire", "HIST"] },
      { libelle: "Géographie", coefficient: 2, cles: ["geographie", "GEO"] },
    ],
    SCIENTIFIQUE: [
      { libelle: "Mathématiques", coefficient: 4, cles: ["mathematiques", "MATH"] },
      { libelle: "Physique - Chimie", coefficient: 2, cles: ["physiquechimie", "PC"] },
      { libelle: "S.V.T", coefficient: 2, cles: ["svt", "sciencesdelavieetdelaterre", "SVT"] },
    ],
    COMPLEMENTAIRE: [
      ...(premierTrimestre
        ? [{ libelle: "Education Islamique", coefficient: 1, cles: ["educationislamique", "EDUISLAM", "ISLAM"] }]
        : []),
      { libelle: "Education Civique et Morale", coefficient: 2, cles: ["educationciviqueetmorale", "ECM"] },
      ...(premierTrimestre
        ? []
        : [{ libelle: "Education Islamique", coefficient: 1, cles: ["educationislamique", "EDUISLAM", "ISLAM"] }]),
      { libelle: "Informatique", coefficient: 1, cles: ["informatique", "INFO"] },
    ],
  };

  const normaliserCleMatiere = (valeur: string) =>
    valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]/g, "");

  const blocs = ORDRE_BLOCS.map((groupe) => {
    const duGroupe = lignes.rows.filter((l) => l.groupe === groupe);

    let matieres: LigneMatiere[];
    if (modeleCollege) {
      // L'ordre et les coefficients sont ceux des modèles Excel fournis.
      // Les notes ne sont remplies qu'à partir de vrais enregistrements de matière.
      matieres = (modeleCollegeParGroupe[groupe] ?? []).map((spec) => {
        const clefs = spec.cles.map(normaliserCleMatiere);
        const ligne = lignes.rows.find((l) => {
          const libelle = normaliserCleMatiere(l.matiere);
          const code = normaliserCleMatiere(l.code);
          return clefs.includes(libelle) || clefs.includes(code);
        });
        const moyenne = ligne ? nombre(ligne.moyenne) : null;
        return {
          libelle: spec.libelle,
          moyenneDevoirs: ligne ? nombre(ligne.moyenne_devoirs) : null,
          noteComposition: ligne ? nombre(ligne.note_composition) : null,
          moyenne,
          coefficient: spec.coefficient,
          points: moyenne === null ? null : moyenne * spec.coefficient,
          appreciation: (ligne?.appreciation_professeur ?? "").trim() || appreciationMoyenne(moyenne),
        };
      });
    } else {
      matieres = duGroupe.map((l) => {
        const moyenne = nombre(l.moyenne);
        return {
          libelle: l.matiere,
          moyenneDevoirs: nombre(l.moyenne_devoirs),
          noteComposition: nombre(l.note_composition),
          moyenne,
          coefficient: l.coefficient === null ? null : Number(l.coefficient),
          points: moyenne === null || l.coefficient === null ? null : moyenne * Number(l.coefficient),
          appreciation: (l.appreciation_professeur ?? "").trim() || appreciationMoyenne(moyenne),
        };
      });
    }

    // Les coefficients du programme restent visibles même si une saisie manque.
    // Seules les matières avec une note entrent dans la moyenne du bloc.
    const notees = matieres.filter((m) => m.moyenne !== null && m.coefficient !== null);
    const coeffs = modeleCollege
      ? matieres.reduce((t, m) => t + (m.coefficient ?? 0), 0)
      : notees.reduce((t, m) => t + (m.coefficient ?? 0), 0);
    const points = notees.reduce((t, m) => t + (m.points ?? 0), 0);
    const coefficientsNotes = notees.reduce((t, m) => t + (m.coefficient ?? 0), 0);

    return {
      titre: TITRES[groupe]!,
      matieres,
      totalCoefficients: coeffs,
      moyenne: coefficientsNotes > 0 ? points / coefficientsNotes : null,
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
      FROM (SELECT 1) AS une_ligne
      LEFT JOIN notes_conduite nc
        ON nc.inscription_id = ${inscriptionId}::uuid
       AND nc.periode_id = ${periodeId}::uuid
  `);

  const c = conduite.rows[0];
  if (c || modeleCollege) {
    const note = c?.note === null || c?.note === undefined ? null : Number(c.note);
    const coefficient = c ? Number(c.coefficient) || 2 : 2;

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
      points: note === null ? null : note * coefficient,
      // L'appréciation de conduite est écrite par le conseil, pas déduite d'un
      // seuil : « Le conseil » figure sur le document papier quand elle manque.
      appreciation: c?.appreciation ?? "Le conseil",
    });

    const notees = complementaires.matieres.filter((m) => m.moyenne !== null && m.coefficient !== null);
    const coefficientsNotesBloc = notees.reduce((t, m) => t + (m.coefficient ?? 0), 0);
    complementaires.totalCoefficients = modeleCollege
      ? complementaires.matieres.reduce((t, m) => t + (m.coefficient ?? 0), 0)
      : coefficientsNotesBloc;
    const pointsBloc = notees.reduce((t, m) => t + (m.points ?? 0), 0);
    complementaires.moyenne =
      coefficientsNotesBloc > 0 ? pointsBloc / coefficientsNotesBloc : null;
  }

  const totalCoefficients = blocs.reduce((t, b) => t + b.totalCoefficients, 0);
  const totalCoefficientsNotes = blocs.reduce(
    (total, bloc) => total + bloc.matieres
      .filter((m) => m.moyenne !== null && m.coefficient !== null)
      .reduce((s, m) => s + (m.coefficient ?? 0), 0),
    0,
  );
  const totalPoints = blocs.reduce(
    (t, b) => t + b.matieres
      .filter((m) => m.moyenne !== null && m.coefficient !== null)
      .reduce((s, m) => s + (m.points ?? 0), 0),
    0,
  );

  // --- Le bulletin enregistré : rang, appréciations, décision ---------------
  const enregistre = await db.execute<{
    moyenne_generale: string | null;
    rang: number | null;
    appreciation_generale: string | null;
    appreciation_travail: string | null;
    mention: string | null;
    decision: string | null;
    note_conduite: string | null;
  }>(sql`
    SELECT moyenne_generale::text, rang, appreciation_generale, appreciation_travail,
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

  // Le rang annuel se calcule sur les MOYENNES ANNUELLES de tous les élèves
  // de la même classe, pas sur le rang du dernier trimestre. Le bulletin Excel
  // réserve une ligne distincte à ce classement annuel.
  const classementAnnuel = await db.execute<{ rang_annuel: number | null }>(sql`
    WITH moyennes_annuelles AS (
      SELECT i.id AS inscription_id,
             AVG(b.moyenne_generale) AS moyenne_annuelle
        FROM inscriptions i
        LEFT JOIN bulletins b
          ON b.inscription_id = i.id
         AND b.periode_id IN (
           SELECT p2.id FROM periodes p2 WHERE p2.annee_id = i.annee_id
         )
       WHERE i.classe_id = (
         SELECT i2.classe_id FROM inscriptions i2 WHERE i2.id = ${inscriptionId}::uuid
       )
         AND i.active
       GROUP BY i.id
    ),
    rangs AS (
      SELECT inscription_id,
             CASE WHEN moyenne_annuelle IS NULL THEN NULL
                  ELSE RANK() OVER (ORDER BY moyenne_annuelle DESC)::int
              END AS rang_annuel
        FROM moyennes_annuelles
    )
    SELECT rang_annuel FROM rangs WHERE inscription_id = ${inscriptionId}::uuid
  `);
  const rangAnnuelCalcule = classementAnnuel.rows[0]?.rang_annuel ?? null;

  // L'appréciation "Travail" vient toujours du barème, selon la moyenne.
  // Le commentaire libre du conseil reste affiché séparément dans le bulletin.
  const moyenneCourante = b?.moyenne_generale !== null && b?.moyenne_generale !== undefined
    ? nombre(b.moyenne_generale)
    : totalCoefficientsNotes > 0 ? totalPoints / totalCoefficientsNotes : null;
  const moyennePourAppreciationTravail = ctx.est_derniere_periode ? moyenneAnnuelle : moyenneCourante;
  const appreciationGenerale = b?.appreciation_generale?.trim() || null;

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
      statut: ctx.est_redoublant ? "Redoublant" : ctx.statut_inscription === "INSCRIPTION" ? "Nouveau" : "Ancien",
      classe: ctx.classe,
      effectifClasse: Number(ctx.effectif),
      retards: Number(ctx.retards),
      heuresManquees: Number(ctx.heures_manquees),
      joursManques: Number(ctx.jours_manques),
    },

    blocs,
    totalCoefficients,
    totalPoints,
    moyenneGenerale: b ? nombre(b.moyenne_generale) : totalCoefficientsNotes > 0 ? totalPoints / totalCoefficientsNotes : null,
    rang: b?.rang ?? null,

    historique: historique.rows.map((h) => ({
      libelle: h.libelle,
      moyenne: nombre(h.moyenne),
      rang: h.rang,
    })),
    // Le modèle Excel laisse la ligne annuelle vide tant que le conseil de fin
    // d'année n'a pas statué ; ne pas afficher la moyenne T1 comme une annuelle.
    moyenneAnnuelle: ctx.est_derniere_periode ? moyenneAnnuelle : null,
    // Le rang annuel n'est affiché qu'à la dernière période. Il est calculé
    // à partir des moyennes annuelles de la classe, avec ex æquo au même rang.
    rangAnnuel: ctx.est_derniere_periode ? rangAnnuelCalcule : null,

    // Les valeurs écrites par l'administration restent prioritaires ; les
    // cellules non saisies suivent les formules du classeur Excel.
    appreciationTravail: ctx.est_derniere_periode
      ? libelleTravail(moyennePourAppreciationTravail)
      : (b?.appreciation_travail ?? libelleTravail(moyennePourAppreciationTravail)),
    appreciationGenerale,
    appreciationDiscipline: c?.appreciation ?? libelleDiscipline(
      c?.note !== null && c?.note !== undefined ? Number(c.note) :
      b?.note_conduite !== null && b?.note_conduite !== undefined ? Number(b.note_conduite) : null,
    ),
    decisionConseil: libelleMention(b?.mention ?? null) ?? libelleDecisionTravail(
      ctx.est_derniere_periode ? moyenneAnnuelle : (b ? nombre(b.moyenne_generale) : totalCoefficients > 0 ? totalPoints / totalCoefficients : null),
    ),
    orientation: ctx.est_derniere_periode
      ? libelleDecisionConseil(b?.decision ?? null) ?? libelleOrientation(
          moyenneAnnuelle,
          c?.note !== null && c?.note !== undefined ? Number(c.note) :
            b?.note_conduite !== null && b?.note_conduite !== undefined ? Number(b.note_conduite) : null,
        )
      : null,

    ville: e.ville ?? "N'Djamena",
    dateEdition: new Date().toISOString().slice(0, 10),
  };
}
