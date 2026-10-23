import assert from "node:assert/strict";
import test from "node:test";

import { preparerMessageSMTP } from "./smtp-message.ts";

const lien = "https://lycee-guergne-renaissance.vercel.app/auth/reinitialiser?jeton=abc_123.def-123";

test("entêtes et corps du mail de récupération SMTP conformes", () => {
  const resultat = preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com",
    destinataire: "personnel@example.com",
    lien,
  });
  assert.match(resultat, /From: =\?UTF-8\?B\?.+? <guergnerenaissance@gmail\.com>/);
  assert.match(resultat, /To: <personnel@example\.com>/);
  assert.match(resultat, /Content-Transfer-Encoding: base64\r\n/);
  assert.ok(Buffer.from(resultat.split("\r\n\r\n")[1], "base64").toString("utf8").includes(lien));
});

test("rejette l'injection d'en-têtes et les liens externes", () => {
  assert.throws(() => preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com\r\nBcc: hacker@example.com",
    destinataire: "personnel@example.com",
    lien,
  }));
  assert.throws(() => preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com",
    destinataire: "personnel@example.com",
    lien: "https://site-externe.tld/auth/reinitialiser?jeton=abc",
  }));
  assert.throws(() => preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com",
    destinataire: "personnel@example.com\r\nBcc: hacker@example.com",
    lien,
  }));
});
