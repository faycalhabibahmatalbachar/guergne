/**
 * Tests d'INTÉGRATION HTTP des routes d'appairage.
 *
 * Distincts des tests unitaires de `Pairing` : ceux-ci montent un vrai serveur
 * HTTP, envoient de vraies requêtes et vérifient les codes, les en-têtes et le
 * corps. Un module correct mal câblé reste une faille — c'est précisément ce
 * que ces tests attrapent.
 *
 * Le serveur est construit ici avec la MÊME logique que `index.js`. Aucun
 * WhatsApp, aucun Chromium : seules les routes sont exercées.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import QRCode from "qrcode";

import { Pairing, pageAppairage } from "../src/pairing.js";

const JETON = "jeton-integration-0123456789";

function entetesSurs(extra = {}) {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, private",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  };
}

/** Monte un serveur réel autour d'un Pairing donné. */
async function monter(pairing) {
  const autorise = (req, res) => {
    const r = pairing.verifier(req.headers["x-pairing-token"], {
      origine: req.socket?.remoteAddress ?? "inconnue",
    });
    if (r.ok) return true;
    const code = r.raison === "trop_de_tentatives" ? 429 : r.raison === "revoque" ? 410 : 401;
    res.writeHead(code, entetesSurs({ "content-type": "application/json" })).end(JSON.stringify({ erreur: r.raison }));
    return false;
  };

  const serveur = createServer(async (req, res) => {
    const url = (req.url || "").split("?")[0];
    if (url === "/sante") {
      res.writeHead(200, entetesSurs({ "content-type": "application/json" }))
        .end(JSON.stringify({ processus: "ok", appairage: pairing.etat().etat }));
      return;
    }
    if (url.startsWith("/pairing")) {
      if (req.method !== "GET") {
        res.writeHead(405, entetesSurs({ allow: "GET" })).end();
        return;
      }
      if (url === "/pairing") {
        const e = pairing.etat();
        res.writeHead(200, entetesSurs({ "content-type": "text/html; charset=utf-8" }))
          .end(pageAppairage({ etat: e.etat, resteMs: e.resteMs }));
        return;
      }
      if (url === "/pairing/etat") {
        if (!autorise(req, res)) return;
        res.writeHead(200, entetesSurs({ "content-type": "application/json" })).end(JSON.stringify(pairing.etat()));
        return;
      }
      if (url === "/pairing/qr") {
        if (!autorise(req, res)) return;
        const v = pairing.valeurCourante();
        if (!v) {
          res.writeHead(409, entetesSurs({ "content-type": "application/json" }))
            .end(JSON.stringify({ erreur: pairing.etat().etat }));
          return;
        }
        const png = await QRCode.toBuffer(v, { type: "png", width: 512, margin: 2 });
        res.writeHead(200, entetesSurs({ "content-type": "image/png" })).end(png);
        return;
      }
      res.writeHead(404, entetesSurs()).end();
      return;
    }
    res.writeHead(404, entetesSurs()).end();
  });

  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  return { serveur, base, fermer: () => new Promise((r) => serveur.close(r)) };
}

const avecJeton = (j) => ({ headers: { "x-pairing-token": j } });

test("l'accès est refusé sans jeton", async () => {
  const p = new Pairing({ jeton: JETON });
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/etat`);
    assert.equal(r.status, 401);
  } finally {
    await s.fermer();
  }
});

test("l'accès est refusé avec un mauvais jeton", async () => {
  const p = new Pairing({ jeton: JETON });
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/etat`, avecJeton("mauvais"));
    assert.equal(r.status, 401);
  } finally {
    await s.fermer();
  }
});

test("un jeton valide donne l'état, sans jamais la valeur du QR", async () => {
  const p = new Pairing({ jeton: JETON });
  p.nouveauQr("2@valeur-ultra-secrete-du-qr");
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/etat`, avecJeton(JETON));
    assert.equal(r.status, 200);
    const corps = await r.text();
    assert.equal(corps.includes("valeur-ultra-secrete"), false, "le QR ne doit jamais fuir dans l'état");
    assert.equal(JSON.parse(corps).etat, "pret");
  } finally {
    await s.fermer();
  }
});

test("le QR est servi comme une vraie image PNG", async () => {
  const p = new Pairing({ jeton: JETON });
  p.nouveauQr("2@valeur-du-qr");
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/qr`, avecJeton(JETON));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    // Signature PNG : un vrai fichier, pas une chaîne ni un placeholder.
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.ok(buf.length > 500, "une image de QR 512px fait plusieurs centaines d'octets");
  } finally {
    await s.fermer();
  }
});

