import test from "node:test";
import assert from "node:assert/strict";

import { Pairing, jetonAleatoire, pageAppairage } from "../src/pairing.js";

const JETON = "jeton-de-test-0123456789";
const creer = (t0 = 0) => {
  let t = t0;
  return { p: new Pairing({ jeton: JETON, horloge: () => t }), avance: (ms) => { t += ms; } };
};

test("sans jeton configuré, le pairing est inactif et refuse tout", () => {
  const p = new Pairing({});
  assert.equal(p.actif, false);
  assert.deepEqual(p.verifier("quoi que ce soit"), { ok: false, raison: "non_configure" });
});

test("un jeton valide est accepté, un jeton faux est refusé", () => {
  const { p } = creer();
  assert.equal(p.verifier(JETON).ok, true);
  assert.deepEqual(p.verifier("mauvais"), { ok: false, raison: "invalide" });
});

test("les tentatives répétées sont bloquées", () => {
  const { p } = creer();
  for (let i = 0; i < 10; i++) p.verifier("faux");
  assert.deepEqual(p.verifier(JETON), { ok: false, raison: "trop_de_tentatives" });
});

test("la fenêtre de limitation se purge avec le temps", () => {
  const { p, avance } = creer();
  for (let i = 0; i < 10; i++) p.verifier("faux");
  avance(6 * 60_000);
  assert.equal(p.verifier(JETON).ok, true);
});

test("l'état public ne contient JAMAIS la valeur du QR", () => {
  const { p } = creer();
  p.nouveauQr("2@secret-whatsapp-qr-payload");
  const e = p.etat();
  assert.equal(e.etat, "pret");
  assert.equal(e.qrDisponible, true);
  assert.equal(JSON.stringify(e).includes("secret-whatsapp"), false);
});

test("un QR expire et n'est plus servi", () => {
  const { p, avance } = creer();
  p.nouveauQr("valeur");
  assert.equal(p.valeurCourante(), "valeur");
  avance(61_000);
  assert.equal(p.expire, true);
  assert.equal(p.valeurCourante(), null);
  assert.equal(p.etat().etat, "expire");
});

test("un nouveau QR remplace l'ancien et relance le compte à rebours", () => {
  const { p, avance } = creer();
  p.nouveauQr("ancien");
  avance(50_000);
  p.nouveauQr("nouveau");
  assert.equal(p.valeurCourante(), "nouveau");
  assert.ok(p.resteMs > 55_000);
});

test("après authentification : QR détruit et accès révoqué", () => {
  const { p } = creer();
  p.nouveauQr("valeur");
  p.marquerAuthentifie();
  assert.equal(p.valeurCourante(), null);
  assert.equal(p.actif, false);
  assert.equal(p.etat().etat, "authentifie");
  assert.deepEqual(p.verifier(JETON), { ok: false, raison: "revoque" });
});

test("une déconnexion WhatsApp rouvre le pairing", () => {
  const { p } = creer();
  p.marquerAuthentifie();
  p.reinitialiser();
  assert.equal(p.actif, true);
  assert.equal(p.verifier(JETON).ok, true);
});

test("le jeton aléatoire est assez long et sûr pour une URL", () => {
  const j = jetonAleatoire();
  assert.ok(j.length >= 32);
  assert.match(j, /^[A-Za-z0-9_-]+$/);
});

test("la page ne contient aucune valeur de QR", () => {
  const html = pageAppairage({ etat: "pret", resteMs: 42_000 });
  assert.match(html, /Lycée Guergné La Renaissance/);
  assert.match(html, /x-pairing-token/);
  assert.equal(html.includes("2@"), false);
  // Le QR est chargé par requête séparée, pas incorporé dans le HTML.
  assert.equal(html.includes("data:image"), false);
});
