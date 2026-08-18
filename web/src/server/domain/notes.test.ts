/**
 * Tests du moteur de calcul des moyennes.
 * Exécution : `node --test src/server/domain/notes.test.ts`
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  arrondir,
  calculerMoyenneGenerale,
  calculerMoyenneMatiere,
  calculerRangs,
  calculerStatistiquesClasse,
  construireMoyenneMatiere,
  proposerMention,
  PONDERATION_PAR_DEFAUT,
  type NoteBrute,
} from "./notes.ts";

/** Fabrique une note de test avec des valeurs par défaut raisonnables. */
function note(partial: Partial<NoteBrute> & { valeur: number | null }): NoteBrute {
  return {
    statut: "NOTEE",
    bareme: 20,
    poids: 1,
    type: "INTERROGATION",
    compteDansMoyenne: true,
    ...partial,
  };
}

describe("arrondir", () => {
  it("arrondit sans le biais des flottants", () => {
    assert.equal(arrondir(2.675, 2), 2.68);
    assert.equal(arrondir(13.333333, 2), 13.33);
    assert.equal(arrondir(9.995, 2), 10);
  });
});

describe("calculerMoyenneMatiere", () => {
  it("retourne null quand aucune note n'est exploitable", () => {
    assert.deepEqual(calculerMoyenneMatiere([]), { moyenne: null, nbEvaluations: 0 });
  });

  it("calcule la moyenne simple d'un seul type d'évaluation", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: 12 }),
      note({ valeur: 14 }),
      note({ valeur: 16 }),
    ]);
    assert.equal(r.moyenne, 14);
    assert.equal(r.nbEvaluations, 3);
  });

  it("pondère la composition plus lourdement que les interrogations", () => {
    // Interros : (10 + 10) / 2 = 10, poids 1
    // Composition : 16, poids 2
    // Moyenne = (10 × 1 + 16 × 2) / 3 = 14
    const r = calculerMoyenneMatiere([
      note({ valeur: 10, type: "INTERROGATION" }),
      note({ valeur: 10, type: "INTERROGATION" }),
      note({ valeur: 16, type: "COMPOSITION" }),
    ]);
    assert.equal(r.moyenne, 14);
  });

  it("ignore un type d'évaluation absent au lieu de minorer la moyenne", () => {
    // Uniquement des interrogations : la moyenne est celle des interrogations,
    // et non une valeur diluée par une composition inexistante.
    const r = calculerMoyenneMatiere([
      note({ valeur: 15, type: "INTERROGATION" }),
      note({ valeur: 15, type: "INTERROGATION" }),
    ]);
    assert.equal(r.moyenne, 15);
  });

  it("exclut une absence justifiée du calcul", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: 12 }),
      note({ valeur: null, statut: "ABSENT" }),
      note({ valeur: 16 }),
    ]);
    assert.equal(r.moyenne, 14, "l'absence justifiée ne doit pas compter comme un zéro");
    assert.equal(r.nbEvaluations, 2);
  });

  it("compte une absence non justifiée sanctionnée comme un zéro", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: 12 }),
      note({ valeur: null, statut: "ABSENT_ZERO" }),
    ]);
    assert.equal(r.moyenne, 6);
  });

  it("compte un travail non rendu comme un zéro", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: 20 }),
      note({ valeur: null, statut: "NON_RENDU" }),
    ]);
    assert.equal(r.moyenne, 10);
  });

  it("exclut une dispense (EPS sur certificat médical)", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: null, statut: "DISPENSE" }),
      note({ valeur: 18 }),
    ]);
    assert.equal(r.moyenne, 18);
  });

  it("ramène les notes sur 20 quel que soit le barème", () => {
    // 40/50 sur un barème de 50 → 16/20
    const r = calculerMoyenneMatiere([note({ valeur: 40, bareme: 50 })]);
    assert.equal(r.moyenne, 16);
  });

  it("respecte le poids propre de chaque évaluation dans son type", () => {
    // (8 × 1 + 14 × 3) / 4 = 12.5
    const r = calculerMoyenneMatiere([
      note({ valeur: 8, poids: 1 }),
      note({ valeur: 14, poids: 3 }),
    ]);
    assert.equal(r.moyenne, 12.5);
  });

  it("ignore les évaluations marquées hors moyenne", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: 5, compteDansMoyenne: false }),
      note({ valeur: 15 }),
    ]);
    assert.equal(r.moyenne, 15);
  });

  it("retourne null si toutes les notes sont des absences justifiées", () => {
    const r = calculerMoyenneMatiere([
      note({ valeur: null, statut: "ABSENT" }),
      note({ valeur: null, statut: "DISPENSE" }),
    ]);
    assert.equal(r.moyenne, null);
  });

  it("rejette un poids nul ou négatif", () => {
    assert.throws(() => calculerMoyenneMatiere([note({ valeur: 10, poids: 0 })]), /Poids/);
  });

  it("rejette un barème nul ou négatif", () => {
    assert.throws(() => calculerMoyenneMatiere([note({ valeur: 10, bareme: 0 })]), /Barème/);
  });

  it("accepte une pondération personnalisée", () => {
    // Composition à poids 4 : (10 × 1 + 20 × 4) / 5 = 18
    const r = calculerMoyenneMatiere(
      [
        note({ valeur: 10, type: "INTERROGATION" }),
        note({ valeur: 20, type: "COMPOSITION" }),
      ],
      { ...PONDERATION_PAR_DEFAUT, composition: 4 },
    );
    assert.equal(r.moyenne, 18);
  });
});