test("toutes les réponses d'appairage interdisent la mise en cache", async () => {
  const p = new Pairing({ jeton: JETON });
  p.nouveauQr("2@x");
  const s = await monter(p);
  try {
    for (const chemin of ["/pairing", "/pairing/etat", "/pairing/qr"]) {
      const r = await fetch(`${s.base}${chemin}`, avecJeton(JETON));
      assert.match(r.headers.get("cache-control"), /no-store/, chemin);
      assert.equal(r.headers.get("referrer-policy"), "no-referrer", chemin);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff", chemin);
    }
  } finally {
    await s.fermer();
  }
});

test("un QR expiré n'est plus servi", async () => {
  let t = 0;
  const p = new Pairing({ jeton: JETON, horloge: () => t });
  p.nouveauQr("2@x");
  t += 61_000;
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/qr`, avecJeton(JETON));
    assert.equal(r.status, 409);
    assert.equal((await r.json()).erreur, "expire");
  } finally {
    await s.fermer();
  }
});

test("un nouveau QR remplace l'ancien", async () => {
  const p = new Pairing({ jeton: JETON });
  p.nouveauQr("2@ancien");
  const s = await monter(p);
  try {
    const a = Buffer.from(await (await fetch(`${s.base}/pairing/qr`, avecJeton(JETON))).arrayBuffer());
    p.nouveauQr("2@nouveau-completement-different");
    const b = Buffer.from(await (await fetch(`${s.base}/pairing/qr`, avecJeton(JETON))).arrayBuffer());
    assert.equal(a.equals(b), false, "l'image doit changer avec le QR");
  } finally {
    await s.fermer();
  }
});

test("après authentification : QR inaccessible et ancien jeton mort (410)", async () => {
  const p = new Pairing({ jeton: JETON });
  p.nouveauQr("2@x");
  p.marquerAuthentifie();
  const s = await monter(p);
  try {
    assert.equal((await fetch(`${s.base}/pairing/qr`, avecJeton(JETON))).status, 410);
    assert.equal((await fetch(`${s.base}/pairing/etat`, avecJeton(JETON))).status, 410);
  } finally {
    await s.fermer();
  }
});

test("une déconnexion ne réouvre pas l'appairage avec l'ancien jeton", async () => {
  const p = new Pairing({ jeton: JETON });
  p.marquerAuthentifie();
  p.reinitialiser();
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/etat`, avecJeton(JETON));
    assert.equal(r.status, 401);
    assert.equal((await r.json()).erreur, "non_configure");
  } finally {
    await s.fermer();
  }
});

test("les tentatives répétées finissent en 429", async () => {
  const p = new Pairing({ jeton: JETON });
  const s = await monter(p);
  try {
    for (let i = 0; i < 10; i++) await fetch(`${s.base}/pairing/etat`, avecJeton("faux"));
    assert.equal((await fetch(`${s.base}/pairing/etat`, avecJeton(JETON))).status, 429);
  } finally {
    await s.fermer();
  }
});

test("une méthode incorrecte est refusée", async () => {
  const p = new Pairing({ jeton: JETON });
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing/etat`, { method: "POST", ...avecJeton(JETON) });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get("allow"), "GET");
  } finally {
    await s.fermer();
  }
});

test("la page est servie sans jeton et sans aucun secret", async () => {
  const p = new Pairing({ jeton: JETON });
  p.nouveauQr("2@valeur-ultra-secrete-du-qr");
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/pairing`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /Lycée Guergné La Renaissance/);
    assert.equal(html.includes("valeur-ultra-secrete"), false);
    assert.equal(html.includes(JETON), false, "le jeton ne doit jamais etre dans le HTML");
  } finally {
    await s.fermer();
  }
});

test("/sante reste fonctionnel et ne demande aucun jeton", async () => {
  const p = new Pairing({ jeton: JETON });
  const s = await monter(p);
  try {
    const r = await fetch(`${s.base}/sante`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).processus, "ok");
  } finally {
    await s.fermer();
  }
});
