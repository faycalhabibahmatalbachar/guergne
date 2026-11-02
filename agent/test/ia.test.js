import test from "node:test";
import assert from "node:assert/strict";

import { MoteurIA, classerErreur, extraireJson } from "../src/ia.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const ko = (status) => ({ ok: false, status, json: async () => ({}) });
const chat = (texte, tokens = 42) => ok({ choices: [{ message: { content: texte } }], usage: { total_tokens: tokens } });

function tracant(reponses) {
  const appels = [];
  const f = async (url, opts) => {
    appels.push({ url, opts });
    const r = reponses.shift();
    if (typeof r === "function") return r();
    return r;
  };
  f.appels = appels;
  return f;
}

test("extraireJson récupère un objet noyé dans du texte", () => {
  assert.deepEqual(extraireJson('Voici: {"tool":"x","params":{}} merci'), { tool: "x", params: {} });
  assert.equal(extraireJson("aucun json"), null);
});

test("refuse de démarrer sans aucune clé", () => {
  assert.throws(() => new MoteurIA({ cles: {} }), /aucun fournisseur/);
});

test("n'active que les fournisseurs dont la clé est fournie", () => {
  const m = new MoteurIA({ cles: { mistral: "k" }, fetch: tracant([]) });
  assert.deepEqual(m.fournisseurs, ["mistral"]);
});

test("utilise Groq en premier quand il répond", async () => {
  const f = tracant([chat("bonjour")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f });
  const r = await m.completer([{ role: "user", content: "salut" }]);
  assert.equal(r.fournisseur, "groq");
  assert.equal(r.texte, "bonjour");
  assert.equal(r.tokens, 42);
  assert.match(f.appels[0].url, /api\.groq\.com/);
});

test("bascule sur Mistral quand Groq échoue", async () => {
  const f = tracant([ko(429), chat("repli")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f });
  const r = await m.completer([{ role: "user", content: "salut" }]);
  assert.equal(r.fournisseur, "mistral");
  assert.equal(r.texte, "repli");
  assert.equal(f.appels.length, 2);
  assert.match(f.appels[1].url, /api\.mistral\.ai/);
});

test("une panne de tous les fournisseurs lève une erreur explicite", async () => {
  // 401 des deux côtés : pas de réessai, bascule puis échec maîtrisé.
  const f = tracant([ko(401), ko(401)]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f, pause: async () => {} });
  await assert.rejects(() => m.completer([]), /Aucun fournisseur IA disponible/);
});

test("une réponse vide est transitoire : on réessaie le même fournisseur avant de basculer", async () => {
  // Une réponse vide est un incident passager, pas une panne du fournisseur :
  // basculer immédiatement gaspillerait le quota du suivant.
  const f = tracant([chat(""), chat("recupere")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f, pause: async () => {} });
  const r = await m.completer([]);
  assert.equal(r.fournisseur, "groq");
  assert.equal(r.tentatives, 2);
});

test("completerJson renvoie l'objet analysé", async () => {
  const f = tracant([chat('{"tool":"assiduite.consulter_absences","params":{"classeId":"c1"}}')]);
  const m = new MoteurIA({ cles: { groq: "a" }, fetch: f });
  const r = await m.completerJson([]);
  assert.equal(r.objet.tool, "assiduite.consulter_absences");
  assert.equal(JSON.parse(f.appels[0].opts.body).response_format.type, "json_object");
});

test("la transcription n'essaie que les fournisseurs qui en proposent", async () => {
  const f = tracant([ok({ text: " Enregistre l'absence " })]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f });
  const r = await m.transcrire(Buffer.from("audio"));
  assert.equal(r.texte, "Enregistre l'absence");
  assert.equal(f.appels.length, 1, "Mistral n'expose pas de transcription : il ne doit pas être appelé");
  assert.match(f.appels[0].url, /audio\/transcriptions/);
});

test("sans fournisseur de transcription, l'erreur est explicite", async () => {
  const m = new MoteurIA({ cles: { mistral: "b" }, fetch: tracant([]) });
  await assert.rejects(() => m.transcrire(Buffer.from("x")), /Aucun fournisseur de transcription/);
});

test("le journal reçoit le fournisseur, le modèle et la durée", async () => {
  const evts = [];
  const m = new MoteurIA({ cles: { groq: "a" }, fetch: tracant([chat("ok")]), journal: (e) => evts.push(e) });
  await m.completer([]);
  assert.equal(evts[0].type, "llm");
  assert.equal(evts[0].fournisseur, "groq");
  assert.ok(typeof evts[0].dureeMs === "number");
});

