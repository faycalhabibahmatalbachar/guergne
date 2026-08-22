import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleColonne,
  decouperCsv,
  devinerSeparateur,
  lireCsv,
  normaliserBooleen,
  normaliserDate,
  normaliserSexe,
} from "./tableur.ts";

/**
 * Ces tests portent sur ce qu'un secrétariat enverra réellement, pas sur des
 * fichiers idéaux. Chaque cas vient d'un piège concret : un Excel francophone,
 * une adresse avec une virgule, une date restée au format nombre.
 */

describe("cleColonne", () => {
  it("ramène les variantes d'un même intitulé à une seule clé", () => {
    const attendu = "date_de_naissance";
    for (const variante of ["Date de naissance", "DATE DE NAISSANCE", "date-de-naissance", " Daté de  naissance "]) {
      assert.equal(cleColonne(variante), attendu, `« ${variante} »`);
    }
  });

  it("supprime les accents plutôt que de créer deux colonnes distinctes", () => {
    assert.equal(cleColonne("Prénom"), "prenom");
  });
});

describe("decouperCsv", () => {
  it("respecte les guillemets : une adresse contient presque toujours une virgule", () => {
    const champs = decouperCsv('DJIMET;Oumar;"Quartier Chagoua, rue 12";66112233', ";");
    assert.deepEqual(champs, ["DJIMET", "Oumar", "Quartier Chagoua, rue 12", "66112233"]);
  });

  it("rend un guillemet littéral quand il est doublé", () => {
    assert.deepEqual(decouperCsv('a;"il a dit ""oui""";b', ";"), ["a", 'il a dit "oui"', "b"]);
  });

  it("conserve les champs vides — sinon toutes les colonnes se décalent", () => {
    assert.deepEqual(decouperCsv("a;;c", ";"), ["a", "", "c"]);
  });
});

describe("devinerSeparateur", () => {
  it("reconnaît le point-virgule d'un Excel francophone", () => {
    assert.equal(devinerSeparateur("Nom;Prénom;Sexe;Classe"), ";");
  });

  it("reconnaît la virgule d'un export anglophone", () => {
    assert.equal(devinerSeparateur("Nom,Prénom,Sexe,Classe"), ",");
  });

  it("reconnaît la tabulation d'un copier-coller", () => {
    assert.equal(devinerSeparateur("Nom\tPrénom\tSexe\tClasse"), "\t");
  });
});

describe("normaliserDate", () => {
  it("accepte le format tapé au clavier, jour d'abord", () => {
    assert.equal(normaliserDate("12/03/2010"), "2010-03-12");
    assert.equal(normaliserDate("3-8-2009"), "2009-08-03");
  });

  it("accepte le format ISO d'un export", () => {
    assert.equal(normaliserDate("2010-03-12"), "2010-03-12");
  });

  it("convertit le nombre de jours qu'Excel stocke réellement", () => {
    // 40249 = 12 mars 2010 dans le calendrier d'Excel, décalé de deux jours
    // par le bogue de 1900 qu'il reproduit volontairement.
    assert.equal(normaliserDate("40249"), "2010-03-12");
  });

  it("refuse ce qu'il ne comprend pas plutôt que d'inventer une date", () => {
    assert.equal(normaliserDate("n'importe quoi"), null);
    assert.equal(normaliserDate(""), null);
  });
});

describe("normaliserSexe", () => {
  it("accepte les écritures courantes", () => {
    for (const v of ["M", "m", "masculin", "Garçon", "homme"]) {
      assert.equal(normaliserSexe(v), "M", `« ${v} »`);
    }
    for (const v of ["F", "féminin", "FILLE", "femme"]) {
      assert.equal(normaliserSexe(v), "F", `« ${v} »`);
    }
  });

  it("refuse plutôt que de choisir au hasard", () => {
    assert.equal(normaliserSexe("autre"), null);
    assert.equal(normaliserSexe(""), null);
  });
});

describe("normaliserBooleen", () => {
  it("comprend ce qu'un humain écrit pour dire oui", () => {
    for (const v of ["oui", "OUI", "x", "1", "true", "Vrai"]) {
      assert.equal(normaliserBooleen(v), true, `« ${v} »`);
    }
  });

  it("tout le reste vaut non, y compris le vide", () => {
    for (const v of ["", "non", "0", "peut-être"]) {
      assert.equal(normaliserBooleen(v), false, `« ${v} »`);
    }
  });
});

describe("lireCsv", () => {
  const contenu = [
    "Nom;Prénom;Sexe;Date de naissance;Adresse",
    'MARIÉ;Amélie;F;12/03/2010;"Quartier Chagoua, rue 12"',
    "DJIMET;Oumar;masculin;05/07/2009;",
  ].join("\r\n");

  it("lit un CSV UTF-8 et numérote les lignes comme l'utilisateur les voit", () => {
    const feuille = lireCsv(Buffer.from(contenu, "utf8"));
    assert.deepEqual(feuille.colonnes, ["nom", "prenom", "sexe", "date_de_naissance", "adresse"]);
    assert.equal(feuille.lignes.length, 2);
    // La première ligne de données est la ligne 2 : l'en-tête compte.
    assert.equal(feuille.lignes[0]!.ligne, 2);
    assert.equal(feuille.lignes[0]!.valeurs.adresse, "Quartier Chagoua, rue 12");
  });

  it("récupère les accents d'un fichier Windows-1252", () => {
    // C'est ce que produit « Enregistrer sous → CSV » sur un Excel français.
    const feuille = lireCsv(Buffer.from(contenu, "latin1"));
    assert.equal(feuille.lignes[0]!.valeurs.nom, "MARIÉ");
    assert.equal(feuille.lignes[0]!.valeurs.prenom, "Amélie");
  });

  it("ignore le BOM, qui sinon colle un caractère invisible au premier intitulé", () => {
    const avecBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(contenu, "utf8")]);
    const feuille = lireCsv(avecBom);
    assert.equal(feuille.colonnes[0], "nom");
  });

  it("ignore les lignes vides plutôt que de produire des élèves fantômes", () => {
    const feuille = lireCsv(Buffer.from(`${contenu}\r\n\r\n`, "utf8"));
    assert.equal(feuille.lignes.length, 2);
  });
});
