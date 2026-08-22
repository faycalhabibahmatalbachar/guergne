import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alignerSurGsm7, estGsm7, segmentsSms } from "./segments-sms.ts";

/**
 * Chaque cas correspond à une facture. Un segment mal compté, c'est un budget
 * qui ne correspond pas au relevé de la passerelle.
 */

describe("estGsm7", () => {
  it("accepte les accents qui sont RÉELLEMENT dans l'alphabet GSM", () => {
    // è é ù ì ò à ä ö ñ ü É Ä Ö Ñ Ü Å å Æ æ ß Ø ø sont dans la norme.
    assert.equal(estGsm7("élève à l'école"), true);
  });

  it("refuse le ç minuscule, absent de la table alors que Ç y figure", () => {
    // Contre-intuitif mais conforme à GSM 03.38 : seule la majuscule Ç existe.
    // « reçu », « français », « ça » basculent donc en UCS-2 et coûtent double.
    assert.equal(estGsm7("reçu"), false);
    assert.equal(estGsm7("Ça"), true);
  });

  it("refuse les accents qui n'y sont pas — c'est là que se cachait le bogue", () => {
    // Ceux-ci font basculer tout le message en UCS-2.
    for (const mot of ["Contrôle", "être", "maître", "goût", "Noël", "août"]) {
      assert.equal(estGsm7(mot), false, `« ${mot} » n'est pas du GSM-7`);
    }
  });

  it("accepte les caractères d'extension", () => {
    assert.equal(estGsm7("prix : 100€ [remise]"), true);
  });

  it("refuse les émojis", () => {
    assert.equal(estGsm7("Bonjour 👋"), false);
  });
});

describe("segmentsSms", () => {
  it("un message court tient en un segment", () => {
    assert.equal(segmentsSms("Absence signalee"), 1);
  });

  it("160 caractères GSM-7 tiennent en un segment, 161 en font deux", () => {
    assert.equal(segmentsSms("a".repeat(160)), 1);
    assert.equal(segmentsSms("a".repeat(161)), 2);
  });

  it("un seul caractère hors GSM-7 divise la capacité par plus de deux", () => {
    // 100 caractères : 1 segment en GSM-7, 2 dès qu'un « ô » apparaît.
    assert.equal(segmentsSms("a".repeat(100)), 1);
    assert.equal(segmentsSms(`ô${"a".repeat(99)}`), 2);
  });

  it("compte le cas réel qui était sous-facturé", () => {
    // Le titre le plus fréquent de l'établissement contient un « ô ».
    const message = `Controle continu\n${"x".repeat(84)}`;
    assert.equal(segmentsSms(message), 1, "sans accent : un segment");

    const avecAccent = `Contrôle continu\n${"x".repeat(84)}`;
    assert.equal(segmentsSms(avecAccent), 2, "avec « ô » : deux segments, et donc le double du prix");
  });

  it("les caractères d'extension comptent double", () => {
    // 80 crochets = 160 unités = encore un seul segment, tout juste.
    assert.equal(segmentsSms("[".repeat(80)), 1);
    assert.equal(segmentsSms("[".repeat(81)), 2);
  });

  it("un message vide reste facturé un segment", () => {
    assert.equal(segmentsSms(""), 1);
  });
});

describe("alignerSurGsm7", () => {
  it("retire les accents coûteux et garde les autres", () => {
    assert.equal(alignerSurGsm7("Contrôle"), "Controle");
    assert.equal(alignerSurGsm7("élève"), "élève");
  });

  it("ramène un message à un seul segment", () => {
    const cher = `Contrôle continu\n${"x".repeat(84)}`;
    assert.equal(segmentsSms(cher), 2);
    assert.equal(segmentsSms(alignerSurGsm7(cher)), 1);
  });

  it("laisse le texte lisible", () => {
    assert.equal(
      alignerSurGsm7("Bulletin du 1er trimestre : contrôle, maîtrise, août"),
      "Bulletin du 1er trimestre : controle, maitrise, aout",
    );
  });
});
