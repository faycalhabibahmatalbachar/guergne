/**
 * Moteur de calcul des moyennes, rangs et statistiques de classe.
 *
 * Ce module est volontairement PUR : aucune dépendance à HTTP, à la base de
 * données ou à React. Une erreur de moyenne sur un bulletin est une faute
 * grave vis-à-vis des familles — cette logique doit donc être testable en
 * isolation, et elle l'est (voir `notes.test.ts`).
 *
 * Conventions du système francophone appliquées ici :
 *   - Les notes sont ramenées sur 20 lorsque le barème diffère.
 *   - Une absence justifiée n'est PAS un zéro : elle est exclue du calcul.
 *   - La moyenne d'une matière pondère chaque TYPE d'évaluation
 *     (interrogations, devoirs, compositions) selon son poids propre.
 *   - La moyenne générale pondère chaque matière par son coefficient.
 *   - Les ex æquo partagent le même rang, et le rang suivant est décalé
 *     (classement dit « olympique » : 1, 2, 2, 4).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatutNote =
  | "NOTEE"
  | "ABSENT"
  | "ABSENT_ZERO"
  | "DISPENSE"
  | "NON_RENDU";

export type TypeEvaluation =
  | "INTERROGATION"
  | "DEVOIR"
  | "COMPOSITION"
  | "EXAMEN_BLANC"
  | "TP"
  | "ORAL";

/** Une note telle qu'elle sort de la base, avec le contexte de son évaluation. */
export interface NoteBrute {
  valeur: number | null;
  statut: StatutNote;
  /** Barème de l'évaluation (20 dans l'immense majorité des cas). */
  bareme: number;
  /** Poids de cette évaluation à l'intérieur de son type. */
  poids: number;
  type: TypeEvaluation;
  compteDansMoyenne: boolean;
}

/** Pondération des types d'évaluation, issue de la table `coefficients`. */
export interface Ponderation {
  interrogation: number;
  devoir: number;
  composition: number;
}

export const PONDERATION_PAR_DEFAUT: Ponderation = {
  interrogation: 1,
  devoir: 1,
  composition: 2,
};

export interface MoyenneMatiere {
  matiereId: string;
  moyenne: number | null;
  coefficient: number;
  /** moyenne × coefficient — les « points » du bulletin. */
  points: number | null;
  nbEvaluations: number;
}

export interface MoyenneGenerale {
  moyenne: number | null;
  totalPoints: number;
  totalCoefficients: number;
}

export interface EntreeClassement {
  inscriptionId: string;
  moyenne: number | null;
}

export interface RangCalcule {
  inscriptionId: string;
  moyenne: number | null;
  rang: number | null;
  estExAequo: boolean;
}