describe("calculerMoyenneGenerale", () => {
  it("pondère chaque matière par son coefficient", () => {
    // (12 × 4 + 16 × 2) / 6 = 13.33
    const r = calculerMoyenneGenerale([
      construireMoyenneMatiere("math", 12, 4, 3),
      construireMoyenneMatiere("hist", 16, 2, 2),
    ]);
    assert.equal(r.moyenne, 13.33);
    assert.equal(r.totalPoints, 80);
    assert.equal(r.totalCoefficients, 6);
  });

  it("exclut du dénominateur les matières sans moyenne", () => {
    // L'élève dispensé d'EPS ne doit pas être pénalisé : le coefficient 1
    // de l'EPS ne doit pas apparaître au dénominateur.
    const r = calculerMoyenneGenerale([
      construireMoyenneMatiere("math", 15, 4, 3),
      construireMoyenneMatiere("eps", null, 1, 0),
    ]);
    assert.equal(r.moyenne, 15);
    assert.equal(r.totalCoefficients, 4);
  });

  it("retourne null quand aucune matière n'est notée", () => {
    const r = calculerMoyenneGenerale([construireMoyenneMatiere("math", null, 4, 0)]);
    assert.equal(r.moyenne, null);
  });

  it("rejette un coefficient nul ou négatif", () => {
    assert.throws(
      () => calculerMoyenneGenerale([construireMoyenneMatiere("math", 12, 0, 1)]),
      /Coefficient/,
    );
  });
});

