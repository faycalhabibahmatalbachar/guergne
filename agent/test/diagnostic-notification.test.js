/**
 * Recette du déclencheur de notification de test.
 *
 * Une route qui envoie des messages WhatsApp est, par nature, une arme. Ces
 * tests vérifient qu'elle est incapable de servir à autre chose que ce pour
 * quoi elle existe — en particulier qu'**aucune valeur fournie de l'extérieur
 * ne peut devenir un numéro de destinataire**.
 *
 * Les numéros employés ici sont synthétiques. Les vrais ne figurent ni dans le
 * code, ni dans les tests, ni dans le dépôt : ils vivent dans le magasin
 * d'identités, sur le volume du serveur.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DiagnosticNotification, ROLES_DIAGNOSTIC, messageDeTest } from "../src/diagnostic-notification.js";

const JETON = "j".repeat(64);
const SUPER = "23500000001@c.us";
const DIR = "23500000002@c.us";

/** Magasin factice : deux identités actives, une par rôle dirigeant. */
const annuaire = async (role) => ({ SUPER_ADMIN: [SUPER], DIRECTION: [DIR] })[role] ?? [];

/** File factice : elle note ce qu'on lui confie. */
function fileFactice({ doublon = false } = {}) {
  const confiees = [];
  return {
    confiees,
    envoyerMaintenant: async (n) => {
      confiees.push(n);
      return doublon ? { ajoutee: false, raison: "doublon", envoyee: false } : { ajoutee: true, envoyee: true };
    },
  };
}

const monter = (extra = {}) => {
  const file = extra.file ?? fileFactice();
  const journal = [];
  const d = new DiagnosticNotification({
    jetonAttendu: extra.jetonAttendu === undefined ? JETON : extra.jetonAttendu,
    file,
    destinataires: extra.destinataires ?? annuaire,
    horloge: extra.horloge,
    journal: (e) => journal.push(e),
  });
  return { d, file, journal };
};

// --- Authentification -------------------------------------------------------

test("sans jeton, rien ne part", async () => {
  const { d, file } = monter();
  const r = await d.declencher({ jeton: null });
  assert.equal(r.status, 401);
  assert.equal(file.confiees.length, 0);
});

test("un jeton errone de MEME longueur est refuse", async () => {
  // La comparaison en temps constant doit etre reellement exercee.
  const { d, file } = monter();
  assert.equal((await d.declencher({ jeton: "x".repeat(64) })).status, 401);
  assert.equal(file.confiees.length, 0);
});

test("sans jeton configure, la route est INERTE", async () => {
  // Une comparaison contre `undefined` laisserait tout passer.
  const { d, file } = monter({ jetonAttendu: null });
  const r = await d.declencher({ jeton: "n'importe quoi" });
  assert.equal(r.status, 503);
  assert.equal(file.confiees.length, 0);
});

// --- Le test de sécurité central -------------------------------------------

test("AUCUNE valeur fournie ne peut devenir un destinataire", async () => {
  // C'est la propriete qui empeche cette route d'etre une porte d'envoi.
  const { d, file } = monter();
  for (const cible of ["23599999999@c.us", "autre", "SUPER_ADMIN; DIRECTION", "__proto__", "constructor", ""]) {
    const r = await d.declencher({ jeton: JETON, cible });
    assert.equal(r.status, 400, `cible « ${cible} » ne doit pas etre acceptee`);
  }
  assert.equal(file.confiees.length, 0, "aucun envoi ne doit avoir eu lieu");
});

test("la borne est gelee, et ne porte que des roles dirigeants", () => {
  assert.deepEqual([...ROLES_DIAGNOSTIC].sort(), ["DIRECTION", "SUPER_ADMIN"]);
  // Une liste modifiable ne serait plus une borne.
  assert.throws(() => {
    ROLES_DIAGNOSTIC.push("PARENT");
  });
});

