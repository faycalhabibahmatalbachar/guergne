import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chiffrer, dechiffrer, empreintePair, empreinteMessageId, filtrerParametresContexte, lireCleMemoire } from "../src/memory.js";

test("AES-256-GCM chiffre et déchiffre les messages", () => {
  const key = randomBytes(32);
  const clear = "Quels sont les élèves de la classe 6e ?";
  const encrypted = chiffrer(clear, key);
  assert.equal(dechiffrer(encrypted, key), clear);
  assert.equal(encrypted.nonce.length, 12);
  assert.equal(encrypted.tag.length, 16);
  assert.equal(encrypted.ciphertext.includes(Buffer.from(clear)), false);
});

test("AES-GCM détecte les altérations et rejette les clés invalides", () => {
  const key = randomBytes(32);
  const encrypted = chiffrer("texte confidentiel", key);
  const altered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
  altered.ciphertext[0] ^= 1;
  assert.throws(() => dechiffrer(altered, key));
  assert.throws(() => lireCleMemoire("pas-une-cle"), /32 octets/);
});

test("le HMAC du JID est stable et ne contient pas le numéro", () => {
  const key = randomBytes(32);
  const jid = "23566000001@c.us";
  const a = empreintePair(jid, key);
  assert.equal(a, empreintePair(jid, key));
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a.includes(jid), false);
  assert.notEqual(a, empreintePair(jid, randomBytes(32)));
});


test("les identifiants de message fournisseur sont pseudonymisés par HMAC", () => {
  const key = randomBytes(32);
  const id = "wamid.ABC123456789";
  const digest = empreinteMessageId(id, key);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, empreinteMessageId(id, key));
  assert.notEqual(digest, id);
  assert.notEqual(digest, empreinteMessageId(id, randomBytes(32)));
  assert.equal(empreinteMessageId(null, key), null);
});


test("le contexte durable ne conserve que les filtres scolaires non identifiants", () => {
  const classeId = "00000000-0000-4000-8000-000000000006";
  const periodeId = "00000000-0000-4000-8000-000000000099";
  const safe = filtrerParametresContexte({
    classeId,
    periodeId,
    depuis: "2026-10-01",
    inscriptionId: "id-eleve-privé",
    absenceIds: ["absence-1"],
    recherche: "Nom de l'élève",
    nom: "Nom de l'élève",
    motif: "information confidentielle",
  });
  assert.deepEqual(safe, {
    classeId,
    periodeId,
    depuis: "2026-10-01",
  });
});
