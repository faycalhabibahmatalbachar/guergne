/**
 * Recette de la machine d'états du transport WhatsApp.
 *
 * Le défaut que ces tests empêchent de revenir : une panne de 7 h 27 dont le
 * seul témoignage disponible était la chaîne « connecting ».
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ETATS, EtatWhatsApp, doitSuivreChargement, versEtatHistorique } from "../src/etat-whatsapp.js";

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

// --- Le défaut observé en production le 4 novembre 2026 -------------------

test("un ecran de chargement ne fait PAS regresser un etat READY", () => {
  // Observe en production : apres READY, WhatsApp Web emet encore des
  // `loading_screen` lors de ses re-synchronisations. Les suivre a ramene
  // l'etat detaille a CONNECTING, ou il est reste 5 h 42 en contredisant
  // `whatsapp = ready`.
  assert.equal(doitSuivreChargement(ETATS.WHATSAPP_READY), false);
});

test("un ecran de chargement est suivi dans tous les autres etats", () => {
  // Pendant la montee, c'est precisement l'information utile : la page avance.
  for (const e of [
    ETATS.APPLICATION_READY,
    ETATS.WHATSAPP_INITIALIZING,
    ETATS.WHATSAPP_CONNECTING,
    ETATS.WHATSAPP_AUTHENTICATED,
    ETATS.WHATSAPP_DISCONNECTED,
    ETATS.WHATSAPP_AUTH_FAILURE,
    ETATS.WHATSAPP_ERROR,
  ]) {
    assert.equal(doitSuivreChargement(e), true, `etat ${e}`);
  }
});

test("une vraie deconnexion fait bien quitter READY", () => {
  // Le garde ne doit pas geler l'etat : `disconnected` n'est pas un chargement.
  const h = horlogeFactice();
  const { m } = monter(h);
  m.transiter(ETATS.WHATSAPP_READY);
  m.transiter(ETATS.WHATSAPP_DISCONNECTED, { raison: "perdue", compterReconnexion: true });
  assert.equal(m.etat, ETATS.WHATSAPP_DISCONNECTED);
  assert.equal(m.resume().reconnexions, 1);
});

// --- L'effondrement du navigateur, et le faux vert qu'il produisait -------

test("une page effondree QUITTE l'etat « pret »", () => {
  // Observe en production le 5 novembre 2026 : « Page crashed! » a 17 h 24,
  // et dix-sept heures plus tard /sante repondait encore WHATSAPP_READY,
  // reconnexions: 0, sur un navigateur mort. Consigner sans transiter, c'est
  // ecrire le diagnostic sans appeler personne.
  const m = new EtatWhatsApp();
  m.transiter(ETATS.WHATSAPP_READY);
  assert.equal(m.etatHistorique, "ready");

  m.effondrement("page Chromium : Page crashed!");
  assert.equal(m.etat, ETATS.WHATSAPP_ERROR);
  // « disconnected » est l'etat sur lequel le surveillant force une
  // reconnexion au bout de deux minutes. C'est tout l'objet de la bascule.
  assert.equal(m.etatHistorique, "disconnected");
  assert.match(m.resume().derniereErreur.message, /Page crashed/);
});

test("une erreur de page ORDINAIRE ne fait pas reconnecter", () => {
  // Une exception JavaScript de WhatsApp Web se consigne et se tolere : une
  // reconnexion inutile coute quarante secondes de Chromium.
  const m = new EtatWhatsApp();
  m.transiter(ETATS.WHATSAPP_READY);
  m.erreur("page Chromium : TypeError dans un script de la page");
  assert.equal(m.etat, ETATS.WHATSAPP_READY);
  assert.equal(m.etatHistorique, "ready");
});

test("un « pret » plus vieux que sa derniere erreur est signale comme suspect", () => {
  // Le relevé qui a trompé pendant dix-sept heures portait les deux faits
  // contradictoires dans le même objet. Le drapeau les confronte.
  let t = 1000;
  const m = new EtatWhatsApp({ horloge: () => t });
  m.transiter(ETATS.WHATSAPP_READY);
  assert.equal(m.resume().etatSuspect, false);

  t = 5000;
  m.erreur("page Chromium : quelque chose");
  assert.equal(m.resume().etatSuspect, true, "pret depuis 1000, erreur a 5000 : incoherent");
});

test("une erreur ANTERIEURE au passage en « pret » n'est pas suspecte", () => {
  // Une panne reparee ne doit pas rester marquee comme en cours : sinon le
  // drapeau devient du bruit, et un drapeau qui crie toujours ne sert plus.
  let t = 1000;
  const m = new EtatWhatsApp({ horloge: () => t });
  m.erreur("echec ancien");
  t = 9000;
  m.transiter(ETATS.WHATSAPP_READY);
  assert.equal(m.resume().etatSuspect, false);
});

test("l'effondrement compte comme une transition, donc comme un incident datable", () => {
  const m = new EtatWhatsApp();
  m.transiter(ETATS.WHATSAPP_READY);
  m.effondrement("Target closed");
  const r = m.resume();
  assert.equal(r.transitions.at(-1).etat, ETATS.WHATSAPP_ERROR);
  assert.match(r.transitions.at(-1).raison, /Target closed/);
  assert.equal(r.jamaisConnecte, false, "le service avait bien servi avant de tomber");
});
