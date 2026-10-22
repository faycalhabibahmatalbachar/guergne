import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { schemaIdentiteLycee } from "./identite-lycee-schema.ts";

const valeurs = () => ({
  version: "2026-10-22 21:00:00+00",
  adresse: "Quartier Centre",
  ville: "N'Djamena",
  pays: "Tchad",
  telephone: "+235 66 00 00 00",
  email: "Administration@EXEMPLE.TD",
  siteWeb: "https://lycee.exemple.td",
  ministereTutelle: "Ministère de l'Éducation Nationale",
  autorisationNumero: "1234",
  nomProviseur: "Monsieur Directeur",
  nomCenseur: "Madame Censeur",
});

describe("configuration de l'identité du lycée", () => {
  it("accepte les coordonnées usuelles et normalise les chaînes", () => {
    const r = schemaIdentiteLycee.parse({ ...valeurs(), email: "  ADMIN@EXEMPLE.TD  ", ville: "  N'Djamena " });
    assert.equal(r.email, "admin@exemple.td");
    assert.equal(r.ville, "N'Djamena");
    assert.equal(r.siteWeb, "https://lycee.exemple.td");
  });

  it("autorise les champs facultatifs vides sous forme de null", () => {
    const v = Object.fromEntries(Object.keys(valeurs()).map(k => [k, ""]));
    v.version = valeurs().version;
    const r = schemaIdentiteLycee.parse(v);
    assert.equal(r.email, null);
    assert.equal(r.telephone, null);
    assert.equal(r.nomProviseur, null);
  });

  it("rejette une version absente ou vide", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), version: "" }).success, false);
  });

  it("rejette un e-mail malformé", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), email: "non-un-email" }).success, false);
  });

  it("exige HTTPS pour le site public", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), siteWeb: "http://lycee.exemple.td" }).success, false);
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), siteWeb: "https://lycee.exemple.td" }).success, true);
  });

  it("rejette un site local, des identifiants ou un port explicite", () => {
    for (const url of ["https://localhost", "https://nom:secret@exemple.td", "https://exemple.td:8443"]) {
      assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), siteWeb: url }).success, false, url);
    }
  });

  it("rejette des caractères interdits dans le numéro de téléphone", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), telephone: "+235\n<script>" }).success, false);
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), telephone: "123" }).success, false);
  });

  it("rejette les valeurs trop longues", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), nomProviseur: "x".repeat(141) }).success, false);
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), adresse: "x".repeat(221) }).success, false);
  });

  it("rejette les données arbitraires et les tentatives de modification de l'identité légale", () => {
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), nom: "Autre établissement" }).success, false);
    assert.equal(schemaIdentiteLycee.safeParse({ ...valeurs(), devise: "USD" }).success, false);
  });

  it("exige tous les champs du formulaire, même s'ils sont vides", () => {
    const v = valeurs();
    const { ville: _ville, ...incomplet } = v;
    assert.equal(schemaIdentiteLycee.safeParse(incomplet).success, false);
  });
});
