/**
 * Recette de la machine d'états du transport WhatsApp.
 *
 * Le défaut que ces tests empêchent de revenir : une panne de 7 h 27 dont le
 * seul témoignage disponible était la chaîne « connecting ».
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ETATS, EtatWhatsApp, versEtatHistorique } from "../src/etat-whatsapp.js";

function horlogeFactice(depart = 1_000_000) {
  let t = depart;
  return { maintenant: () => t, avance: (ms) => (t += ms) };
}

const monter = (h) => {
  const journal = [];
  return { m: new EtatWhatsApp({ horloge: h.maintenant, journal: (e) => journal.push(e) }), journal };
};

// --- Compatibilité : ne rien casser de ce qui marche ----------------------

test("les huit etats demandes existent", () => {
  assert.deepEqual(Object.keys(ETATS).sort(), [
    "APPLICATION_READY",
    "WHATSAPP_AUTHENTICATED",
    "WHATSAPP_AUTH_FAILURE",
    "WHATSAPP_CONNECTING",
    "WHATSAPP_DISCONNECTED",
    "WHATSAPP_ERROR",
    "WHATSAPP_INITIALIZING",
    "WHATSAPP_READY",
  ]);
});

test("la traduction vers les quatre etats historiques est fidele", () => {
  // `/sante`, le surveillant et leurs tests dependent de ces quatre valeurs.
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_READY, false), "ready");
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_INITIALIZING, false), "connecting");
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_CONNECTING, false), "connecting");
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_AUTHENTICATED, false), "connecting");
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_DISCONNECTED, false), "disconnected");
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_AUTH_FAILURE, false), "disconnected");
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_ERROR, false), "disconnected");
});

test("l'attente d'un QR prime sur l'etat, car elle attend un humain", () => {
  assert.equal(versEtatHistorique(ETATS.WHATSAPP_CONNECTING, true), "qr");
});

// --- Le scénario réel du 2 novembre 2026 ---------------------------------

test("une application vivante avec un WhatsApp mort ne se declare PAS connectee", () => {
  // C'est la confusion exacte qui a coute sept heures.
  const h = horlogeFactice();
  const { m } = monter(h);
  assert.equal(m.etat, ETATS.APPLICATION_READY);
  assert.equal(m.etatHistorique, "disconnected", "l'application prete n'est pas WhatsApp pret");
  assert.equal(m.resume().jamaisConnecte, true);
});

test("Chromium qui s'effondre produit une erreur NOMMEE, pas un silence", () => {
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter(ETATS.WHATSAPP_INITIALIZING, { raison: "lancement de Chromium" });
  h.avance(6 * 60 * 1000);
  m.transiter(ETATS.WHATSAPP_ERROR, { raison: "initialisation suspendue au-dela de 6 min" });

  const r = m.resume();
  assert.equal(r.etat, ETATS.WHATSAPP_ERROR);
  assert.match(r.derniereErreur.message, /suspendue/);
  assert.equal(r.derniereErreur.ilYaS, 0);
  assert.equal(r.jamaisConnecte, true, "le service n'a jamais servi : ce n'est pas une coupure");
});

test("sept heures de connexion sont visibles, et cumulees sur plusieurs tentatives", () => {
  // Le cas reel annonçait « connecting » sans dire depuis quand.
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter(ETATS.WHATSAPP_CONNECTING);
  h.avance(4 * 60 * 1000);
  m.transiter(ETATS.WHATSAPP_DISCONNECTED, { raison: "perdue", compterReconnexion: true });
  m.transiter(ETATS.WHATSAPP_CONNECTING);
  h.avance(4 * 60 * 1000);

  const r = m.resume();
  assert.equal(r.connexionCumuleeS, 8 * 60, "deux tentatives de 4 min font 8 min, pas 4");
  assert.equal(r.reconnexions, 1);
  assert.equal(r.depuisS, 4 * 60);
});

test("atteindre « ready » remet le cumul de connexion a zero", () => {
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter(ETATS.WHATSAPP_CONNECTING);
  h.avance(5 * 60 * 1000);
  m.transiter(ETATS.WHATSAPP_READY);
  assert.equal(m.resume().connexionCumuleeS, 0);
  assert.equal(m.resume().jamaisConnecte, false);
});

// --- Ce que /sante doit porter --------------------------------------------

test("le resume dit quand un message est arrive, et il y a combien de temps", () => {
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter(ETATS.WHATSAPP_READY);
  m.messageRecu();
  h.avance(90_000);
  assert.equal(m.resume().dernierMessageRecuIlYaS, 90);
  assert.match(m.resume().dernierMessageRecu, /^\d{4}-\d{2}-\d{2}T/);
});

test("un envoi refuse est distingue d'un envoi accepte", () => {
  const h = horlogeFactice();
  const { m } = monter(h);
  m.envoiTente({ ok: true });
  assert.equal(m.resume().dernierEnvoi.statut, "accepte");
  m.envoiTente({ ok: false, raison: "session absente" });
  assert.equal(m.resume().dernierEnvoi.statut, "echec");
  assert.match(m.resume().dernierEnvoi.raison, /session absente/);
});

test("les transitions sont conservees, et bornees a dix", () => {
  // Sans historique on ne raconte pas une panne ; sans borne on remplit la
  // memoire d'un processus qui tourne des mois.
  const h = horlogeFactice();
  const { m } = monter(h);
  for (let i = 0; i < 25; i += 1) {
    h.avance(1000);
    m.transiter(i % 2 ? ETATS.WHATSAPP_CONNECTING : ETATS.WHATSAPP_DISCONNECTED);
  }
  assert.equal(m.resume().transitions.length, 10);
});

// --- Robustesse -----------------------------------------------------------

test("un etat inconnu devient une ERREUR nommee, il n'est pas avale", () => {
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter("TOUT_VA_BIEN");
  assert.equal(m.etat, ETATS.WHATSAPP_ERROR);
  assert.match(m.resume().derniereErreur.message, /etat inconnu/);
});

test("le resume ne leve jamais, meme sans aucun evenement", () => {
  const h = horlogeFactice();
  const { m } = monter(h);
  assert.doesNotThrow(() => m.resume());
  const r = m.resume();
  assert.equal(r.dernierMessageRecu, null);
  assert.equal(r.dernierEnvoi, null);
  assert.equal(r.derniereErreur, null);
});

test("le journal ne porte ni numero ni contenu de message", () => {
  const h = horlogeFactice();
  const { m, journal } = monter(h);
  m.transiter(ETATS.WHATSAPP_CONNECTING, { raison: "chargement 42%" });
  m.messageRecu();
  m.qrPropose();
  const texte = JSON.stringify(journal);
  assert.ok(!/\d{8}/.test(texte), "aucune suite de chiffres ressemblant a un numero");
  assert.match(texte, /whatsapp_etat/);
});

test("une raison trop longue est tronquee, pas recopiee entiere", () => {
  // Une trace de Chromium peut faire des kilo-octets et noyer le journal.
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter(ETATS.WHATSAPP_ERROR, { raison: "x".repeat(5000) });
  assert.ok(m.resume().derniereErreur.message.length <= 200);
});
