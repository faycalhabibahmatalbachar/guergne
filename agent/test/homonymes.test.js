/**
 * Recette de la détection d'homonymes.
 *
 * Le cas réel : « Recherche l'élève Djimet ABAKAR » rend DEUX dossiers en
 * production — LGR-2025-1050 en 2nde B et LGR-2025-1219 en 4ème A. Deux
 * enfants, même nom, même prénom.
 *
 * Ces tests protègent la seule chose qui compte ici : que personne ne choisisse
 * à la place d'un humain. Un zéro résultat se voit ; la fiche du mauvais enfant
 * ne se voit pas.
 *
 * Les matricules employés sont ceux du cas réel ; ils ne sont pas des données
 * personnelles (aucun nom d'élève réel n'est nécessaire au test, et les noms
 * ci-dessous sont des variantes d'écriture choisies pour la normalisation).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { avertissementHomonymes, cleIdentite, groupesHomonymes } from "../src/homonymes.js";

const eleve = (matricule, nom, prenom, extra = {}) => ({ matricule, nom, prenom, ...extra });

// --- Normalisation --------------------------------------------------------

test("les accents, la casse et la ponctuation ne separent pas un meme nom", () => {
  assert.equal(cleIdentite("Bénédicte"), cleIdentite("BENEDICTE"));
  assert.equal(cleIdentite("N'Djamena"), cleIdentite("Ndjamena"));
  assert.equal(cleIdentite("  Mbai-Ramadji "), cleIdentite("mbairamadji"));
});

test("deux noms tchadiens reellement differents ne se confondent pas", () => {
  assert.notEqual(cleIdentite("MBAIRAMADJI"), cleIdentite("MBAIRABE"));
  assert.notEqual(cleIdentite("NGARTA"), cleIdentite("NGARBA"));
});

test("une valeur absente donne une cle vide, elle ne leve pas", () => {
  for (const v of [null, undefined, "", 42, {}]) assert.doesNotThrow(() => cleIdentite(v));
});

// --- Le cas réel ----------------------------------------------------------

test("les deux ABAKAR Djimet sont detectes comme un groupe", () => {
  const lignes = [
    eleve("LGR-2025-1050", "ABAKAR", "Djimet", { classeLibelle: "2nde B" }),
    eleve("LGR-2025-1219", "ABAKAR", "Djimet", { classeLibelle: "4ème A" }),
    eleve("LGR-2025-1274", "ABAKAR", "Amina", { classeLibelle: "6ème A" }),
  ];
  const g = groupesHomonymes(lignes);
  assert.equal(g.length, 1, "un seul groupe : Amina n'est pas une homonyme");
  assert.equal(g[0].lignes.length, 2);
});

test("l'avertissement nomme les matricules ET ce qui distingue", () => {
  // Sans le distinctif, l'utilisateur ne peut pas choisir : deux matricules
  // nus ne lui disent rien.
  const texte = avertissementHomonymes([
    eleve("LGR-2025-1050", "ABAKAR", "Djimet", { classeLibelle: "2nde B" }),
    eleve("LGR-2025-1219", "ABAKAR", "Djimet", { classeLibelle: "4ème A" }),
  ]);
  assert.match(texte, /ATTENTION/);
  assert.match(texte, /LGR-2025-1050/);
  assert.match(texte, /LGR-2025-1219/);
  assert.match(texte, /2nde B/);
  assert.match(texte, /4ème A/);
  assert.match(texte, /Precisez le matricule/);
  assert.match(texte, /Je ne choisis pas a votre place/);
});

test("une variante d'ecriture du meme nom est quand meme regroupee", () => {
  // « ABAKAR » et « Abakar » sont la meme famille : les separer ferait croire
  // a l'absence d'ambiguite.
  const g = groupesHomonymes([
    eleve("A", "ABAKAR", "Djimet"),
    eleve("B", "Abakar", "DJIMET"),
  ]);
  assert.equal(g.length, 1);
});

// --- Ce qui ne doit PAS alerter ------------------------------------------

test("un seul resultat ne declenche aucun avertissement", () => {
  assert.equal(avertissementHomonymes([eleve("LGR-2025-1050", "ABAKAR", "Djimet")]), null);
});

test("des eleves tous distincts ne declenchent aucun avertissement", () => {
  const texte = avertissementHomonymes([
    eleve("A", "ABAKAR", "Djimet"),
    eleve("B", "NGARTA", "Benedicte"),
    eleve("C", "MBAIRAMADJI", "Idriss"),
  ]);
  assert.equal(texte, null);
});

test("une liste vide ou mal formee ne leve pas", () => {
  for (const v of [[], null, undefined, "pas une liste", {}, [null, undefined]]) {
    assert.doesNotThrow(() => avertissementHomonymes(v));
    assert.equal(avertissementHomonymes(v), null);
  }
});

test("une ligne sans nom ni prenom est ignoree, pas groupee avec les autres", () => {
  // Sinon deux lignes vides passeraient pour des homonymes.
  const g = groupesHomonymes([eleve("A", null, null), eleve("B", "", ""), eleve("C", "ABAKAR", "Djimet")]);
  assert.equal(g.length, 0);
});

// --- Robustesse -----------------------------------------------------------

test("l'avertissement tient sans classe ni date de naissance", () => {
  const texte = avertissementHomonymes([eleve("A", "ABAKAR", "Djimet"), eleve("B", "ABAKAR", "Djimet")]);
  assert.match(texte, /ATTENTION/);
  assert.ok(!/undefined|null|NaN/.test(texte), `artefact technique dans « ${texte} »`);
});

test("un matricule absent est annonce franchement", () => {
  const texte = avertissementHomonymes([
    eleve(null, "ABAKAR", "Djimet", { classeLibelle: "2nde B" }),
    eleve("B", "ABAKAR", "Djimet", { classeLibelle: "4ème A" }),
  ]);
  assert.match(texte, /sans matricule/);
});

test("trois homonymes ou plus sont tous listes", () => {
  const texte = avertissementHomonymes([
    eleve("A", "ABAKAR", "Djimet"),
    eleve("B", "ABAKAR", "Djimet"),
    eleve("C", "ABAKAR", "Djimet"),
  ]);
  assert.match(texte, /3 élèves portent le nom/);
});
