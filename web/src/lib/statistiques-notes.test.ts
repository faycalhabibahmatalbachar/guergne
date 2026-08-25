import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculerStatistiques, type EntreeNote } from "./statistiques-notes.ts";

const note = (valeur: number): EntreeNote => ({ statut: "NOTEE", valeur });

describe("calculerStatistiques", () => {
  it("calcule moyenne, min et max sur les notes retenues", () => {
    const s = calculerStatistiques([note(8), note(12), note(16)], 20, 3);
    assert.equal(s.moyenne, 12);
    assert.equal(s.min, 8);
    assert.equal(s.max, 16);
    assert.equal(s.notees, 3);
  });

  it("prend la moyenne des deux valeurs centrales quand l'effectif est pair", () => {
    // Sinon la médiane dépendrait du sens du tri : 10 ou 12 selon l'humeur.
    const s = calculerStatistiques([note(6), note(10), note(12), note(20)], 20, 4);
    assert.equal(s.mediane, 11);
  });

  it("prend la valeur centrale quand l'effectif est impair", () => {
    const s = calculerStatistiques([note(6), note(10), note(20)], 20, 3);
    assert.equal(s.mediane, 10);
  });

  it("ne trie pas les notes dans l'ordre d'arrivée pour la médiane", () => {
    const desordre = calculerStatistiques([note(20), note(6), note(10)], 20, 3);
    assert.equal(desordre.mediane, 10);
  });

  it("compte ABSENT_ZERO et NON_RENDU comme des zéros", () => {
    const s = calculerStatistiques(
      [note(10), { statut: "ABSENT_ZERO", valeur: null }, { statut: "NON_RENDU", valeur: null }],
      20,
      3,
    );
    assert.equal(s.notees, 3);
    assert.equal(s.moyenne, 10 / 3);
  });

  it("exclut ABSENT et DISPENSE du calcul, sans les compter comme non saisis", () => {
    // Un dispensé compté comme un zéro ferait chuter la moyenne d'un point
    // sans qu'aucun élève ait mal travaillé.
    const s = calculerStatistiques(
      [note(14), { statut: "ABSENT", valeur: null }, { statut: "DISPENSE", valeur: null }],
      20,
      3,
    );
    assert.equal(s.moyenne, 14);
    assert.equal(s.notees, 1);
    assert.equal(s.absentsExclus, 2);
    assert.equal(s.nonSaisies, 0);
  });

  it("compte comme non saisie une ligne sans statut", () => {
    const s = calculerStatistiques([note(14), { statut: null, valeur: null }], 20, 2);
    assert.equal(s.nonSaisies, 1);
    assert.equal(s.notees, 1);
  });

  it("ramène les tranches sur 20 quel que soit le barème", () => {
    // 30/40 vaut 15/20 : la note doit tomber dans « 14 à 16 », pas dans une
    // tranche calculée sur la valeur brute.
    const s = calculerStatistiques([{ statut: "NOTEE", valeur: 30 }], 40, 1);
    const t = s.tranches.find((x) => x.libelle === "14 à 16");
    assert.equal(t?.effectif, 1);
    assert.equal(s.reussite, 1);
  });

  it("range 20/20 dans la dernière tranche, borne haute incluse", () => {
    // Sans l'inclusion, la meilleure note de la classe disparaîtrait de
    // l'histogramme.
    const s = calculerStatistiques([note(20)], 20, 1);
    assert.equal(s.tranches.at(-1)?.effectif, 1);
    assert.equal(
      s.tranches.reduce((t, x) => t + x.effectif, 0),
      1,
    );
  });

  it("place une note pile sur une borne dans la tranche supérieure", () => {
    const s = calculerStatistiques([note(10)], 20, 1);
    assert.equal(s.tranches.find((x) => x.libelle === "10 à 12")?.effectif, 1);
    assert.equal(s.tranches.find((x) => x.libelle === "8 à 10")?.effectif, 0);
  });

  it("calcule un écart-type de population", () => {
    // Population, pas échantillon : la classe EST la population entière.
    // Écart 4 sur [8, 16] autour de 12 → sqrt((16+16)/2) = 4.
    const s = calculerStatistiques([note(8), note(16)], 20, 2);
    assert.equal(s.ecartType, 4);
  });

  it("distingue deux séries de même moyenne par leur écart-type", () => {
    const groupee = calculerStatistiques([note(9), note(10), note(11)], 20, 3);
    const eclatee = calculerStatistiques([note(2), note(10), note(18)], 20, 3);
    assert.equal(groupee.moyenne, eclatee.moyenne);
    assert.ok(eclatee.ecartType! > groupee.ecartType!);
  });

  it("ne renvoie aucun indicateur quand rien n'est noté", () => {
    const s = calculerStatistiques([{ statut: null, valeur: null }], 20, 1);
    assert.equal(s.moyenne, null);
    assert.equal(s.mediane, null);
    assert.equal(s.reussite, null);
    assert.equal(
      s.tranches.reduce((t, x) => t + x.effectif, 0),
      0,
    );
  });

  it("compte la réussite au seuil de 10 sur 20, borne incluse", () => {
    const s = calculerStatistiques([note(9.5), note(10), note(10.5)], 20, 3);
    assert.equal(s.reussite, 2);
  });
});