export interface StatistiquesClasse {
  effectif: number;
  /** Nombre d'élèves réellement notés (une moyenne nulle est exclue). */
  nbNotes: number;
  moyenne: number | null;
  min: number | null;
  max: number | null;
  ecartType: number | null;
  /** Nombre d'élèves ayant la moyenne (≥ 10/20 par défaut). */
  nbAdmis: number;
  tauxReussite: number | null;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const NOTE_MAX = 20;

/**
 * Arrondi commercial (au plus proche, .5 vers le haut) à N décimales.
 *
 * La multiplication naïve `Math.round(v * 100) / 100` est FAUSSE sur les
 * valeurs limites : 9.995 est stocké en binaire comme 9.99499999999999957,
 * donc `9.995 * 100` vaut 999.4999… et l'arrondi rend 9.99 au lieu de 10.00.
 * Sur une moyenne générale, c'est exactement la différence entre « admis » et
 * « non admis » — le défaut n'est donc pas acceptable ici.
 *
 * On décale la virgule via la notation exponentielle, où la conversion passe
 * par le parseur décimal et non par une multiplication flottante.
 */
export function arrondir(valeur: number, decimales = 2): number {
  if (!Number.isFinite(valeur)) {
    throw new Error("Valeur à arrondir invalide (NaN ou infinie).");
  }

  const decaler = (v: number, n: number): number => {
    const [mantisse, exposant] = v.toExponential().split("e");
    return Number(`${mantisse}e${Number(exposant) + n}`);
  };

  return decaler(Math.round(decaler(valeur, decimales)), -decimales);
}

/**
 * Détermine la contribution d'une note au calcul.
 * Retourne `null` si la note doit être ignorée (absence justifiée, dispense).
 */
function valeurRetenue(note: NoteBrute): number | null {
  if (!note.compteDansMoyenne) return null;

  switch (note.statut) {
    case "NOTEE":
      return note.valeur;
    // Une absence non justifiée sanctionnée, ou un travail non rendu,
    // valent zéro et entrent bien dans la moyenne.
    case "ABSENT_ZERO":
    case "NON_RENDU":
      return 0;
    // Absence justifiée et dispense : l'élève n'est pas pénalisé.
    case "ABSENT":
    case "DISPENSE":
      return null;
  }
}

/** Ramène une note sur 20 quel que soit le barème de l'évaluation. */
function normaliserSur20(valeur: number, bareme: number): number {
  if (bareme <= 0) throw new Error("Barème invalide : il doit être strictement positif.");
  if (bareme === NOTE_MAX) return valeur;
  return (valeur * NOTE_MAX) / bareme;
}

/** Regroupe les types d'évaluation sous les trois familles pondérées. */
function famillePonderation(type: TypeEvaluation): keyof Ponderation {
  switch (type) {
    case "COMPOSITION":
    case "EXAMEN_BLANC":
      return "composition";
    case "DEVOIR":
    case "TP":
      return "devoir";
    case "INTERROGATION":
    case "ORAL":
      return "interrogation";
  }
}

// ---------------------------------------------------------------------------
// Moyenne d'une matière
// ---------------------------------------------------------------------------

/**
 * Moyenne d'un élève dans une matière, pour une période.
 *
 * Deux niveaux de pondération :
 *   1. À l'intérieur d'un type, chaque évaluation pèse selon son `poids`.
 *   2. Entre les types, la pondération vient de la configuration de la matière
 *      (par défaut : interrogations 1, devoirs 1, composition 2).
 *
 * Un type sans aucune note valide est simplement ignoré — un élève noté
 * uniquement sur des interrogations obtient la moyenne de ses interrogations,
 * et non une moyenne minorée par une composition inexistante.
 *
 * @returns la moyenne sur 20, ou `null` si aucune note exploitable.
 */
export function calculerMoyenneMatiere(
  notes: readonly NoteBrute[],
  ponderation: Ponderation = PONDERATION_PAR_DEFAUT,
  decimales = 2,
): { moyenne: number | null; nbEvaluations: number } {
  // Accumulateurs par famille de pondération
  const familles = new Map<keyof Ponderation, { somme: number; poids: number }>();
  let nbEvaluations = 0;

  for (const note of notes) {
    const brute = valeurRetenue(note);
    if (brute === null) continue;

    if (note.poids <= 0) {
      throw new Error("Poids d'évaluation invalide : il doit être strictement positif.");
    }

    const sur20 = normaliserSur20(brute, note.bareme);
    const famille = famillePonderation(note.type);
    const acc = familles.get(famille) ?? { somme: 0, poids: 0 };

    acc.somme += sur20 * note.poids;
    acc.poids += note.poids;
    familles.set(famille, acc);
    nbEvaluations += 1;
  }

  if (familles.size === 0) return { moyenne: null, nbEvaluations: 0 };

  let sommePonderee = 0;
  let sommePoidsTypes = 0;

  for (const [famille, acc] of familles) {
    const moyenneType = acc.somme / acc.poids;
    const poidsType = ponderation[famille];
    if (poidsType <= 0) continue;
    sommePonderee += moyenneType * poidsType;
    sommePoidsTypes += poidsType;
  }

  if (sommePoidsTypes === 0) return { moyenne: null, nbEvaluations };

  return {
    moyenne: arrondir(sommePonderee / sommePoidsTypes, decimales),
    nbEvaluations,
  };
}

// ---------------------------------------------------------------------------
// Moyenne générale
// ---------------------------------------------------------------------------

/**
 * Moyenne générale : somme des points divisée par la somme des coefficients.
 *
 * Les matières sans moyenne (aucune évaluation, ou élève dispensé sur toute
 * la période) sont exclues du numérateur ET du dénominateur — sinon un élève
 * dispensé d'EPS verrait sa moyenne générale mécaniquement tirée vers le bas.
 */
export function calculerMoyenneGenerale(
  moyennes: readonly MoyenneMatiere[],
  decimales = 2,
): MoyenneGenerale {
  let totalPoints = 0;
  let totalCoefficients = 0;

  for (const m of moyennes) {
    if (m.moyenne === null) continue;
    if (m.coefficient <= 0) {
      throw new Error("Coefficient invalide : il doit être strictement positif.");
    }
    totalPoints += m.moyenne * m.coefficient;
    totalCoefficients += m.coefficient;
  }

  if (totalCoefficients === 0) {
    return { moyenne: null, totalPoints: 0, totalCoefficients: 0 };
  }

  return {
    moyenne: arrondir(totalPoints / totalCoefficients, decimales),
    totalPoints: arrondir(totalPoints, decimales),
    totalCoefficients: arrondir(totalCoefficients, decimales),
  };
}

/** Construit une ligne de bulletin à partir d'une moyenne et d'un coefficient. */
export function construireMoyenneMatiere(
  matiereId: string,
  moyenne: number | null,
  coefficient: number,
  nbEvaluations: number,
  decimales = 2,
): MoyenneMatiere {
  return {
    matiereId,
    moyenne,
    coefficient,
    points: moyenne === null ? null : arrondir(moyenne * coefficient, decimales),
    nbEvaluations,
  };
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

/**
 * Classement d'une classe, avec gestion des ex æquo.
 *
 * Classement « olympique » : deux élèves à 14,25 partagent le rang 3, et le
 * suivant est 5ème (pas 4ème). C'est la convention en usage sur les bulletins.
 *
 * Les élèves sans moyenne (arrivés en cours de période, dispensés) reçoivent
 * `rang: null` et n'occupent aucune place au classement.
 */
export function calculerRangs(entrees: readonly EntreeClassement[]): RangCalcule[] {
  const notes = entrees.filter((e) => e.moyenne !== null) as Array<
    EntreeClassement & { moyenne: number }
  >;
  const sansNote = entrees.filter((e) => e.moyenne === null);

  const triees = [...notes].sort((a, b) => b.moyenne - a.moyenne);

  // Comptage des occurrences pour détecter les ex æquo
  const occurrences = new Map<number, number>();
  for (const e of triees) {
    occurrences.set(e.moyenne, (occurrences.get(e.moyenne) ?? 0) + 1);
  }

  const resultats: RangCalcule[] = [];
  let rangCourant = 0;
  let moyennePrecedente: number | null = null;

  triees.forEach((entree, index) => {
    // Le rang ne progresse que lorsque la moyenne change : les ex æquo
    // conservent le rang du premier de leur groupe.
    if (moyennePrecedente === null || entree.moyenne !== moyennePrecedente) {
      rangCourant = index + 1;
      moyennePrecedente = entree.moyenne;
    }

    resultats.push({
      inscriptionId: entree.inscriptionId,
      moyenne: entree.moyenne,
      rang: rangCourant,
      estExAequo: (occurrences.get(entree.moyenne) ?? 0) > 1,
    });
  });

  for (const e of sansNote) {
    resultats.push({
      inscriptionId: e.inscriptionId,
      moyenne: null,
      rang: null,
      estExAequo: false,
    });
  }

  return resultats;
}

// ---------------------------------------------------------------------------
// Statistiques de classe
// ---------------------------------------------------------------------------

/**
 * Statistiques d'une classe pour une période ou une matière.
 * Alimente les colonnes comparatives du bulletin et les tableaux de pilotage.
 */
export function calculerStatistiquesClasse(
  moyennes: readonly (number | null)[],
  seuilAdmission = 10,
  decimales = 2,
): StatistiquesClasse {
  const valides = moyennes.filter((m): m is number => m !== null);
  const effectif = moyennes.length;

  if (valides.length === 0) {
    return {
      effectif,
      nbNotes: 0,
      moyenne: null,
      min: null,
      max: null,
      ecartType: null,
      nbAdmis: 0,
      tauxReussite: null,
    };
  }

  const somme = valides.reduce((acc, v) => acc + v, 0);
  const moyenne = somme / valides.length;

  // Écart-type de population : on décrit la classe entière, pas un échantillon.
  const variance =
    valides.reduce((acc, v) => acc + (v - moyenne) ** 2, 0) / valides.length;

  const nbAdmis = valides.filter((v) => v >= seuilAdmission).length;

  return {
    effectif,
    nbNotes: valides.length,
    moyenne: arrondir(moyenne, decimales),
    min: arrondir(Math.min(...valides), decimales),
    max: arrondir(Math.max(...valides), decimales),
    ecartType: arrondir(Math.sqrt(variance), decimales),
    nbAdmis,
    tauxReussite: arrondir((nbAdmis / valides.length) * 100, decimales),
  };
}

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

export type Mention =
  | "FELICITATIONS"
  | "ENCOURAGEMENTS"
  | "TABLEAU_HONNEUR"
  | "AVERTISSEMENT_TRAVAIL"
  | "AVERTISSEMENT_CONDUITE"
  | "BLAME"
  | "AUCUNE";

/**
 * Proposition de mention à partir de la moyenne générale et de la conduite.
 *
 * C'est une PROPOSITION : le conseil de classe reste souverain et peut la
 * modifier. Le système ne décide jamais seul d'une mention (UC-F05).
 */
export function proposerMention(
  moyenneGenerale: number | null,
  noteConduite: number | null,
  heuresAbsenceNonJustifiees = 0,
): Mention {
  if (moyenneGenerale === null) return "AUCUNE";

  // La conduite prime : un bon élève au comportement problématique ne reçoit
  // pas de félicitations.
  if (noteConduite !== null && noteConduite < 8) return "AVERTISSEMENT_CONDUITE";
  if (heuresAbsenceNonJustifiees >= 20) return "AVERTISSEMENT_CONDUITE";

  if (moyenneGenerale >= 16) return "FELICITATIONS";
  if (moyenneGenerale >= 14) return "ENCOURAGEMENTS";
  if (moyenneGenerale >= 12) return "TABLEAU_HONNEUR";
  if (moyenneGenerale < 8) return "AVERTISSEMENT_TRAVAIL";

  return "AUCUNE";
}
