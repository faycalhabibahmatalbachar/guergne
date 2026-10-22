import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { schemaIdentiteLycee, siteOfficielValide } from "./parametres-identite.ts";

const fiche = {
  version: "2026-10-22 19:00:00+00",
  adresse: "N'Djamena",
  ville: "N'Djamena",
  pays: "Tchad",
  telephone: "+235 66 00 00 00",
  email: "Secretariat@EXEMPLE.TD",
  siteWeb: "https://lycee.example.td",
  ministereTutelle: "Éducation",
  autorisationNumero: "123",
  nomProviseur: "Nom Proviseur",
  nomCenseur: "",
};

describe("Coordonnées officielles du lycée", () => {
  it("valide les coordonnées et normalise les valeurs facultatives", () => {
    const r = schemaIdentiteLycee.safeParse(fiche);
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.email, "secretariat@exemple.td");
      assert.equal(r.data.nomCenseur, null);
    }
  });
  it("rejette les sites non HTTPS ou comportant des identifiants", () => {
    for (const url of ["http://lycee.example.td", "javascript:alert(1)", "https://admin:secret@lycee.example.td"]) {
      assert.equal(siteOfficielValide(url), false);
    }
    assert.equal(siteOfficielValide("https://lycee.example.td"), true);
  });
  it("rejette les téléphones dangereux ou trop courts", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...fiche, telephone: "abc" }).success, false);
  });
  it("rejette les courriels invalides", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...fiche, email: "sans-arobase" }).success, false);
  });
  it("rejette les pays et villes vides", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...fiche, ville: "   " }).success, false);
  });
  it("exige une version lue pour prévenir l'écrasement concurrent", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...fiche, version: "" }).success, false);
  });
});
