import test from "node:test";
import assert from "node:assert/strict";

import { Pairing, jetonAleatoire, jetonDeServiceValide, pageAppairage } from "../src/pairing.js";

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
  for (let i = 0; i < 10; i++) p.verifier("faux", { origine: "x" });
  assert.deepEqual(p.verifier(JETON, { origine: "x" }), { ok: false, raison: "trop_de_tentatives" });
});

test("la fenêtre de limitation se purge avec le temps", () => {
  const { p, avance } = creer();
  for (let i = 0; i < 10; i++) p.verifier("faux", { origine: "x" });
  avance(6 * 60_000);
  assert.equal(p.verifier(JETON, { origine: "x" }).ok, true);
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

test("un jeton utilise est BRULE : la deconnexion ne le ressuscite pas", () => {
  const { p } = creer();
  p.marquerAuthentifie();
  p.reinitialiser();
  assert.equal(p.actif, false, "sans secret neuf, l'appairage reste ferme");
  assert.deepEqual(p.verifier(JETON), { ok: false, raison: "non_configure" });
});

test("un nouveau pairing exige un secret NEUF", () => {
  const { p } = creer();
  p.marquerAuthentifie();
  p.reinitialiser({ nouveauJeton: "un-tout-nouveau-secret-xyz" });
  assert.equal(p.actif, true);
  assert.equal(p.verifier("un-tout-nouveau-secret-xyz").ok, true);
  // « revoque » et non « invalide » : l'ancien secret est connu ET brûlé, ce qui
  // est une information plus juste qu'un simple rejet.
  assert.deepEqual(p.verifier(JETON), { ok: false, raison: "revoque" });
});

test("rejouer un ancien jeton brule est refuse meme comme nouveau secret", () => {
  const { p } = creer();
  p.marquerAuthentifie();
  p.reinitialiser({ nouveauJeton: JETON });
  assert.equal(p.actif, false, "un secret deja utilise ne peut pas etre represente");
});

test("la limitation est PAR ORIGINE : un attaquant ne bloque pas le personnel", () => {
  const { p } = creer();
  for (let i = 0; i < 10; i++) p.verifier("faux", { origine: "1.2.3.4" });
  assert.deepEqual(p.verifier("faux", { origine: "1.2.3.4" }), { ok: false, raison: "trop_de_tentatives" });
  assert.equal(p.verifier(JETON, { origine: "5.6.7.8" }).ok, true, "une autre origine reste servie");
});

test("un succes efface le compteur de l'origine", () => {
  const { p } = creer();
  for (let i = 0; i < 5; i++) p.verifier("faux", { origine: "a" });
  assert.equal(p.verifier(JETON, { origine: "a" }).ok, true);
  for (let i = 0; i < 9; i++) p.verifier("faux", { origine: "a" });
  assert.equal(p.verifier(JETON, { origine: "a" }).ok, true, "le compteur doit avoir ete remis a zero");
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

// --- La voie serveur-a-serveur -------------------------------------------
//
// Elle existe pour que l'ecran d'administration puisse lire l'etat et le QR
// sans qu'un humain aille chercher un fichier dans le conteneur. Elle ne doit
// surtout pas devenir une porte derobee : ces tests fixent ses limites.

test("le jeton de service est accepte tel quel", () => {
  assert.equal(jetonDeServiceValide("secret-de-service", "secret-de-service"), true);
});

test("un jeton de service faux est refuse", () => {
  assert.equal(jetonDeServiceValide("secret-de-servicX", "secret-de-service"), false);
});

test("un prefixe correct ne suffit pas", () => {
  // Une comparaison naive qui s'arrete au premier octet different laisse
  // deviner le secret octet par octet. Ici, les longueurs differentes sont
  // rejetees avant toute comparaison.
  assert.equal(jetonDeServiceValide("secret", "secret-de-service"), false);
});

test("sans secret configure, aucune voie de service n'existe", () => {
  // Le defaut le plus dangereux serait qu'un deploiement sans
  // AGENT_SERVICE_TOKEN accepte un en-tete vide comme preuve d'identite.
  for (const attendu of [null, undefined, ""]) {
    assert.equal(jetonDeServiceValide("n'importe quoi", attendu), false);
    assert.equal(jetonDeServiceValide("", attendu), false);
  }
});

test("un en-tete absent ou non textuel est refuse", () => {
  for (const fourni of [undefined, null, "", 0, 1, [], {}, ["secret-de-service"]]) {
    assert.equal(jetonDeServiceValide(fourni, "secret-de-service"), false);
  }
});

test("le jeton de service n'est PAS brule par une authentification", () => {
  // C'est la difference voulue avec le jeton d'appairage : le backend garde
  // son identite apres le scan, sinon l'ecran cesserait de fonctionner.
  const p = new Pairing({ jeton: "jeton-humain-0123456789" });
  p.nouveauQr("valeur");
  p.marquerAuthentifie();
  assert.equal(p.verifier("jeton-humain-0123456789").ok, false);
  assert.equal(jetonDeServiceValide("secret-de-service", "secret-de-service"), true);
});
