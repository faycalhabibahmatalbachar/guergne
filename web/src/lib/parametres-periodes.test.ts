import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifierDatesPeriode } from "./parametres-periodes.ts";

const annee = { dateDebut: "2026-10-01", dateFin: "2027-07-15" };
const autres = [{ id: "trimestre-2", dateDebut: "2027-01-15", dateFin: "2027-03-30" }];

describe("Validation des périodes scolaires", () => {
  it("accepte une période dans l'année sans recoupement", () => {
    assert.deepEqual(verifierDatesPeriode({ dateDebut: "2026-10-01", dateFin: "2027-01-14" }, annee, autres), {});
  });
  it("rejette une date de calendrier impossible", () => {
    const e = verifierDatesPeriode({ dateDebut: "2027-02-30", dateFin: "2027-03-01" }, annee, []);
    assert.ok(e.dateDebut);
  });
  it("rejette les dates inversées ou identiques", () => {
    assert.ok(verifierDatesPeriode({ dateDebut: "2027-02-02", dateFin: "2027-02-02" }, annee, []).dateFin);
    assert.ok(verifierDatesPeriode({ dateDebut: "2027-03-02", dateFin: "2027-02-02" }, annee, []).dateFin);
  });
  it("rejette toute sortie de l'année scolaire", () => {
    assert.ok(verifierDatesPeriode({ dateDebut: "2026-09-30", dateFin: "2026-12-01" }, annee, []).dateDebut);
    assert.ok(verifierDatesPeriode({ dateDebut: "2027-05-01", dateFin: "2027-07-16" }, annee, []).dateFin);
  });
  it("interdit le chevauchement de deux périodes, même sur une journée", () => {
    assert.ok(verifierDatesPeriode({ dateDebut: "2027-01-14", dateFin: "2027-01-15" }, annee, autres).dateDebut);
    assert.ok(verifierDatesPeriode({ dateDebut: "2027-03-30", dateFin: "2027-04-15" }, annee, autres).dateFin);
  });
  it("autorise deux périodes consécutives sans intersection", () => {
    assert.deepEqual(verifierDatesPeriode({ dateDebut: "2027-03-31", dateFin: "2027-07-15" }, annee, autres), {});
  });
});
