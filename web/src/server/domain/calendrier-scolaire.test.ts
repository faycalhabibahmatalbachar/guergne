/**
 * Tests du moteur de dates du calendrier scolaire.
 * Exécution : `node --test src/server/domain/calendrier-scolaire.test.ts`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evenementsPourDate,
  genererDatesCalendrier,
  jourSemaineISO,
  parserDateISO,
  type EvenementCalendaireDate,
} from "./calendrier-scolaire.ts";

describe("parserDateISO", () => {
  it("accepte une date civile valide", () => {
    assert.equal(parserDateISO("2028-02-29").toISOString(), "2028-02-29T00:00:00.000Z");
  });

  it("rejette le format ambigu et les dates impossibles", () => {
    assert.throws(() => parserDateISO("29/02/2028"), RangeError);
    assert.throws(() => parserDateISO("2027-02-29"), RangeError);
    assert.throws(() => parserDateISO("2026-13-01"), RangeError);
  });
});

describe("jourSemaineISO", () => {
  it("respecte la numérotation lundi=1 et dimanche=7", () => {
    assert.equal(jourSemaineISO("2026-10-26"), 1);
    assert.equal(jourSemaineISO("2026-10-30"), 5);
    assert.equal(jourSemaineISO("2026-11-01"), 7);
  });
});

describe("genererDatesCalendrier", () => {
  it("génère toutes les dates entre les bornes incluses", () => {
    const jours = genererDatesCalendrier("2026-12-30", "2027-01-02");
    assert.deepEqual(jours.map((jour) => jour.date), [
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("gère le 29 février des années bissextiles", () => {
    const jours = genererDatesCalendrier("2028-02-28", "2028-03-01");
    assert.deepEqual(jours.map((jour) => jour.date), [
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("retourne une seule journée lorsque les bornes sont identiques", () => {
    assert.equal(genererDatesCalendrier("2026-10-27", "2026-10-27").length, 1);
  });

  it("rejette une période inversée", () => {
    assert.throws(() => genererDatesCalendrier("2027-09-01", "2027-08-31"), RangeError);
  });
});

describe("evenementsPourDate", () => {
  const evenements: EvenementCalendaireDate[] = [
    {
      id: "ferie",
      titre: "Jour férié",
      type: "FERIE",
      dateDebut: "2026-11-01",
      dateFin: "2026-11-01",
    },
    {
      id: "vacances",
      titre: "Vacances",
      type: "VACANCES",
      dateDebut: "2026-12-20",
      dateFin: "2027-01-03",
    },
  ];

  it("retourne les événements dont la plage contient la date, bornes incluses", () => {
    assert.deepEqual(
      evenementsPourDate("2026-12-20", evenements).map((evenement) => evenement.id),
      ["vacances"],
    );
    assert.deepEqual(
      evenementsPourDate("2027-01-03", evenements).map((evenement) => evenement.id),
      ["vacances"],
    );
    assert.deepEqual(evenementsPourDate("2027-01-04", evenements), []);
  });

  it("rejette un événement dont les dates sont inversées", () => {
    assert.throws(() =>
      evenementsPourDate("2026-10-27", [
        {
          id: "invalid",
          titre: "Événement invalide",
          type: "AUTRE",
          dateDebut: "2026-11-01",
          dateFin: "2026-10-01",
        },
      ]),
    );
  });
});
