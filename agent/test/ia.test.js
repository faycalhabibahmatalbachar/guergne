import test from "node:test";
import assert from "node:assert/strict";

import { MoteurIA, extraireJson } from "../src/ia.js";

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
  const f = tracant([ko(500), ko(500)]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f });
  await assert.rejects(() => m.completer([]), /Tous les fournisseurs IA ont échoué/);
});

test("une réponse vide compte comme un échec et déclenche le repli", async () => {
  const f = tracant([chat(""), chat("recupere")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: f });
  const r = await m.completer([]);
  assert.equal(r.fournisseur, "mistral");
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
  const m = new MoteurIA({ cles: { groq: "a", mistral: "b" }, fetch: tracant([ko(503), chat("ok")]), journal: (e) => evts.push(e) });
  await m.completer([]);
  assert.equal(evts[0].type, "llm_echec");
  assert.equal(evts[0].fournisseur, "groq");
  assert.equal(evts[1].type, "llm");
  assert.equal(evts[1].fournisseur, "mistral");
});