test("le code source ne porte AUCUN numero reel", async () => {
  // La regle du projet : un numero ne figure jamais dans le depot. Ce test
  // echouera si quelqu'un en reintroduit un, ici ou dans le module.
  for (const f of ["../src/diagnostic-notification.js", "./diagnostic-notification.test.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    const suspects = (src.match(/\b235\d{8}\b/g) ?? []).filter((n) => !/^2350{7}\d$|^23599999999$/.test(n));
    assert.deepEqual(suspects, [], `numero reel dans ${f}`);
  }
});

test("un role sans identite active ne produit pas d'envoi silencieux", async () => {
  // Mieux vaut un refus explicite qu'un 200 qui n'a rien envoye.
  const { d, file } = monter({ destinataires: async () => [] });
  const r = await d.declencher({ jeton: JETON });
  assert.equal(r.status, 409);
  assert.match(r.corps.message, /Aucune identite active/);
  assert.equal(file.confiees.length, 0);
});

// --- Contenu ----------------------------------------------------------------

test("le message est fige, identifie comme test, et sans donnee scolaire", () => {
  const m = messageDeTest({ cible: "SUPER_ADMIN", horodatage: "2026-11-02 10:00:00 UTC" });
  assert.match(m, /\[TEST TECHNIQUE/);
  assert.match(m, /Aucune action n'est attendue/);
  assert.match(m, /aucune donnee d'eleve/);
  assert.ok(!/\d{8}/.test(m.replace(/2026-11-02|10:00:00/g, "")), "aucun numero complet");
});

test("le contenu ne vient JAMAIS de l'appelant", async () => {
  const { d, file } = monter();
  // Meme en tentant d'injecter un texte, c'est le message fige qui part.
  await d.declencher({ jeton: JETON, cible: "SUPER_ADMIN", texte: "Virement urgent, cliquez ici" });
  assert.equal(file.confiees.length, 1);
  assert.ok(!file.confiees[0].texte.includes("Virement"));
  assert.match(file.confiees[0].texte, /TEST TECHNIQUE/);
});

// --- Envoi et bornes --------------------------------------------------------

test("« tous » touche les deux roles, une fois chacun", async () => {
  const { d, file } = monter();
  const r = await d.declencher({ jeton: JETON });
  assert.equal(r.status, 200);
  assert.equal(file.confiees.length, 2);
  assert.deepEqual(file.confiees.map((c) => c.jid).sort(), [SUPER, DIR].sort());
  assert.deepEqual(
    r.corps.resultats.map((x) => x.etat),
    ["accepte_par_la_passerelle", "accepte_par_la_passerelle"],
  );
});

test("un numero present sous deux roles n'est joint qu'une fois", async () => {
  // Sinon le directeur qui cumule deux roles recevrait deux messages.
  const { d, file } = monter({ destinataires: async () => [SUPER] });
  await d.declencher({ jeton: JETON });
  assert.equal(file.confiees.length, 1);
});

test("la reponse ne confond pas « accepte » et « livre »", async () => {
  // La passerelle accuse la prise en charge, pas la reception sur le telephone.
  const { d } = monter();
  const r = await d.declencher({ jeton: JETON, cible: "SUPER_ADMIN" });
  assert.match(r.corps.avertissement, /ne prouve pas la livraison/);
  assert.equal(r.corps.resultats[0].etat, "accepte_par_la_passerelle");
});

test("un second appel rapproche est limite, pas envoye", async () => {
  let t = 1_000_000;
  const { d, file } = monter({ horloge: () => t });
  await d.declencher({ jeton: JETON, cible: "SUPER_ADMIN" });
  const second = await d.declencher({ jeton: JETON, cible: "SUPER_ADMIN" });
  assert.equal(second.corps.resultats[0].etat, "limite");
  assert.match(second.corps.resultats[0].detail, /reessayez dans \d+ s/);
  assert.equal(file.confiees.length, 1, "une seule prise en charge");

  // Passe la fenetre, l'envoi redevient possible.
  t += 11 * 60 * 1000;
  await d.declencher({ jeton: JETON, cible: "SUPER_ADMIN" });
  assert.equal(file.confiees.length, 2);
});

test("la cle de deduplication porte la fenetre, pas l'instant", async () => {
  // Deux appels dans la meme fenetre, meme apres redemarrage, partagent la
  // meme cle : la file n'enverra qu'un message.
  const t = 1_000_000;
  const file = fileFactice();
  const commun = { jetonAttendu: JETON, file, destinataires: annuaire };
  const a = new DiagnosticNotification({ ...commun, horloge: () => t });
  await a.declencher({ jeton: JETON, cible: "SUPER_ADMIN" });
  // Nouveau processus, meme fenetre.
  const b = new DiagnosticNotification({ ...commun, horloge: () => t + 1000 });
  await b.declencher({ jeton: JETON, cible: "SUPER_ADMIN" });
  assert.equal(file.confiees[0].cle, file.confiees[1].cle, "la file dedoublonnera");
});

test("un doublon detecte par la file est annonce comme tel", async () => {
  const { d } = monter({ file: fileFactice({ doublon: true }) });
  const r = await d.declencher({ jeton: JETON, cible: "DIRECTION" });
  assert.equal(r.corps.resultats[0].etat, "doublon_ignore");
});

test("un magasin mal cable est refuse a la construction", () => {
  // Sans destinataires, la route serait muette sans qu'on sache pourquoi.
  assert.throws(() => new DiagnosticNotification({ jetonAttendu: JETON, file: fileFactice() }), /destinataires/);
});

// --- Journalisation ---------------------------------------------------------

test("le journal ne porte aucun numero complet ni aucun jeton", async () => {
  const { d, journal } = monter();
  await d.declencher({ jeton: "mauvais".padEnd(64, "x") });
  await d.declencher({ jeton: JETON });
  const texte = JSON.stringify(journal);
  for (const jid of [SUPER, DIR]) {
    assert.ok(!texte.includes(jid.split("@")[0]), "aucun numero complet");
  }
  assert.ok(!texte.includes(JETON), "aucun jeton");
  assert.match(texte, /"evenement":"refus"/);
  assert.match(texte, /"evenement":"envoi"/);
});