describe("calculerRangs", () => {
  it("classe par moyenne décroissante", () => {
    const r = calculerRangs([
      { inscriptionId: "a", moyenne: 11 },
      { inscriptionId: "b", moyenne: 15 },
      { inscriptionId: "c", moyenne: 13 },
    ]);
    assert.deepEqual(
      r.map((x) => [x.inscriptionId, x.rang]),
      [["b", 1], ["c", 2], ["a", 3]],
    );
  });

  it("applique le classement olympique aux ex æquo (1, 2, 2, 4)", () => {
    const r = calculerRangs([
      { inscriptionId: "a", moyenne: 18 },
      { inscriptionId: "b", moyenne: 14.25 },
      { inscriptionId: "c", moyenne: 14.25 },
      { inscriptionId: "d", moyenne: 12 },
    ]);
    const rangs = new Map(r.map((x) => [x.inscriptionId, x.rang]));
    assert.equal(rangs.get("a"), 1);
    assert.equal(rangs.get("b"), 2);
    assert.equal(rangs.get("c"), 2);
    assert.equal(rangs.get("d"), 4, "le rang 3 est consommé par l'ex æquo");
  });

  it("signale les ex æquo", () => {
    const r = calculerRangs([
      { inscriptionId: "a", moyenne: 14 },
      { inscriptionId: "b", moyenne: 14 },
      { inscriptionId: "c", moyenne: 10 },
    ]);
    const exAequo = new Map(r.map((x) => [x.inscriptionId, x.estExAequo]));
    assert.equal(exAequo.get("a"), true);
    assert.equal(exAequo.get("b"), true);
    assert.equal(exAequo.get("c"), false);
  });

  it("place hors classement les élèves sans moyenne", () => {
    const r = calculerRangs([
      { inscriptionId: "a", moyenne: 12 },
      { inscriptionId: "b", moyenne: null },
    ]);
    const b = r.find((x) => x.inscriptionId === "b");
    assert.equal(b?.rang, null);
    assert.equal(r.find((x) => x.inscriptionId === "a")?.rang, 1);
  });

  it("retourne une liste vide pour une classe vide", () => {
    assert.deepEqual(calculerRangs([]), []);
  });
});

describe("calculerStatistiquesClasse", () => {
  it("calcule moyenne, extrêmes et écart-type", () => {
    const s = calculerStatistiquesClasse([10, 12, 14, 16]);
    assert.equal(s.moyenne, 13);
    assert.equal(s.min, 10);
    assert.equal(s.max, 16);
    assert.equal(s.ecartType, 2.24);
    assert.equal(s.effectif, 4);
  });

  it("calcule le taux de réussite au seuil de 10", () => {
    const s = calculerStatistiquesClasse([8, 9, 10, 15]);
    assert.equal(s.nbAdmis, 2);
    assert.equal(s.tauxReussite, 50);
  });

  it("exclut les élèves non notés des statistiques mais pas de l'effectif", () => {
    const s = calculerStatistiquesClasse([10, null, 20]);
    assert.equal(s.effectif, 3);
    assert.equal(s.nbNotes, 2);
    assert.equal(s.moyenne, 15);
  });

  it("gère une classe sans aucune note", () => {
    const s = calculerStatistiquesClasse([null, null]);
    assert.equal(s.moyenne, null);
    assert.equal(s.tauxReussite, null);
    assert.equal(s.effectif, 2);
  });
});

describe("proposerMention", () => {
  it("propose les félicitations à partir de 16", () => {
    assert.equal(proposerMention(16, 15), "FELICITATIONS");
  });

  it("propose les encouragements entre 14 et 16", () => {
    assert.equal(proposerMention(14, 15), "ENCOURAGEMENTS");
  });

  it("propose le tableau d'honneur entre 12 et 14", () => {
    assert.equal(proposerMention(12.5, 15), "TABLEAU_HONNEUR");
  });

  it("propose un avertissement travail en dessous de 8", () => {
    assert.equal(proposerMention(7, 15), "AVERTISSEMENT_TRAVAIL");
  });

  it("fait primer la conduite sur les résultats", () => {
    assert.equal(
      proposerMention(18, 6),
      "AVERTISSEMENT_CONDUITE",
      "un excellent élève au comportement problématique ne reçoit pas de félicitations",
    );
  });

  it("sanctionne un absentéisme important malgré de bons résultats", () => {
    assert.equal(proposerMention(17, 15, 25), "AVERTISSEMENT_CONDUITE");
  });

  it("ne propose rien sans moyenne", () => {
    assert.equal(proposerMention(null, 15), "AUCUNE");
  });
});
