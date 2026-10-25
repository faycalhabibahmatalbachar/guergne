import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { libelleAppreciationTravail } from "./appreciations-travail.ts";

describe("libelleAppreciationTravail", () => {
  it("retourne null pour une moyenne absente ou hors de l'échelle sur 20", () => {
    assert.equal(libelleAppreciationTravail(null), null);
    assert.equal(libelleAppreciationTravail(Number.NaN), null);
    assert.equal(libelleAppreciationTravail(-0.01), null);
    assert.equal(libelleAppreciationTravail(20.01), null);
  });

  it("applique les 11 appréciations aux bornes sans chevauchement", () => {
    const cas = [
      [0, "Travail nul"],
      [2.99, "Travail nul"],
      [3, "Médiocre"],
      [4.99, "Médiocre"],
      [5, "Très faible"],
      [5.99, "Très faible"],
      [6, "Faible"],
      [7.99, "Faible"],
      [8, "Insuffisant"],
      [9.99, "Insuffisant"],
      [10, "Moyen"],
      [10.99, "Moyen"],
      [11, "Passable"],
      [11.99, "Passable"],
      [12, "Assez-bien"],
      [13.99, "Assez-bien"],
      [14, "Bien"],
      [15.99, "Bien"],
      [16, "Très bien"],
      [17.99, "Très bien"],
      [18, "Excellent Travail"],
      [20, "Excellent Travail"],
    ] as const;

    for (const [moyenne, attendu] of cas) {
      assert.equal(libelleAppreciationTravail(moyenne), attendu, `moyenne ${moyenne}`);
    }
  });
});
