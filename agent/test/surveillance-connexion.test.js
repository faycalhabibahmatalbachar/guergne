/**
 * Recette du chien de garde de la connexion.
 *
 * Le défaut que ces tests empêchent de revenir : six heures et demie en
 * « connecting », zéro tentative de reconnexion, et un `/sante` qui répondait
 * vert pendant toute la panne.
 *
 * L'horloge est injectée. Un test de surveillance qui attendrait réellement
 * huit minutes ne serait jamais lancé.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  RECULS_MS,
  SEUIL_CONNEXION_MS,
  SEUIL_DECONNEXION_MS,
  SurveillantConnexion,
  TENTATIVES_MAX,
} from "../src/surveillance-connexion.js";

/** Horloge pilotée : `t.avance(ms)` fait passer le temps. */
function horlogeFactice(depart = 1_000_000) {
  let t = depart;
  return { maintenant: () => t, avance: (ms) => (t += ms) };
}

const monter = (h) => {
  const journal = [];
  return { s: new SurveillantConnexion({ horloge: h.maintenant, journal: (e) => journal.push(e) }), journal };
};

// --- Ce qui ne doit JAMAIS déclencher une reconnexion ----------------------

test("« ready » ne declenche rien, meme apres des heures", () => {
  const h = horlogeFactice();
  const { s } = monter(h);
  assert.equal(s.evaluer({ etat: "ready" }).action, "rien");
  h.avance(6 * 60 * 60 * 1000);
  assert.equal(s.evaluer({ etat: "ready" }).action, "rien");
});

test("« qr » attend un humain : jamais force, jamais degrade", () => {
  // Forcer effacerait le code que quelqu'un est en train de scanner.
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "qr" });
  h.avance(3 * 60 * 60 * 1000);
  const d = s.evaluer({ etat: "qr" });
  assert.equal(d.action, "rien");
  assert.match(d.raison, /scan/);
  assert.equal(s.sante({ etat: "qr" }).degrade, false);
});

test("un « connecting » bref est une restauration normale", () => {
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS - 1000);
  assert.equal(s.evaluer({ etat: "connecting" }).action, "rien");
  assert.equal(s.sante({ etat: "connecting" }).degrade, false);
});

// --- Le défaut du 2 novembre 2026 ------------------------------------------

test("un « connecting » qui depasse le seuil force une reconnexion", () => {
  const h = horlogeFactice();
  const { s, journal } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS);
  const d = s.evaluer({ etat: "connecting" });
  assert.equal(d.action, "forcer");
  assert.match(d.raison, /reconnexion forcee 1\/3/);
  assert.equal(journal.at(-1).evenement, "reconnexion_forcee");
});

test("six heures en « connecting » ne restent JAMAIS silencieuses", () => {
  // Le cas reel : 396 minutes, reconnexions = 0.
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(396 * 60 * 1000);
  const d = s.evaluer({ etat: "connecting" });
  assert.notEqual(d.action, "rien", "l'etat bloque doit provoquer une action");
  const sante = s.sante({ etat: "connecting" });
  assert.equal(sante.degrade, true, "/sante ne doit plus repondre un vert franc");
  assert.match(sante.raison, /aucun message ne peut etre recu ni envoye/);
});

test("un « disconnected » qui dure est traite plus vite qu'un « connecting »", () => {
  // Une deconnexion a deja son evenement de reconnexion : si elle dure, c'est
  // que cet evenement n'a pas fait son travail.
  assert.ok(SEUIL_DECONNEXION_MS < SEUIL_CONNEXION_MS);
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "disconnected" });
  h.avance(SEUIL_DECONNEXION_MS);
  assert.equal(s.evaluer({ etat: "disconnected" }).action, "forcer");
});

// --- Le plafond, qui protège le numéro -------------------------------------

test("les tentatives sont espacees par un recul croissant", () => {
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS);
  assert.equal(s.evaluer({ etat: "connecting" }).action, "forcer");

  // Immediatement apres, on attend : relancer en rafale ferait bannir.
  const d = s.evaluer({ etat: "connecting" });
  assert.equal(d.action, "rien");
  assert.ok(d.attendreMs > 0, "un delai restant doit etre annonce");

  h.avance(RECULS_MS[1]);
  assert.equal(s.evaluer({ etat: "connecting" }).action, "forcer");
});

test("au-dela du plafond, le surveillant ABANDONNE au lieu d'insister", () => {
  // Un numero banni est pire que le service arrete qu'on cherche a reparer.
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS);

  let forcees = 0;
  for (let i = 0; i < 20; i += 1) {
    if (s.evaluer({ etat: "connecting" }).action === "forcer") forcees += 1;
    h.avance(10 * 60 * 1000);
  }
  assert.equal(forcees, TENTATIVES_MAX, `exactement ${TENTATIVES_MAX} tentatives, pas une de plus`);
  const d = s.evaluer({ etat: "connecting" });
  assert.equal(d.action, "abandonner");
  assert.match(d.raison, /intervention humaine requise/);
  assert.equal(s.sante({ etat: "connecting" }).abandonne, true);
});

test("une connexion retablie remet le compteur a zero", () => {
  // Sinon le plafond d'une panne interdirait de reparer la suivante.
  const h = horlogeFactice();
  const { s } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS);
  assert.equal(s.evaluer({ etat: "connecting" }).action, "forcer");

  s.evaluer({ etat: "ready" });
  h.avance(60 * 60 * 1000);

  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS);
  const d = s.evaluer({ etat: "connecting" });
  assert.equal(d.action, "forcer");
  assert.match(d.raison, /1\/3/, "le compteur doit avoir ete remis a zero");
});

// --- Robustesse -------------------------------------------------------------

test("un etat inconnu est signale, pas avale", () => {
  const h = horlogeFactice();
  const { s } = monter(h);
  const d = s.evaluer({ etat: "en_cours_de_truc" });
  assert.equal(d.action, "rien");
  assert.match(d.raison, /etat inconnu/);
});

test("un appel sans etat ne leve pas", () => {
  const h = horlogeFactice();
  const { s } = monter(h);
  assert.doesNotThrow(() => s.evaluer());
  assert.doesNotThrow(() => s.evaluer({}));
  assert.doesNotThrow(() => s.sante());
});

test("le journal ne porte ni numero ni contenu de message", () => {
  const h = horlogeFactice();
  const { s, journal } = monter(h);
  s.evaluer({ etat: "connecting" });
  h.avance(SEUIL_CONNEXION_MS);
  s.evaluer({ etat: "connecting" });
  const texte = JSON.stringify(journal);
  assert.ok(!/\d{8}/.test(texte), "aucune suite de chiffres ressemblant a un numero");
  assert.match(texte, /"evenement":"reconnexion_forcee"/);
});
