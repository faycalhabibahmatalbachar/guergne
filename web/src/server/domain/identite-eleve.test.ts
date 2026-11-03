/**
 * Tests de la normalisation d'identité et de la règle de doublon.
 * Exécution : `node --test src/server/domain/identite-eleve.test.ts`
 *
 * Aucune base n'est touchée : ces fonctions sont pures, et c'est précisément
 * ce qui permet d'éprouver la règle de doublon sans créer un seul élève.
 */

import {
  cleIdentite,
  type IdentiteEleve,
  memePersonne,
  motsRecherche,
  normaliserDateNaissance,
  normaliserIdentite,
} from "./identite-eleve.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Identité de test : seuls les champs qui comptent pour le doublon. */
function identite(partial: Partial<IdentiteEleve> = {}): IdentiteEleve {
  return { nom: "MBAIRAMADJI", prenom: "Bénédicte", dateNaissance: "2010-05-03", ...partial };
}

describe("normaliserIdentite", () => {
  it("neutralise les accents", () => {
    assert.equal(normaliserIdentite("Bénédicte"), normaliserIdentite("Benedicte"));
    assert.equal(normaliserIdentite("Djasrabé"), "djasrabe");
    assert.equal(normaliserIdentite("Élie"), "elie");
  });

  it("neutralise la casse", () => {
    assert.equal(normaliserIdentite("MAHAMAT"), normaliserIdentite("Mahamat"));
    assert.equal(normaliserIdentite("mAhAmAt"), "mahamat");
  });

  it("réduit les espaces multiples et retire ceux des bords", () => {
    assert.equal(normaliserIdentite("  MAHAMAT   SALEH  "), "mahamat saleh");
    assert.equal(normaliserIdentite("\tNGARTA\n"), "ngarta");
  });

  it("traite tiret et apostrophe comme des séparations de mots", () => {
    assert.equal(normaliserIdentite("Mahamat-Saleh"), "mahamat saleh");
    assert.equal(normaliserIdentite("N'Garta"), "n garta");
    assert.equal(normaliserIdentite("N’Djamena"), "n djamena");
  });

  it("rend une chaîne vide pour le vide, le nul et l'absent", () => {
    assert.equal(normaliserIdentite(""), "");
    assert.equal(normaliserIdentite("   "), "");
    assert.equal(normaliserIdentite(null), "");
    assert.equal(normaliserIdentite(undefined), "");
  });

  it("préserve les noms tchadiens longs sans les altérer", () => {
    assert.equal(normaliserIdentite("MBAIRAMADJI"), "mbairamadji");
    assert.equal(normaliserIdentite("Allahoundoum"), "allahoundoum");
  });
});

describe("cleIdentite", () => {
  it("réunit les écritures d'un même nom composé", () => {
    assert.equal(cleIdentite("Mahamat-Saleh"), cleIdentite("MAHAMAT SALEH"));
    assert.equal(cleIdentite("N'Djamena"), cleIdentite("Ndjamena"));
  });

  it("ne confond pas deux noms tchadiens réellement différents", () => {
    assert.notEqual(cleIdentite("MBAIRAMADJI"), cleIdentite("MBAIRABE"));
    assert.notEqual(cleIdentite("NGARTA"), cleIdentite("NGARBA"));
    assert.notEqual(cleIdentite("Allahoundoum"), cleIdentite("Allahondoum"));
  });
});

describe("normaliserDateNaissance", () => {
  it("accepte la date du jour au format ISO et ignore l'heure", () => {
    assert.equal(normaliserDateNaissance("2010-05-03"), "2010-05-03");
    assert.equal(normaliserDateNaissance("2010-05-03T00:00:00.000Z"), "2010-05-03");
  });

  it("refuse ce qui n'est pas une date lisible", () => {
    assert.equal(normaliserDateNaissance(""), "");
    assert.equal(normaliserDateNaissance("03/05/2010"), "");
    assert.equal(normaliserDateNaissance(null), "");
    assert.equal(normaliserDateNaissance(undefined), "");
  });
});

