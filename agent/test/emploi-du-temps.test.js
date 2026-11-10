/**
 * Recette du rendu de l'emploi du temps et des outils de classe.
 *
 * POURQUOI CES TESTS
 * -------------------
 * L'agent ne savait pas consulter un emploi du temps : le backend exposait
 * `chargerEmploiDuTemps`, mais aucun outil ne l'appelait. « Quel est l'emploi
 * du temps de la 6e A demain ? » finissait en clarification.
 *
 * Ces tests portent sur ce qu'un directeur lirait de travers : une heure de
 * fin fausse, une grille vide présentée comme « pas cours », un jour mal
 * compris.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ASSIDUITE_TOOLS } from "../src/tools.js";
import { JOURS, rendreEmploiDuTemps } from "../src/tools-pilotage.js";

const cours = (surcharges = {}) => ({
  jourSemaine: 1,
  creneauOrdre: 1,
  heureDebut: "07:00:00",
  heureFin: "07:55:00",
  nbCreneaux: 1,
  classeLibelle: "6ème A",
  matiereLibelle: "Mathématiques",
  salleCode: "S2",
  enseignantNom: "Moussa Ali",
  publie: true,
  ...surcharges,
});

test("les heures viennent du creneau, au format lisible", () => {
  const texte = rendreEmploiDuTemps([cours()]);
  assert.match(texte, /07 h 00 – 07 h 55 — Mathématiques — salle S2 — Moussa Ali/);
  assert.match(texte, /Emploi du temps de la 6ème A/);
});

test("un cours de deux creneaux n'annonce pas une fin fausse", () => {
  // `heureFin` est celle du creneau de DEPART. L'afficher annoncerait la fin
  // une heure trop tot.
  const texte = rendreEmploiDuTemps([cours({ nbCreneaux: 2 })]);
  assert.match(texte, /07 h 00, 2 creneaux — Mathématiques/);
  assert.doesNotMatch(texte, /07 h 55/);
});

test("la semaine est groupee par jour, dans l'ordre des creneaux", () => {
  const texte = rendreEmploiDuTemps([
    cours({ jourSemaine: 2, creneauOrdre: 2, heureDebut: "07:55:00", heureFin: "08:50:00", matiereLibelle: "Français" }),
    cours({ jourSemaine: 1, creneauOrdre: 3, heureDebut: "08:50:00", heureFin: "09:45:00", matiereLibelle: "Anglais" }),
    cours({ jourSemaine: 1, creneauOrdre: 1 }),
  ]);
  const iLundi = texte.indexOf("Lundi");
  const iMardi = texte.indexOf("Mardi");
  assert.ok(iLundi >= 0 && iMardi > iLundi, texte);
  // Dans le lundi, le creneau 1 passe avant le creneau 3.
  assert.ok(texte.indexOf("Mathématiques") < texte.indexOf("Anglais"), texte);
});

test("le filtre par jour ne garde que ce jour", () => {
  const texte = rendreEmploiDuTemps(
    [cours({ jourSemaine: 1 }), cours({ jourSemaine: 2, matiereLibelle: "Français" })],
    { jour: "mardi" },
  );
  assert.match(texte, /Français/);
  assert.doesNotMatch(texte, /Mathématiques/);
});

test("le samedi est un jour de classe, le dimanche n'en est pas un", () => {
  // Au Tchad le samedi est ouvre : la base numerote de 1 a 6.
  assert.equal(JOURS[6], "samedi");
  assert.equal(JOURS.includes("dimanche"), false);
  assert.match(rendreEmploiDuTemps([cours({ jourSemaine: 6 })], { jour: "samedi" }), /Mathématiques/);
  assert.match(rendreEmploiDuTemps([cours()], { jour: "dimanche" }), /Jour non reconnu/);
});

test("une grille vide n'est PAS presentee comme une absence de cours", () => {
  // Confondre « rien de saisi » avec « pas cours » ferait rester des eleves
  // chez eux un jour de classe.
  const texte = rendreEmploiDuTemps([]);
  assert.match(texte, /n'a pas ete saisie/);
  assert.match(texte, /Ce n'est pas l'absence de cours/);
});

test("un jour sans cours enregistre le dit, sans inventer", () => {
  const texte = rendreEmploiDuTemps([cours({ jourSemaine: 1 })], { jour: "vendredi" });
  assert.match(texte, /Aucun cours enregistre le vendredi/);
});

test("une grille non publiee est signalee", () => {
  const texte = rendreEmploiDuTemps([cours({ publie: false })]);
  assert.match(texte, /pas encore publiee/);
});

test("des lignes illisibles sont ecartees, et comptees", () => {
  const texte = rendreEmploiDuTemps([cours(), null, { jourSemaine: "x" }]);
  assert.match(texte, /Mathématiques/);
  assert.match(texte, /2 ligne\(s\) illisible\(s\) ecartee\(s\)/);
});

// --- Les outils eux-memes ----------------------------------------------------

const outil = (nom) => ASSIDUITE_TOOLS.find((o) => o.name === nom);

test("les quatre outils ajoutes appellent des operations reelles du backend", () => {
  // Chaque `action` doit exister dans web/src/server/agent/operations.ts. Un
  // outil qui promet une capacite que la route ne sert pas finit en 404.
  const attendus = {
    "classes.lister": "listerClasses",
    "classes.eleves": "listerElevesClasse",
    "emploi_du_temps.consulter": "chargerEmploiDuTemps",
    "etablissement.annee_courante": "anneeCourante",
  };
  for (const [nom, action] of Object.entries(attendus)) {
    assert.equal(outil(nom)?.action, action, nom);
  }
});

test("une annee sans classes est dite telle quelle, pas comme une panne", () => {
  // C'est l'etat REEL de la base depuis l'ouverture de 2026-2027.
  const texte = outil("classes.lister").rendre([]);
  assert.match(texte, /Aucune classe n'est encore enregistree pour l'annee scolaire en cours/);
  assert.match(texte, /passage d'annee/);
});

test("la liste des classes donne l'effectif et la capacite", () => {
  const texte = outil("classes.lister").rendre([{ libelle: "6ème A", effectif: 49, capaciteMax: 60 }]);
  assert.match(texte, /6ème A — 49 eleve\(s\) sur 60 places/);
});

test("l'emploi du temps exige une classe ou un enseignant", () => {
  const v = outil("emploi_du_temps.consulter").validate;
  assert.deepEqual(v({ classeId: "c1" }), {});
  assert.deepEqual(v({ enseignantId: "e1" }), {});
  assert.ok(v({}).classeId, "sans classe ni enseignant, l'outil doit refuser");
});

test("les eleves d'une classe exigent la classe", () => {
  assert.ok(outil("classes.eleves").validate({}).classeId);
  assert.deepEqual(outil("classes.eleves").validate({ classeId: "c1" }), {});
});

test("l'annee courante est rendue avec ses dates", () => {
  const texte = outil("etablissement.annee_courante").rendre({
    libelle: "2026-2027",
    dateDebut: "2026-10-01",
    dateFin: "2027-05-29",
  });
  assert.equal(texte, "Annee scolaire en cours : 2026-2027, du 2026-10-01 au 2027-05-29.");
  assert.match(outil("etablissement.annee_courante").rendre(null), /Aucune annee scolaire/);
});
