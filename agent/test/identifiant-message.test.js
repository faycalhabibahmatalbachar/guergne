/**
 * Recette de la reconstitution des identifiants de message.
 *
 * C'est le correctif du défaut qui faisait échouer CHAQUE note vocale
 * entrante : `_serialized` absent, donc `downloadMedia()` appelé avec
 * `undefined`, donc une erreur minifiée d'une lettre. Ces tests portent
 * d'abord sur la forme exacte attendue par WhatsApp, puis sur les cas où il
 * faut refuser de deviner.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { partieIdMessage, reparerIdMessage, reparerIdentifiant, serialiserIdMessage } from "../src/providers/identifiant-message.js";

test("un `_serialized` fourni est repris tel quel, sans rien deviner", () => {
  const id = { _serialized: "false_123@c.us_ABC", remote: "999@c.us", id: "ZZZ", fromMe: true };
  assert.equal(serialiserIdMessage(id), "false_123@c.us_ABC");
});

test("sans `_serialized`, l'identifiant est reconstitue en trois champs", () => {
  // C'est la forme que `Client.getMessageById` exige : il refuse toute autre
  // longueur que trois ou quatre champs.
  assert.equal(
    serialiserIdMessage({ fromMe: false, remote: "111@c.us", id: "A1B2" }),
    "false_111@c.us_A1B2",
  );
  assert.equal(
    serialiserIdMessage({ fromMe: true, remote: "111@c.us", id: "A1B2" }),
    "true_111@c.us_A1B2",
  );
});

test("un message de groupe porte un quatrieme champ : le participant", () => {
  assert.equal(
    serialiserIdMessage({ fromMe: false, remote: "g@g.us", id: "A1", participant: "222@c.us" }),
    "false_g@g.us_A1_222@c.us",
  );
});

test("un `remote` objet est accepte : la passerelle rend parfois un WID", () => {
  assert.equal(
    serialiserIdMessage({ fromMe: false, remote: { _serialized: "333@lid" }, id: "A1" }),
    "false_333@lid_A1",
  );
});

test("une chaine est deja un identifiant", () => {
  assert.equal(serialiserIdMessage("true_1@c.us_X"), "true_1@c.us_X");
});

// --- Ce qu'il faut refuser de deviner -----------------------------------

test("sans `remote` ni `id`, on rend null plutot qu'un identifiant invente", () => {
  // Un identifiant fabrique au hasard ferait echouer WhatsApp Web avec la
  // meme erreur illisible qu'avant : mieux vaut un refus nomme.
  for (const cas of [null, undefined, 42, {}, { fromMe: true }, { remote: "1@c.us" }, { id: "A1" }, ""]) {
    assert.equal(serialiserIdMessage(cas), null, `cas : ${JSON.stringify(cas)}`);
  }
});

test("un `_serialized` vide n'est pas pris pour une valeur", () => {
  assert.equal(serialiserIdMessage({ _serialized: "", remote: "1@c.us", id: "A1" }), "false_1@c.us_A1");
});

// --- La partie journalisable ---------------------------------------------

test("la partie opaque ne porte aucun numero", () => {
  const partie = partieIdMessage({ fromMe: false, remote: "23500000000@c.us", id: "3A7F2C" });
  assert.equal(partie, "3A7F2C");
  assert.ok(!partie.includes("235"), "aucun fragment de numero ne doit figurer");
});

test("la partie opaque se lit aussi depuis un identifiant complet", () => {
  assert.equal(partieIdMessage("false_1@c.us_3A7F2C"), "3A7F2C");
  assert.equal(partieIdMessage("incomplet"), null);
});

// --- La reparation sur place ---------------------------------------------

test("la reparation pose `_serialized` pour que la bibliotheque le lise", () => {
  // C'est exactement ce dont `Message.downloadMedia()` a besoin : il passe
  // `this.id._serialized` au code de la page, sans savoir qu'il a ete complete.
  const message = { id: { fromMe: false, remote: "1@c.us", id: "A1" }, hasMedia: true };
  const r = reparerIdMessage(message);
  assert.deepEqual(r, { ok: true, repare: true, id: "false_1@c.us_A1" });
  assert.equal(message.id._serialized, "false_1@c.us_A1");
});

test("un identifiant deja complet n'est pas touche", () => {
  const message = { id: { _serialized: "deja", remote: "1@c.us", id: "A1" } };
  const r = reparerIdMessage(message);
  assert.equal(r.repare, false);
  assert.equal(r.ok, true);
  assert.equal(message.id._serialized, "deja");
});

test("un identifiant inexploitable est signale, pas repare en silence", () => {
  const r = reparerIdMessage({ id: { fromMe: true } });
  assert.deepEqual(r, { ok: false, repare: false, id: null });
});

test("un objet gele ne fait pas lever : on le dit non reparable", () => {
  const message = { id: Object.freeze({ fromMe: false, remote: "1@c.us", id: "A1" }) };
  const r = reparerIdMessage(message);
  assert.equal(r.ok, false);
  assert.equal(r.id, "false_1@c.us_A1", "la valeur reste connue, meme si elle n'a pu etre posee");
});

// --- Le vrai nom de la valeur depuis juillet 2026 : `$1` ----------------

test("`$1` est lu : WhatsApp a RENOMME `_serialized`, il ne l'a pas supprime", () => {
  // Commit amont 95dc87d1 : « add fallback for WhatsApp id._serialized
  // renamed to id.$1 ». La valeur exacte vaut mieux qu'une reconstitution.
  const id = { $1: "false_235@c.us_3A7F", remote: "autre@c.us", id: "AUTRE", fromMe: true };
  assert.equal(serialiserIdMessage(id), "false_235@c.us_3A7F");
});

test("`_serialized` reste prioritaire la ou il existe encore", () => {
  assert.equal(
    serialiserIdMessage({ _serialized: "ancien", $1: "nouveau", remote: "1@c.us", id: "A" }),
    "ancien",
  );
});

test("un `remote` sous son nouveau nom est accepte lui aussi", () => {
  assert.equal(
    serialiserIdMessage({ fromMe: false, remote: { $1: "333@lid" }, id: "A1" }),
    "false_333@lid_A1",
  );
});

test("la reparation reconnait `$1` et ne reconstitue donc rien", () => {
  const message = { id: { $1: "false_1@c.us_EXACT", remote: "1@c.us", id: "EXACT" } };
  const r = reparerIdMessage(message);
  assert.equal(r.repare, true);
  assert.equal(message.id._serialized, "false_1@c.us_EXACT");
});

test("la partie opaque se lit aussi quand seul `$1` est present", () => {
  assert.equal(partieIdMessage({ $1: "false_1@c.us_3A7F" }), "3A7F");
});

test("faute de tout nom connu, la reconstitution prend le relais", () => {
  // Le jour ou WhatsApp renommera encore, ce chemin reste.
  assert.equal(
    serialiserIdMessage({ fromMe: false, remote: "1@c.us", id: "A1", $2: "nom inconnu" }),
    "false_1@c.us_A1",
  );
});

// --- Le meme defaut sur une CONVERSATION, et non un message -------------

test("l'identifiant d'une conversation se repare aussi", () => {
  // Deuxieme site du meme defaut, prouve en production : `Chat.fetchMessages`
  // passe `this.id._serialized` a la page (Chat.js:242), donc `undefined`, et
  // la page leve la meme erreur minifiee d'une lettre que pour les medias.
  const conversation = { id: { server: "lid", user: "123456", $1: "123456@lid" }, name: "x" };
  const r = reparerIdentifiant(conversation);
  assert.deepEqual(r, { ok: true, repare: true, id: "123456@lid" });
  assert.equal(conversation.id._serialized, "123456@lid");
});

test("un identifiant de conversation n'est PAS reconstitue a partir de rien", () => {
  // Un WID n'a ni `fromMe` ni `remote` : il n'y a rien a reconstituer, et
  // inventer un identifiant ferait echouer WhatsApp Web avec la meme erreur
  // illisible. Mieux vaut un refus nomme, qui empeche l'envoi.
  const r = reparerIdentifiant({ id: { server: "lid", user: "123456" } });
  assert.deepEqual(r, { ok: false, repare: false, id: null });
});

test("une conversation deja complete n'est pas touchee", () => {
  const conversation = { id: { _serialized: "123@c.us", server: "c.us", user: "123" } };
  const r = reparerIdentifiant(conversation);
  assert.equal(r.repare, false);
  assert.equal(r.id, "123@c.us");
});

// --- Les types de message que le transport accepte ----------------------

test("les notifications de protocole ne sont PAS des messages", async () => {
  // Observe en local le 7 novembre : un `e2e_notification` a traverse tout le
  // pipeline et l'agent a repondu « Numero non autorise. » a un identifiant
  // systeme. Deux fautes : un tour d'agent depense pour rien, et un envoi a
  // quelque chose qui n'est pas un correspondant.
  const { TYPES_TRAITES } = await import("../src/providers/wwebjs.js");
  for (const interne of [
    "e2e_notification",
    "gp2",
    "notification_template",
    "call_log",
    "protocol",
    "ciphertext",
    "revoked",
  ]) {
    assert.equal(TYPES_TRAITES.has(interne), false, `${interne} ne doit pas etre traite`);
  }
});

test("les messages humains, eux, sont bien acceptes", async () => {
  // Le risque inverse : une liste trop etroite ferait disparaitre de vrais
  // messages en silence.
  const { TYPES_TRAITES } = await import("../src/providers/wwebjs.js");
  for (const humain of ["chat", "ptt", "audio", "image", "document", "video"]) {
    assert.equal(TYPES_TRAITES.has(humain), true, `${humain} doit etre traite`);
  }
});