describe("memePersonne", () => {
  it("reconnaît le même enfant malgré accents, casse et espaces", () => {
    assert.equal(
      memePersonne(
        identite({ nom: "mbairamadji", prenom: "  benedicte " }),
        identite({ nom: "MBAIRAMADJI", prenom: "Bénédicte" }),
      ),
      true,
    );
  });

  it("reconnaît le même enfant malgré le tiret du nom composé", () => {
    assert.equal(
      memePersonne(
        identite({ nom: "MAHAMAT-SALEH", prenom: "Ali" }),
        identite({ nom: "Mahamat Saleh", prenom: "ALI" }),
      ),
      true,
    );
  });

  it("REFUSE de confondre deux homonymes nés des jours différents", () => {
    // Le cœur de la règle : même nom, même prénom, autre date de naissance.
    // Deux enfants distincts, et mélanger leurs dossiers serait pire que
    // créer un doublon.
    assert.equal(
      memePersonne(
        identite({ nom: "MAHAMAT", prenom: "Ali", dateNaissance: "2010-05-03" }),
        identite({ nom: "MAHAMAT", prenom: "Ali", dateNaissance: "2011-05-03" }),
      ),
      false,
    );
  });

  it("ne décide rien quand une date de naissance manque ou est illisible", () => {
    assert.equal(memePersonne(identite({ dateNaissance: null }), identite()), false);
    assert.equal(memePersonne(identite(), identite({ dateNaissance: "" })), false);
    assert.equal(memePersonne(identite({ dateNaissance: "03/05/2010" }), identite()), false);
  });

  it("ne décide rien sur un nom ou un prénom vide", () => {
    assert.equal(memePersonne(identite({ nom: "" }), identite({ nom: "" })), false);
    assert.equal(memePersonne(identite({ prenom: null }), identite({ prenom: null })), false);
  });

  it("ne confond pas deux familles différentes nées le même jour", () => {
    assert.equal(memePersonne(identite({ nom: "MBAIRAMADJI" }), identite({ nom: "MBAIRABE" })), false);
  });

  it("ne tient pas un prénom tronqué pour le même prénom", () => {
    assert.equal(memePersonne(identite({ prenom: "Mahamat" }), identite({ prenom: "Mahamat Ali" })), false);
  });
});

describe("motsRecherche", () => {
  it("découpe une recherche de deux mots", () => {
    assert.deepEqual(motsRecherche("Mahamat Ali"), ["mahamat", "ali"]);
  });

  it("donne les mêmes mots dans les deux ordres de saisie", () => {
    // C'est ce qui permet à la requête de trouver le dossier que « Mahamat »
    // soit le nom ou le prénom : les mots sont cherchés dans les deux colonnes.
    assert.deepEqual([...motsRecherche("Ali Mahamat")].sort(), [...motsRecherche("Mahamat Ali")].sort());
  });

  it("neutralise accents, casse et espaces superflus", () => {
    assert.deepEqual(motsRecherche("  BÉNÉDICTE   mbairamadji "), ["benedicte", "mbairamadji"]);
  });

  it("découpe aussi sur le tiret et l'apostrophe", () => {
    assert.deepEqual(motsRecherche("Mahamat-Saleh"), ["mahamat", "saleh"]);
  });

  it("ne rend aucun mot pour le vide, le nul et l'absent", () => {
    assert.deepEqual(motsRecherche(""), []);
    assert.deepEqual(motsRecherche("   "), []);
    assert.deepEqual(motsRecherche(null), []);
    assert.deepEqual(motsRecherche(undefined), []);
  });

  it("plafonne le nombre de mots pour ne pas laisser coller une phrase", () => {
    assert.equal(motsRecherche("un deux trois quatre cinq six sept").length, 5);
  });
});
