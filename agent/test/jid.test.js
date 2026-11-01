/**
 * Recette des identifiants WhatsApp.
 *
 * Le défaut que ces tests verrouillent a mis le service à l'arrêt fonctionnel :
 * l'agent comparait la partie numérique de `msg.from` à la liste blanche, ce
 * qui n'a de sens que pour `…@c.us`. Un identifiant LID y ressemble — des
 * chiffres, une arobase — mais ne désigne aucun abonné téléphonique.
 *
 * Aucun numéro réel n'apparaît : les valeurs sont synthétiques.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  RAISONS,
  SERVEURS,
  analyserJid,
  empreinte,
  jidUtilisateur,
  resoudreNumeroDepuisJid,
} from "../src/jid.js";

const NUM = "23560000001"; // synthétique
const JID = `${NUM}@c.us`;

// --- Décomposition ---------------------------------------------------------

test("une conversation individuelle porte le numero dans sa partie gauche", () => {
  const a = analyserJid(JID);
  assert.equal(a.valide, true);
  assert.equal(a.serveur, SERVEURS.UTILISATEUR);
  assert.equal(a.partie, NUM);
  assert.equal(a.porteLeNumero, true);
});

test("un LID ne porte PAS de numero, meme si sa partie gauche est numerique", () => {
  // C'est toute la difficulte : rien ne distingue visuellement un LID d'un
  // numero. Seul le serveur le dit.
  const a = analyserJid("198765432109876@lid");
  assert.equal(a.valide, true);
  assert.equal(a.serveur, SERVEURS.LID);
  assert.equal(a.porteLeNumero, false, "traiter cette valeur comme un numero est le defaut d'origine");
});

test("le suffixe d'appareil ne fait pas partie de l'identifiant", () => {
  assert.equal(analyserJid(`${NUM}:12@c.us`).partie, NUM);
});

test("groupes, diffusions et formes alternatives sont reconnus", () => {
  assert.equal(analyserJid("1234567890-1600000000@g.us").serveur, SERVEURS.GROUPE);
  assert.equal(analyserJid("status@broadcast").serveur, SERVEURS.DIFFUSION);
  const alt = analyserJid(`${NUM}@s.whatsapp.net`);
  assert.equal(alt.porteLeNumero, true, "forme alternative du meme adressage");
});

test("une valeur qui n'est pas un JID est signalee comme telle", () => {
  for (const mauvais of ["", "   ", "abc", NUM, "@c.us", `${NUM}@`, null, undefined]) {
    assert.equal(analyserJid(mauvais).valide, false, JSON.stringify(mauvais));
  }
});

test("un serveur inconnu n'est pas accepte par defaut", () => {
  // Accepter l'inconnu, c'est accepter de lire un identifiant futur comme un
  // numero — exactement le defaut que ce module corrige.
  assert.equal(analyserJid("123@newserver").valide, false);
});

// --- Résolution du numéro --------------------------------------------------

test("c.us : le numero est pris directement, sans aller-retour reseau", async () => {
  let appels = 0;
  const r = await resoudreNumeroDepuisJid({
    jid: JID,
    resoudreLid: async () => {
      appels += 1;
      return null;
    },
  });
  assert.deepEqual({ ok: r.ok, numero: r.numero, viaLid: r.viaLid }, { ok: true, numero: NUM, viaLid: false });
  assert.equal(appels, 0, "interroger WhatsApp pour un numero deja connu ralentit chaque message");
});

test("LID : le numero reel vient du transport, pas de la partie gauche", async () => {
  const r = await resoudreNumeroDepuisJid({
    jid: "198765432109876@lid",
    resoudreLid: async () => JID,
  });
  assert.equal(r.ok, true);
  assert.equal(r.numero, NUM);
  assert.equal(r.viaLid, true);
});

test("LID : la partie numerique n'est JAMAIS utilisee en repli", async () => {
  // Le scenario qui compte : un LID dont les chiffres ressemblent a un numero
  // autorise. Sans resolution, l'ancien code l'aurait accepte.
  const r = await resoudreNumeroDepuisJid({ jid: `${NUM}@lid` });
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.LID_NOT_RESOLVED);
});

test("LID : une resolution qui echoue, rend null ou leve, refuse proprement", async () => {
  for (const resoudreLid of [async () => null, async () => undefined, async () => { throw new Error("hors ligne"); }]) {
    const r = await resoudreNumeroDepuisJid({ jid: "198765432109876@lid", resoudreLid });
    assert.equal(r.ok, false);
    assert.equal(r.raison, RAISONS.LID_NOT_RESOLVED);
  }
});

test("LID : une reponse qui n'est pas un JID telephonique est refusee", async () => {
  // Rendre un LID pour un LID ne resout rien ; l'accepter ferait croire a une
  // identite etablie.
  const r = await resoudreNumeroDepuisJid({
    jid: "198765432109876@lid",
    resoudreLid: async () => "198765432109876@lid",
  });
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.LID_NOT_RESOLVED);
});

test("groupe et diffusion sont refuses avec leur propre raison", async () => {
  assert.equal((await resoudreNumeroDepuisJid({ jid: "123-456@g.us" })).raison, RAISONS.GROUP_NOT_SUPPORTED);
  assert.equal((await resoudreNumeroDepuisJid({ jid: "status@broadcast" })).raison, RAISONS.BROADCAST_NOT_SUPPORTED);
});

test("un JID invalide est refuse avant toute recherche", async () => {
  assert.equal((await resoudreNumeroDepuisJid({ jid: "n'importe quoi" })).raison, RAISONS.INVALID_JID);
});

test("un JID telephonique sans aucun chiffre ne passe pas", async () => {
  assert.equal((await resoudreNumeroDepuisJid({ jid: "abc@c.us" })).raison, RAISONS.NORMALIZATION_FAILED);
});

test("jidUtilisateur reconstruit la forme canonique", () => {
  assert.equal(jidUtilisateur("+235 60 00 00 01"), JID);
  assert.equal(jidUtilisateur(NUM), JID);
});

// --- Empreintes ------------------------------------------------------------

test("l'empreinte compare sans divulguer", () => {
  const sel = "sel-de-session";
  const e = empreinte(NUM, sel);
  assert.match(e, /^[0-9a-f]{8}$/);
  assert.equal(empreinte(`+235 60 00 00 01`, sel), e, "meme numero, meme empreinte quelle que soit l'ecriture");
  assert.notEqual(empreinte("23560000002", sel), e, "deux numeros, deux empreintes");
  assert.ok(!e.includes(NUM.slice(-4)), "l'empreinte ne contient aucun fragment du numero");
});

test("le sel rend les empreintes incomparables d'une session a l'autre", () => {
  // Sans sel, 10^8 numeros possibles se cassent par force brute en quelques
  // secondes : l'empreinte deviendrait un identifiant publiable, ce qu'elle
  // n'est pas.
  assert.notEqual(empreinte(NUM, "session-a"), empreinte(NUM, "session-b"));
});

test("une valeur vide n'a pas d'empreinte", () => {
  assert.equal(empreinte("", "sel"), null);
  assert.equal(empreinte(null, "sel"), null);
});
