import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatInternational,
  formatLisible,
  motifRefus,
  partieNationale,
  telephoneValide,
} from "./telephone.ts";

/**
 * Numéros tchadiens.
 *
 * Ces cas sont les MÊMES que ceux de `mobile/test/telephone_test.dart`. Les
 * deux implémentations doivent rester d'accord : un désaccord se traduirait
 * par un parent que l'application accepte et que le serveur refuse — ou
 * l'inverse, ce qui est pire, car il croirait s'être inscrit.
 */

describe("Validation", () => {
  it("accepte les quatre préfixes tchadiens", () => {
    for (const prefixe of ["3", "6", "8", "9"]) {
      assert.equal(telephoneValide(`${prefixe}1234567`), true, `préfixe ${prefixe}`);
    }
  });

  it("refuse un préfixe hors plan de numérotation", () => {
    for (const prefixe of ["0", "1", "2", "4", "5", "7"]) {
      assert.equal(telephoneValide(`${prefixe}1234567`), false, `préfixe ${prefixe}`);
    }
  });

  it("exige exactement huit chiffres", () => {
    assert.equal(telephoneValide("6612345"), false);
    assert.equal(telephoneValide("66123456"), true);
    assert.equal(telephoneValide("661234567"), false);
  });
});

describe("Formes acceptées à la saisie", () => {
  const attendu = "66000000";

  for (const saisie of [
    "66000000",
    "66 00 00 00",
    "66-00-00-00",
    "+23566000000",
    "+235 66 00 00 00",
    "23566000000",
    "0023566000000",
    "066000000",
  ]) {
    it(`« ${saisie} »`, () => {
      assert.equal(partieNationale(saisie), attendu);
      assert.equal(telephoneValide(saisie), true);
      assert.equal(formatInternational(saisie), `+235${attendu}`);
    });
  }
});

describe("Motif de refus", () => {
  it("dit combien de chiffres manquent", () => {
    assert.match(motifRefus("660") ?? "", /5 chiffres/);
    assert.match(motifRefus("6600000") ?? "", /1 chiffre/);
    assert.doesNotMatch(motifRefus("6600000") ?? "", /1 chiffres/);
  });

  it("nomme les préfixes valides", () => {
    assert.match(motifRefus("51234567") ?? "", /3, 6, 8, 9/);
  });

  it("ne dit rien sur un numéro correct", () => {
    assert.equal(motifRefus("66000000"), null);
    assert.equal(motifRefus("+235 31 23 45 67"), null);
  });

  it("demande une saisie quand le champ est vide", () => {
    assert.notEqual(motifRefus(""), null);
  });
});

describe("Mise en forme", () => {
  it("groupe par deux", () => {
    assert.equal(formatLisible("66000000"), "66 00 00 00");
    assert.equal(formatLisible("+23591912191"), "91 91 21 91");
  });

  it("supporte un numéro incomplet", () => {
    assert.equal(formatLisible("660"), "66 0");
  });
});

describe("Numéros étrangers", () => {
  // Un tuteur peut vivre hors du Tchad. Forcer +235 devant son numéro
  // produirait un destinataire inexistant, et l'alerte d'absence n'arriverait
  // jamais — sans que rien ne le signale.
  it("respecte un indicatif étranger explicite", () => {
    assert.equal(formatInternational("+33612345678"), "+33612345678");
    assert.equal(formatInternational("+225 07 12 34 56 78"), "+2250712345678");
    assert.equal(formatInternational("0033612345678"), "+33612345678");
  });

  it("ramène toujours un numéro tchadien à +235", () => {
    assert.equal(formatInternational("+23566000000"), "+23566000000");
    assert.equal(formatInternational("66000000"), "+23566000000");
    assert.equal(formatInternational("0023566000000"), "+23566000000");
  });

  it("ne considère pas un numéro étranger comme valide ici", () => {
    assert.equal(telephoneValide("+33612345678"), false);
  });
});
