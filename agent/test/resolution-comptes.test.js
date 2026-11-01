/**
 * Recette de la résolution « numéro autorisé → compte réel ».
 *
 * Ces cas sont ceux où une erreur donnerait à quelqu'un les droits d'un autre
 * sur les dossiers de 549 élèves. Aucun numéro réel n'apparaît ici : les
 * valeurs sont synthétiques et ne désignent personne.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ROLES_AUTORISANTS,
  ROLES_PILOTES,
  canoniser,
  numeroPlausible,
  resoudreCompteAutorise,
  verifierAuteur,
} from "../src/resolution-comptes.js";

const NUM = "23560000001"; // synthétique — aucun abonné ne porte ce numero
const compte = (p = {}) => ({ id: "11111111-1111-1111-1111-111111111111", nom: "X", prenom: "Y", role: "SURVEILLANT", actif: true, source: "utilisateurs", ...p });

// --- Canonisation ----------------------------------------------------------

test("un même numéro écrit de plusieurs façons donne une seule forme", () => {
  // Sans cela, un numéro pourtant autorisé passerait pour inconnu selon la
  // façon dont il a été saisi.
  for (const ecriture of ["+235 60 00 00 01", "0023560000001", "23560000001", "60000001"]) {
    assert.equal(canoniser(ecriture), NUM, `ecriture : ${ecriture}`);
  }
});

test("l'indicatif n'est ajouté qu'à un numéro de longueur nationale", () => {
  // Compléter n'importe quoi maquillerait une saisie fautive en numéro valide.
  assert.equal(canoniser("12345"), "12345");
  assert.equal(numeroPlausible("12345"), false);
  assert.equal(numeroPlausible("60000001"), true);
  assert.equal(numeroPlausible(""), false);
  // Un numero commencant par « 00 » est lu comme un prefixe international : le
  // completer d'office en ferait un faux numero national.
  assert.equal(numeroPlausible("00000001"), false);
});

test("un numéro non conforme est refusé avant toute recherche", () => {
  const r = resoudreCompteAutorise({ numero: "123", candidats: [compte()] });
  assert.equal(r.statut, "numero_invalide");
});

// --- Les cas exigés par la recette ----------------------------------------

test("numéro valide et compte unique autorisé : liaison possible", () => {
  const r = resoudreCompteAutorise({ numero: NUM, candidats: [compte()] });
  assert.equal(r.statut, "ok");
  assert.equal(r.compte.role, "SURVEILLANT");
});

test("compte inconnu : on ne le crée pas, on signale", () => {
  const r = resoudreCompteAutorise({ numero: NUM, candidats: [] });
  assert.equal(r.statut, "inconnu");
  assert.match(r.raison, /aucun compte/);
});

test("plusieurs COMPTES pour un numéro : jamais de choix au hasard", () => {
  // C'est une donnée à corriger dans la plateforme, pas un arbitrage de l'agent.
  const r = resoudreCompteAutorise({
    numero: NUM,
    candidats: [compte({ role: "ENSEIGNANT" }), compte({ id: "2", role: "SURVEILLANT" })],
  });
  assert.equal(r.statut, "ambigu");
  assert.equal(r.candidats.length, 2);
  assert.match(r.raison, /ENSEIGNANT/);
});

test("un compte + ses fiches de tuteur ne font PAS une ambiguite", () => {
  // Le cas le plus ordinaire qui soit : un parent a un compte, et une fiche de
  // contact par enfant. Trois lignes, une seule personne. Les confondre
  // bloquerait la resolution de presque tous les numeros de l'etablissement.
  const r = resoudreCompteAutorise({
    numero: NUM,
    candidats: [
      compte({ role: "SURVEILLANT", source: "utilisateurs" }),
      compte({ id: "t1", role: "PARENT", source: "tuteurs" }),
      compte({ id: "t2", role: "PARENT", source: "tuteurs" }),
    ],
  });
  assert.equal(r.statut, "ok");
  assert.equal(r.compte.contacts, 2, "les fiches de contact sont comptees, pas confondues");
});

test("numero connu seulement comme contact de tuteur : aucun compte connectable", () => {
  const r = resoudreCompteAutorise({
    numero: NUM,
    candidats: [compte({ id: "t1", role: "PARENT", source: "tuteurs" })],
  });
  assert.equal(r.statut, "contact_sans_compte");
  assert.equal(r.contacts.length, 1);
  assert.match(r.raison, /aucun compte connectable/);
});

test("mauvais rôle : aucune élévation locale", () => {
  // Un parent ne pilote pas l'agent. Le lier quand même reviendrait à lui
  // accorder, côté agent, un canal que le RBAC ne lui donne pas.
  for (const role of ["PARENT", "ELEVE"]) {
    const r = resoudreCompteAutorise({ numero: NUM, candidats: [compte({ role })] });
    assert.equal(r.statut, "role_refuse", role);
    assert.match(r.raison, new RegExp(role));
  }
});

test("compte désactivé : refus, même si le rôle conviendrait", () => {
  const r = resoudreCompteAutorise({ numero: NUM, candidats: [compte({ actif: false })] });
  assert.equal(r.statut, "inactif");
});

test("l'état du compte est examiné avant son rôle", () => {
  // Un compte désactivé ET au mauvais rôle doit être signalé comme désactivé :
  // c'est l'information qui explique pourquoi il ne sera jamais lié.
  const r = resoudreCompteAutorise({ numero: NUM, candidats: [compte({ actif: false, role: "PARENT" })] });
  assert.equal(r.statut, "inactif");
});

test("les sept rôles de personnel pilotent l'agent, les deux autres non", () => {
  assert.deepEqual(ROLES_PILOTES.length, 7);
  for (const role of ROLES_PILOTES) {
    assert.equal(resoudreCompteAutorise({ numero: NUM, candidats: [compte({ role })] }).statut, "ok", role);
  }
  assert.ok(!ROLES_PILOTES.includes("PARENT"));
  assert.ok(!ROLES_PILOTES.includes("ELEVE"));
});

test("la liste des rôles autorisés est un paramètre, pas une fatalité", () => {
  const r = resoudreCompteAutorise({ numero: NUM, candidats: [compte({ role: "ENSEIGNANT" })], rolesAutorises: ["DIRECTION"] });
  assert.equal(r.statut, "role_refuse");
});

// --- Auteur du provisionnement --------------------------------------------

test("l'auteur d'une liaison est une personne réelle, pas « system »", () => {
  assert.equal(verifierAuteur(null).ok, false);
  assert.equal(verifierAuteur({ id: "system" }).ok, false, "sans role, pas d'autorite");
  assert.equal(verifierAuteur(compte({ role: "DIRECTION" })).ok, true);
});

test("seuls les rôles qui créent des utilisateurs peuvent autoriser une liaison", () => {
  assert.deepEqual(ROLES_AUTORISANTS, ["SUPER_ADMIN", "DIRECTION"]);
  // Un surveillant pilote l'agent mais ne décide pas qui d'autre le pilote.
  const r = verifierAuteur(compte({ role: "SURVEILLANT" }));
  assert.equal(r.ok, false);
  assert.match(r.raison, /SURVEILLANT/);
});

test("un auteur désactivé ne peut plus rien autoriser", () => {
  assert.equal(verifierAuteur(compte({ role: "DIRECTION", actif: false })).ok, false);
});
