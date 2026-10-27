import assert from "node:assert/strict";
import test from "node:test";

import { creerContenuReinitialisation, preparerMessageSMTP } from "./smtp-message.ts";

const lien = "https://lycee-guergne-renaissance.vercel.app/auth/reinitialiser?jeton=abc_123.def-123";

test("email Gmail possède un lien, le logo, et des alternatives HTML et texte", () => {
  const message = preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com",
    destinataire: "personnel@example.com",
    lien,
  });
  const contenu = creerContenuReinitialisation(lien);
  assert.match(message, /From: =\?UTF-8\?B\?.+? <guergnerenaissance@gmail\.com>/);
  assert.match(message, /To: <personnel@example.com>/);
  assert.match(message, /Content-Type: multipart\/alternative; boundary="lgr-[0-9a-f]+"/);
  assert.match(message, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(message, /Content-Type: text\/html; charset=UTF-8/);
  assert.ok(contenu.texte.includes(lien));
  assert.ok(contenu.html.includes('href="' + lien + '"'));
  assert.ok(contenu.html.includes("logo-officiel.png"));
  assert.ok(contenu.html.includes("20 minutes"));
  assert.ok(message.includes(Buffer.from(contenu.texte).toString("base64").slice(0,30)));
  assert.ok(message.includes(Buffer.from(contenu.html).toString("base64").slice(0,30)));
});

test("refuse les adresses injectées et les liens externes", () => {
  assert.throws(() => preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com\r\nBcc: hacker@example.com",
    destinataire: "personnel@example.com",
    lien,
  }));
  assert.throws(() => preparerMessageSMTP({
    expediteur: "guergnerenaissance@gmail.com",
    destinataire: "personnel@example.com\r\nBcc: hacker@example.com",
    lien,
  }));
  assert.throws(() => creerContenuReinitialisation("https://externe.tld/auth/reinitialiser?jeton=abc"));
});
