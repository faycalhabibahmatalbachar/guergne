/**
 * Recette du téléchargement d'un média entrant.
 *
 * LE DÉFAUT QUE CES TESTS EMPÊCHENT DE REVENIR
 * ---------------------------------------------
 * Chaque note vocale entrante échouait sur :
 *
 *   InvalidMediaFileType: Unexpected mimetype application/octet-stream
 *                         for media type ptt
 *
 * WhatsApp Web valide le type du média qu'il télécharge. Faute de `mimetype`
 * dans l'appel, il retombe sur `application/octet-stream`, qui n'est pas un
 * type audio acceptable pour un `ptt` — et il refuse. Mesure du 8 novembre,
 * dans la page, sur une vraie note vocale : sans le champ,
 * `InvalidMediaFileType` ; avec, 15 871 octets d'en-tête `OggS`.
 *
 * Ces tests ne parlent donc pas à WhatsApp : ils vérifient que la charge
 * envoyée à la page PORTE le type que le message déclare. C'est exactement ce
 * qui manquait, et rien d'autre ne pouvait l'attraper sans Chromium.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { WwebjsProvider } from "../src/providers/wwebjs.js";

/** Un message `ptt` tel que la passerelle Puppeteer le rend. */
function noteVocale(surcharges = {}) {
  return {
    hasMedia: true,
    type: "ptt",
    mimetype: "audio/ogg; codecs=opus",
    duration: "5",
    id: { _serialized: "false_23568663737@c.us_ABC", id: "ABC", fromMe: false, remote: "23568663737@c.us" },
    _data: {
      type: "ptt",
      mimetype: "audio/ogg; codecs=opus",
      directPath: "/v/t62.7117-24/chemin",
      encFilehash: "ZW5jRmlsZWhhc2g=",
      filehash: "ZmlsZWhhc2g=",
      mediaKey: "bWVkaWFLZXk=",
      mediaKeyTimestamp: 1794060257,
      ...surcharges,
    },
  };
}

/**
 * Un fournisseur dont la page est un mouchard : elle n'exécute rien, elle
 * retient la charge reçue. C'est tout ce qu'il faut pour juger l'appel.
 */
function fournisseurMouchard(reponse = { ok: true, base64: "T2dnUw==", etapes: {} }) {
  const provider = new WwebjsProvider({ dossierSession: "/inexistant", journal: { log() {} } });
  const vues = [];
  provider._client = {
    pupPage: {
      async evaluate(_fn, charge) {
        vues.push(charge);
        return reponse;
      },
    },
  };
  return { provider, vues };
}

test("la charge envoyee a la page porte le mimetype que le message declare", async () => {
  const { provider, vues } = fournisseurMouchard();
  const resultat = await provider._telechargerParDirectPath(noteVocale());

  assert.equal(resultat.ok, true);
  assert.equal(vues.length, 1);
  // LE CŒUR DU DÉFAUT. Sans cette ligne, WhatsApp Web refuse le média.
  assert.equal(vues[0].mimetype, "audio/ogg; codecs=opus");
  // Et les six champs d'origine restent transmis, inchangés.
  for (const champ of ["directPath", "encFilehash", "filehash", "mediaKey", "mediaKeyTimestamp", "type"]) {
    assert.ok(vues[0][champ] !== undefined, `${champ} doit etre transmis`);
  }
  assert.equal(vues[0].type, "ptt");
});

test("un mimetype absent de la charge brute est repris sur le message", async () => {
  // La charge brute et l'accesseur de la bibliotheque ne portent pas toujours
  // le meme champ : on prend le premier qui existe, sans en fabriquer un.
  const message = noteVocale({ mimetype: undefined });
  const { provider, vues } = fournisseurMouchard();
  await provider._telechargerParDirectPath(message);
  assert.equal(vues[0].mimetype, "audio/ogg; codecs=opus");
});

test("sans aucun mimetype, on n'en invente pas : la charge en porte `null`", async () => {
  const message = noteVocale({ mimetype: undefined });
  message.mimetype = undefined;
  const { provider, vues } = fournisseurMouchard();
  await provider._telechargerParDirectPath(message);
  // `null` est honnete : c'est a WhatsApp Web de refuser, pas a nous de
  // deviner un type audio pour un media dont nous ne savons rien.
  assert.equal(vues[0].mimetype, null);
});

test("le mimetype rendu est celui du message, pas celui de la page", async () => {
  const { provider } = fournisseurMouchard();
  const resultat = await provider._telechargerParDirectPath(noteVocale());
  assert.equal(resultat.media.mimetype, "audio/ogg; codecs=opus");
  assert.equal(Buffer.from(resultat.media.data, "base64").toString("utf8"), "OggS");
});

test("un champ requis absent n'appelle pas la page du tout", async () => {
  const { provider, vues } = fournisseurMouchard();
  const resultat = await provider._telechargerParDirectPath(noteVocale({ directPath: null }));
  assert.equal(resultat.ok, false);
  assert.match(resultat.raison, /directPath/);
  assert.equal(vues.length, 0, "aucun aller-retour inutile vers Chromium");
});

test("la rustine du telechargement est bien posee sur whatsapp-web.js", () => {
  // La voie directe est la nôtre, mais la voie de la bibliotheque reste le
  // second recours : si elle perd le `mimetype`, le defaut revient par la.
  // `node_modules` n'etant pas versionne, ce test est le garde-fou apres
  // chaque `npm install`.
  const require_ = createRequire(import.meta.url);
  const base = dirname(require_.resolve("whatsapp-web.js/package.json"));
  assert.equal(require_("whatsapp-web.js/package.json").version, "1.34.7");
  const source = readFileSync(join(base, "src", "structures", "Message.js"), "utf8");
  const appel = source.slice(source.indexOf("downloadAndMaybeDecrypt({"));
  const corps = appel.slice(0, appel.indexOf("});"));
  assert.match(corps, /mimetype: msg\.mimetype/, "la rustine media-mimetype-telechargement est absente : node scripts/rustine-wwebjs.mjs");
});
