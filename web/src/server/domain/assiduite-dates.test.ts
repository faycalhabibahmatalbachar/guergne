/**
 * Tests du contrôle de date à la saisie d'assiduité.
 *
 * Le cas qui compte le plus est le SAMEDI : au Tchad c'est un jour de cours,
 * et un contrôle calqué sur le week-end européen refuserait une journée de
 * saisie sur six. Il est testé explicitement pour qu'une refonte ultérieure
 * ne puisse pas le perdre en silence.
 *
 * Exécution : `node --test src/server/domain/assiduite-dates.test.ts`
 */

import { JOURS_OUVRES_PAR_DEFAUT, type PlageVacances, validerDateAssiduite } from "./assiduite-dates.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Trimestre de référence : 2026-10-01 (jeudi) → 2026-12-31 (jeudi). */
const PERIODE = { debutPeriode: "2026-10-01", finPeriode: "2026-12-31" };

const VACANCES: PlageVacances[] = [
  {
    id: "noel",
    titre: "Vacances de Noël",
    type: "VACANCES",
    dateDebut: "2026-12-20",
    dateFin: "2026-12-31",
  },
];

describe("validerDateAssiduite — période", () => {
  it("refuse une date antérieure au début de la période", () => {
    const r = validerDateAssiduite({ ...PERIODE, date: "2026-09-30" });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /précède le début/);
  });

  it("refuse une date postérieure à la fin de la période", () => {
    const r = validerDateAssiduite({ ...PERIODE, date: "2027-01-01" });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /suit la fin/);
  });

  it("accepte les bornes exactes de la période", () => {
    // 2026-10-01 est un jeudi, 2026-12-31 un jeudi : les deux sont ouvrés.
    assert.equal(validerDateAssiduite({ ...PERIODE, date: "2026-10-01" }).valide, true);
    assert.equal(validerDateAssiduite({ ...PERIODE, date: "2026-12-31" }).valide, true);
  });

  it("refuse une période aux bornes inversées", () => {
    const r = validerDateAssiduite({
      date: "2026-10-05",
      debutPeriode: "2026-12-31",
      finPeriode: "2026-10-01",
    });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /bornes inversées/);
  });
});

describe("validerDateAssiduite — jour de semaine", () => {
  it("refuse un dimanche", () => {
    // 2026-10-04 est un dimanche.
    const r = validerDateAssiduite({ ...PERIODE, date: "2026-10-04" });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /dimanche/);
  });

  it("ACCEPTE un samedi : jour de classe au Tchad", () => {
    // 2026-10-03 est un samedi.
    assert.deepEqual(validerDateAssiduite({ ...PERIODE, date: "2026-10-03" }), { valide: true });
  });

  it("accepte un jour ouvré ordinaire dans la période", () => {
    // 2026-10-06 est un mardi.
    assert.deepEqual(validerDateAssiduite({ ...PERIODE, date: "2026-10-06" }), { valide: true });
  });

  it("respecte des jours ouvrés explicitement restreints", () => {
    const r = validerDateAssiduite({ ...PERIODE, date: "2026-10-03", joursOuvres: [1, 2, 3, 4, 5] });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /samedi/);
  });

  it("retient lundi à samedi par défaut", () => {
    assert.deepEqual([...JOURS_OUVRES_PAR_DEFAUT], [1, 2, 3, 4, 5, 6]);
  });
});

describe("validerDateAssiduite — vacances", () => {
  it("refuse une date dans une plage de vacances", () => {
    const r = validerDateAssiduite({ ...PERIODE, date: "2026-12-22", vacances: VACANCES });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /Vacances de Noël/);
  });

  it("refuse les bornes de la plage de vacances, incluses", () => {
    assert.equal(validerDateAssiduite({ ...PERIODE, date: "2026-12-21", vacances: VACANCES }).valide, false);
    assert.equal(validerDateAssiduite({ ...PERIODE, date: "2026-12-31", vacances: VACANCES }).valide, false);
  });

  it("accepte la veille des vacances", () => {
    // 2026-12-18 est un vendredi, hors plage.
    assert.deepEqual(validerDateAssiduite({ ...PERIODE, date: "2026-12-18", vacances: VACANCES }), { valide: true });
  });

  it("refuse plutôt que de lever une erreur sur une plage mal configurée", () => {
    const r = validerDateAssiduite({
      ...PERIODE,
      date: "2026-10-06",
      vacances: [{ id: "x", titre: "Plage absurde", type: "VACANCES", dateDebut: "2026-11-01", dateFin: "2026-10-01" }],
    });
    assert.equal(r.valide, false);
    assert.match(String(r.raison), /mal configurée/);
  });
});

describe("validerDateAssiduite — date absente ou invalide", () => {
  it("refuse une date absente, vide ou non textuelle", () => {
    for (const date of [undefined, null, "", "   ", 20261006, {}]) {
      const r = validerDateAssiduite({ ...PERIODE, date });
      assert.equal(r.valide, false, `${String(date)} aurait dû être refusée`);
    }
  });

  it("refuse un format ambigu ou une date impossible", () => {
    for (const date of ["06/10/2026", "2026-13-01", "2027-02-29"]) {
      const r = validerDateAssiduite({ ...PERIODE, date });
      assert.equal(r.valide, false, `${date} aurait dû être refusée`);
      assert.match(String(r.raison), /invalide|précède|suit/);
    }
  });
});
