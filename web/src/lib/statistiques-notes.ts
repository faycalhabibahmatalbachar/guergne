/**
 * Calcul statistique d'une série de notes (E-42).
 *
 * Module PUR, sans accès base : c'est ce qui le rend testable. La règle des
 * absents et la normalisation sur 20 sont exactement le genre de détail qui se
 * casse en silence, et un bulletin faux ne se remarque qu'au conseil de classe.
 *
 * CE QUI COMPTE N'EST PAS LA MOYENNE, C'EST LA FORME DE LA DISTRIBUTION
 * ----------------------------------------------------------------------
 * Deux devoirs à 10 de moyenne n'ont rien à voir : l'un peut être groupé entre
 * 8 et 12, l'autre couper la classe en deux paquets à 5 et à 15. Le premier
 * décrit une classe homogène ; le second, un chapitre compris par la moitié
 * seulement — et c'est celui-là qu'il faut reprendre.
 *
 * L'ÉCART ENTRE MOYENNE ET MÉDIANE EST L'INDICATEUR LE PLUS UTILE
 * ----------------------------------------------------------------
 * Une médiane nettement supérieure à la moyenne signale que quelques très
 * mauvaises notes tirent l'ensemble vers le bas : la classe va mieux que sa
 * moyenne ne le dit. L'inverse signale que quelques excellents résultats
 * masquent une majorité en difficulté. La moyenne seule ne dit ni l'un ni
 * l'autre.
 */

export interface TrancheNotes {
  libelle: string;
  min: number;
  /** Borne haute EXCLUE, sauf pour la dernière tranche. */
  max: number;
  effectif: number;
}

export interface Statistiques {
  bareme: number;
  /** Élèves de la classe, tous statuts confondus. */
  effectif: number;
  /** Notes retenues dans le calcul (hors absents justifiés et dispensés). */
  notees: number;
  nonSaisies: number;
  absentsExclus: number;
  moyenne: number | null;
  mediane: number | null;
  ecartType: number | null;
  min: number | null;
  max: number | null;
  /** Élèves à 10 ou plus une fois la note ramenée sur 20. */
  reussite: number | null;
  tranches: TrancheNotes[];
}

/** Une ligne de la grille : un élève, avec ou sans note saisie. */
export interface EntreeNote {
  statut: string | null;
  valeur: number | null;
}

const BORNES: Array<[string, number, number]> = [
  ["0 à 5", 0, 5],
  ["5 à 8", 5, 8],
  ["8 à 10", 8, 10],
  ["10 à 12", 10, 12],
  ["12 à 14", 12, 14],
  ["14 à 16", 14, 16],
  ["16 à 20", 16, 20],
];

const tranchesVides = (): TrancheNotes[] =>
  BORNES.map(([libelle, min, max]) => ({ libelle, min, max, effectif: 0 }));

export function calculerStatistiques(
  entrees: EntreeNote[],
  bareme: number,
  effectif: number,
): Statistiques {
  const retenues: number[] = [];
  let nonSaisies = 0;
  let absentsExclus = 0;

  for (const e of entrees) {
    // Mêmes règles que le calcul des moyennes de matière — s'en écarter ferait
    // dire à l'écran de statistiques autre chose qu'au bulletin.
    if (e.statut === null) {
      nonSaisies += 1;
    } else if (e.statut === "ABSENT" || e.statut === "DISPENSE") {
      // Un dispensé compté comme un zéro ferait chuter la moyenne de la classe
      // d'un point sans qu'aucun élève ait mal travaillé.
      absentsExclus += 1;
    } else if (e.statut === "ABSENT_ZERO" || e.statut === "NON_RENDU") {
      retenues.push(0);
    } else if (e.valeur !== null) {
      retenues.push(e.valeur);
    } else {
      nonSaisies += 1;
    }
  }

  const base = { bareme, effectif, notees: retenues.length, nonSaisies, absentsExclus };

  if (retenues.length === 0) {
    return {
      ...base,
      moyenne: null,
      mediane: null,
      ecartType: null,
      min: null,
      max: null,
      reussite: null,
      tranches: tranchesVides(),
    };
  }

  const triees = [...retenues].sort((a, b) => a - b);
  const n = triees.length;
  const moyenne = triees.reduce((t, v) => t + v, 0) / n;

  // Effectif pair : moyenne des deux valeurs centrales. Prendre l'une des deux
  // donnerait un résultat qui dépend du sens du tri.
  const mediane = n % 2 === 1 ? triees[(n - 1) / 2] : (triees[n / 2 - 1] + triees[n / 2]) / 2;

  // Écart-type de POPULATION : la classe n'est pas un échantillon d'un ensemble
  // plus vaste, c'est la population entière. Diviser par (n − 1) répondrait à
  // une autre question que celle qu'on pose.
  const variance = triees.reduce((t, v) => t + (v - moyenne) ** 2, 0) / n;

  // Toutes les tranches sont exprimées sur 20 : un devoir noté sur 40 doit se
  // lire avec les mêmes repères que les autres, sinon sa distribution n'est
  // comparable à rien.
  const sur20 = (v: number) => (bareme === 20 ? v : (v * 20) / bareme);

  const tranches = BORNES.map(([libelle, min, max], i) => ({
    libelle,
    min,
    max,
    effectif: triees.filter((v) => {
      const x = sur20(v);
      return i === BORNES.length - 1 ? x >= min && x <= max : x >= min && x < max;
    }).length,
  }));

  return {
    ...base,
    moyenne,
    mediane,
    ecartType: Math.sqrt(variance),
    min: triees[0],
    max: triees[n - 1],
    reussite: triees.filter((v) => sur20(v) >= 10).length,
    tranches,
  };
}