test("un échec de fournisseur est tracé avant le repli", async () => {
  const evts = [];
  const m = new MoteurIA({
    cles: { groq: "a", mistral: "b" },
    fetch: tracant([ko(401), chat("ok")]),
    journal: (e) => evts.push(e),
    pause: async () => {},
  });
  await m.completer([]);
  const types = evts.map((e) => e.type);
  assert.ok(types.includes("llm_echec"), "l'échec doit être tracé");
  assert.ok(types.includes("fournisseur_ecarte"), "la mise à l'écart doit être tracée");
  const reussite = evts.find((e) => e.type === "llm");
  assert.equal(reussite.fournisseur, "mistral");
});

// --- P4 : résilience -------------------------------------------------------

const avecEntetes = (status, entetes = {}) => ({
  ok: false,
  status,
  headers: { get: (k) => entetes[k.toLowerCase()] ?? null },
  json: async () => ({}),
});

function moteurTeste(reponses, { cles = { groq: "a", mistral: "b" } } = {}) {
  let t = 0;
  const pauses = [];
  const m = new MoteurIA({
    cles,
    fetch: tracant(reponses),
    horloge: () => t,
    pause: async (ms) => { pauses.push(ms); t += ms; },
    alea: () => 0.5,
  });
  return { m, pauses, avance: (ms) => { t += ms; } };
}

test("un 401 écarte le fournisseur : aucune tentative répétée", async () => {
  const { m } = moteurTeste([avecEntetes(401), chat("ok")]);
  const r = await m.completer([]);
  assert.equal(r.fournisseur, "mistral");
  assert.equal(m.etatFournisseurs.groq.ecarte, true, "Groq doit être écarté définitivement");
  assert.deepEqual(m.disponibles, ["mistral"]);
});

test("un 429 met en cooldown en respectant Retry-After", async () => {
  const { m, avance } = moteurTeste([avecEntetes(429, { "retry-after": "30" }), chat("ok")]);
  await m.completer([]);
  assert.equal(m.etatFournisseurs.groq.cooldownRestantMs, 30_000);
  assert.deepEqual(m.disponibles, ["mistral"]);
  avance(30_000);
  assert.deepEqual(m.disponibles, ["groq", "mistral"], "le cooldown doit expirer");
});

test("une erreur 5xx est réessayée avec un recul croissant", async () => {
  const { m, pauses } = moteurTeste([avecEntetes(503), avecEntetes(503), chat("enfin")]);
  const r = await m.completer([]);
  assert.equal(r.fournisseur, "groq");
  assert.equal(r.tentatives, 3);
  assert.equal(pauses.length, 2);
  assert.ok(pauses[1] > pauses[0], "le recul doit croître");
});

test("un fournisseur écarté n'est plus appelé au message suivant", async () => {
  const f = tracant([avecEntetes(401), chat("un"), chat("deux")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f, horloge: () => 0 });
  await m.completer([]);
  const nb = f.appels.length;
  await m.completer([]);
  assert.equal(f.appels.length, nb + 1, "un seul appel : Groq ne doit plus être tenté");
  assert.match(f.appels[nb].url, /mistral/);
});

test("aucun fournisseur disponible : erreur maîtrisée, jamais de résultat inventé", async () => {
  const { m } = moteurTeste([avecEntetes(401), avecEntetes(429, { "retry-after": "60" })]);
  await assert.rejects(
    () => m.completer([]),
    (e) => e.code === "IA_INDISPONIBLE" && Array.isArray(e.detail),
  );
  assert.deepEqual(m.disponibles, []);
});

test("classerErreur distingue les trois familles", () => {
  assert.equal(classerErreur(401), "fatal");
  assert.equal(classerErreur(403), "fatal");
  assert.equal(classerErreur(429), "quota");
  assert.equal(classerErreur(500), "transitoire");
  assert.equal(classerErreur(502), "transitoire");
});

test("Retry-After au format date HTTP est converti", async () => {
  const dans2min = new Date(120_000).toUTCString();
  const { m } = moteurTeste([avecEntetes(429, { "retry-after": dans2min }), chat("ok")]);
  await m.completer([]);
  assert.ok(m.etatFournisseurs.groq.cooldownRestantMs > 100_000);
});
