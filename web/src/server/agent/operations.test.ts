/**
 * Tests de la porte lecture / écriture du catalogue agent.
 *
 * Exécution : `node --test src/server/agent/operations.test.ts`
 *
 * Ces tests portent sur la DÉCISION, pas sur l'accès à la base : ils
 * n'ouvrent aucune connexion. Ce qui est vérifié ici est précisément ce qui
 * rend une mise en production de l'agent acceptable — les consultations
 * peuvent partir sans emporter les écritures.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classerOperation, ecrituresActives } from "./porte.ts";

const SANS = {} as NodeJS.ProcessEnv;
const AVEC = { AGENT_ECRITURES_ACTIVES: "true" } as NodeJS.ProcessEnv;
const LECTURES = ["listerAlertes", "listerAbsences", "indicateursCles"];
const ECRITURES = ["enregistrerAppel", "supprimerAbsence"];
const classer = (a: string, env: NodeJS.ProcessEnv) => classerOperation(a, LECTURES, ECRITURES, env).genre;

describe("porte lecture / ecriture de l'agent", () => {
  it("les lectures repondent toujours, quelle que soit la configuration", () => {
    for (const env of [SANS, AVEC]) {
      for (const nom of LECTURES) assert.equal(classer(nom, env), "lecture", nom);
    }
  });

  it("les ecritures sont ETEINTES par defaut", () => {
    // Mettre les consultations en ligne ne doit pas mettre en ligne, du meme
    // geste, la creation et la suppression d'absences — qui declenchent la
    // notification des tuteurs.
    for (const nom of ECRITURES) assert.equal(classer(nom, SANS), "desactivee", nom);
  });

  it("les ecritures repondent quand elles sont explicitement activees", () => {
    for (const nom of ECRITURES) assert.equal(classer(nom, AVEC), "ecriture", nom);
  });

  it("seule la valeur exacte « true » active les ecritures", () => {
    // Un « 1 », un « yes » ou un « TRUE » venus d'une configuration recopiee
    // ne doivent pas ouvrir les ecritures par accident.
    for (const valeur of ["1", "yes", "TRUE", "oui", "", " true", "false"]) {
      assert.equal(ecrituresActives({ AGENT_ECRITURES_ACTIVES: valeur } as NodeJS.ProcessEnv), false, valeur);
    }
    assert.equal(ecrituresActives(AVEC), true);
    assert.equal(ecrituresActives(SANS), false);
  });

  it("distingue une operation inconnue d'une ecriture desactivee", () => {
    // Un nom hors catalogue est une erreur du modele ; une ecriture eteinte
    // est une decision de deploiement. Les confondre ferait chercher au
    // mauvais endroit.
    assert.equal(classer("nImporteQuoi", SANS), "inconnue");
    assert.equal(classer("nImporteQuoi", AVEC), "inconnue");
    assert.equal(classer("supprimerAbsence", SANS), "desactivee");
  });

  it("une lecture ne devient jamais une ecriture", () => {
    // Si un nom figurait dans les deux listes, il heriterait du regime le plus
    // permissif sans que personne ne l'ait decide.
    assert.equal(classerOperation("listerAlertes", LECTURES, ["listerAlertes"], SANS).genre, "lecture");
  });
});
