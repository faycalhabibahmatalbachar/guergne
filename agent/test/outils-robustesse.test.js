/**
 * Revue de fiabilité des 25 outils, rendue exécutable.
 *
 * POURQUOI UNE REVUE AUTOMATISÉE PLUTÔT QUE LUE
 * ----------------------------------------------
 * Relire vingt-cinq fonctions de rendu ne prouve rien de durable : la
 * vingt-sixième ne sera pas relue, et la correction d'une autre peut rouvrir
 * le défaut. Ces tests parcourent le CATALOGUE lui-même, de sorte qu'un outil
 * ajouté demain est couvert sans que personne n'y pense.
 *
 * CE QUI EST ÉPROUVÉ
 * -------------------
 * Un rendu reçoit ce que le backend veut bien lui donner, et le backend se
 * trompe : une colonne manquante, une liste vide, `null` là où un objet était
 * attendu, une erreur de la plateforme. Dans tous ces cas l'agent doit dire
 * quelque chose d'honnête à un humain qui attend sur WhatsApp — jamais lever
 * une exception, qui le laisserait sans réponse, et jamais rendre
 * « undefined », qui ne veut rien dire pour lui.
 *
 * CE QUI N'EST PAS ÉPROUVÉ ICI
 * -----------------------------
 * L'exactitude des chiffres : elle se prouve contre la base, dans les recettes
 * de bout en bout. Ici, seule la tenue face à l'imprévu est en jeu.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ASSIDUITE_TOOLS } from "../src/tools.js";

/** Les formes qu'un backend peut rendre un mauvais jour. */
const FORMES_DEGENEREES = [
  ["null", null],
  ["undefined", undefined],
  ["liste vide", []],
  ["objet vide", {}],
  ["liste de null", [null, null]],
  ["lignes vides", { lignes: [] }],
  ["lignes de null", { lignes: [null, undefined] }],
  ["total sans lignes", { total: 42 }],
  ["lignes sans colonnes", { lignes: [{}, {}], total: 2 }],
  ["chaine la ou un objet etait attendu", "erreur"],
  ["nombre", 0],
  ["booleen", false],
  ["objet aux valeurs nulles", { total: null, lignes: null, eleves: null }],
];

const avecRendu = ASSIDUITE_TOOLS.filter((o) => typeof o.rendre === "function");

test("le catalogue compte bien 46 outils, dont 37 rendent du texte", () => {
  // Si ce compte change, c'est volontaire : il faut alors le constater ici
  // plutot que de laisser la couverture glisser en silence.
  //
  // 2026-11-10 : 25 -> 29. Ajout de `classes.lister`, `classes.eleves`,
  // `emploi_du_temps.consulter` et `etablissement.annee_courante`, qui
  // correspondent a des operations que le backend exposait deja sans que
  // l'agent les connaisse. Les quatre rendent du texte : 23 -> 27.
  //
  // 2026-11-10 (bis) : 29 -> 38. Ajout des dossiers et des classes :
  // `eleves.dossier`, `referentiel.niveaux` (lectures, avec rendu : 27 -> 29),
  // et sept ecritures — `eleves.inscrire`, `eleves.modifier`,
  // `eleves.changer_classe`, `eleves.archiver`, `classes.creer`,
  // `classes.modifier`, `classes.archiver`. Les ecritures n'ont pas de
  // `rendre` : leur compte rendu vient de `verifier`, apres relecture.
  //
  // 2026-11-11 : 38 -> 46. Les huit operations que le backend exposait sans
  // outil (registre §4) : `parents.rechercher`, `parents.statistiques`,
  // `notes.releve`, `pedagogie.calendrier_evaluations`, `finances.situations`,
  // `referentiel.periodes`, `referentiel.classes_matieres`,
  // `referentiel.series`. Toutes des lectures, toutes avec rendu : 29 -> 37.
  assert.equal(ASSIDUITE_TOOLS.length, 46);
  assert.equal(avecRendu.length, 37);
});

test("chaque outil declare un nom, une permission et une description", () => {
  for (const o of ASSIDUITE_TOOLS) {
    assert.match(o.name, /^[a-z_]+\.[a-z_]+$/, `nom mal forme : ${o.name}`);
    assert.ok(o.permission, `${o.name} : permission absente`);
    // Sans description, le modele ne peut pas choisir l'outil a bon escient.
    assert.ok(o.description?.length > 10, `${o.name} : description absente ou trop courte`);
  }
});

test("deux outils ne portent jamais le meme nom", () => {
  // Un doublon ferait que l'un des deux n'est jamais atteint, en silence.
  const noms = ASSIDUITE_TOOLS.map((o) => o.name);
  assert.deepEqual([...new Set(noms)].sort(), [...noms].sort());
});

for (const outil of avecRendu) {
  test(`${outil.name} tient face a des donnees degenerees`, () => {
    for (const [libelle, donnee] of FORMES_DEGENEREES) {
      let rendu;
      assert.doesNotThrow(() => {
        rendu = outil.rendre(donnee, {});
      }, `${outil.name} leve une exception sur « ${libelle} »`);

      // `null` est une reponse acceptable : l'appelant retombe alors sur un
      // message generique. Une chaine, en revanche, doit etre lisible.
      if (rendu === null || rendu === undefined) continue;
      assert.equal(typeof rendu, "string", `${outil.name} rend un ${typeof rendu} sur « ${libelle} »`);
      assert.ok(rendu.trim().length > 0, `${outil.name} rend du vide sur « ${libelle} »`);
      assert.ok(
        !/undefined|NaN|\[object Object\]/.test(rendu),
        `${outil.name} laisse fuiter un artefact technique sur « ${libelle} » : ${rendu.slice(0, 120)}`,
      );
    }
  });
}

test("aucun rendu ne depend des parametres pour ne pas lever", () => {
  // Le rendu recoit les parametres du plan, que le modele peut remplir de
  // travers. Il ne doit pas s'appuyer dessus pour tenir debout.
  for (const outil of avecRendu) {
    for (const params of [undefined, null, {}, { classeId: null }, { classe: 123 }]) {
      assert.doesNotThrow(
        () => outil.rendre({ lignes: [], total: 0 }, params),
        `${outil.name} leve sur des parametres ${JSON.stringify(params)}`,
      );
    }
  }
});
