/**
 * Recette des quatre fournisseurs : adaptateurs, erreurs, repli, disjoncteur,
 * et lecture de la configuration d'environnement.
 *
 * Aucun appel réseau : `fetch` est injecté. Les appels réels, limités à une
 * requête synthétique par fournisseur configuré, sont dans
 * `agent/scripts/verif-fournisseurs.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { FOURNISSEURS, MoteurIA, ORDRE_DEFAUT, configurerDepuisEnv } from "../src/ia.js";

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
const ko = (status, entetes = {}) => ({
  ok: false,
  status,
  headers: { get: (k) => entetes[k.toLowerCase()] ?? null },
  json: async () => ({}),
});
const chat = (texte, tokens = 42) => ok({ choices: [{ message: { content: texte } }], usage: { total_tokens: tokens } });

function tracant(reponses) {
  const appels = [];
  const f = async (url, opts) => {
    appels.push({ url, opts, corps: opts?.body ? JSON.parse(opts.body) : null });
    const r = reponses.shift();
    if (typeof r === "function") return r();
    return r;
  };
  f.appels = appels;
  return f;
}

const QUATRE = { groq: "a", xai: "b", openrouter: "c", mistral: "d" };
const sansPause = { pause: async () => {}, horloge: () => 0 };

// --- Adaptateurs -----------------------------------------------------------

test("chaque fournisseur a sa propre adresse, et c'est bien celle-là qui est appelée", async () => {
  for (const [nom, attendue] of [
    ["groq", "https://api.groq.com/openai/v1/chat/completions"],
    ["xai", "https://api.x.ai/v1/chat/completions"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions"],
    ["mistral", "https://api.mistral.ai/v1/chat/completions"],
  ]) {
    const f = tracant([chat("ok")]);
    const m = new MoteurIA({ cles: { [nom]: "k" }, fetch: f, ...sansPause });
    await m.completer([{ role: "user", content: "x" }]);
    assert.equal(f.appels[0].url, attendue, `adresse de ${nom}`);
    assert.match(f.appels[0].opts.headers.authorization, /^Bearer /);
  }
});

test("les modèles par défaut sont ceux vérifiés auprès des comptes", () => {
  assert.equal(FOURNISSEURS.groq.modele, "openai/gpt-oss-120b");
  assert.equal(FOURNISSEURS.mistral.modele, "mistral-small-latest");
  assert.equal(FOURNISSEURS.openrouter.modele, "openai/gpt-oss-120b");
  // Les anciens identifiants xAI ont disparu du tarif : les réutiliser
  // produirait un 404 à chaque message.
  assert.equal(FOURNISSEURS.xai.modele, "grok-4.3");
  assert.ok(!["grok-4", "grok-4-latest", "grok-3-mini"].includes(FOURNISSEURS.xai.modele));
});

test("le modèle est surchargeable sans toucher au code", async () => {
  const f = tracant([chat("ok")]);
  const m = new MoteurIA({ cles: { mistral: "k" }, modeles: { mistral: "magistral-small-latest" }, fetch: f, ...sansPause });
  await m.completer([{ role: "user", content: "x" }]);
  assert.equal(f.appels[0].corps.model, "magistral-small-latest");
  assert.equal(m.modele("mistral"), "magistral-small-latest");
});

test("OpenRouter reçoit ses en-têtes d'attribution", async () => {
  const f = tracant([chat("ok")]);
  await new MoteurIA({ cles: { openrouter: "k" }, fetch: f, ...sansPause }).completer([{ role: "user", content: "x" }]);
  assert.match(f.appels[0].opts.headers["X-Title"], /Guergne/);
  assert.match(f.appels[0].opts.headers["HTTP-Referer"], /^https:\/\//);
});

test("le plafond de tokens prend le nom attendu par chaque fournisseur", async () => {
  const fg = tracant([chat("PONG")]);
  await new MoteurIA({ cles: { groq: "k" }, fetch: fg, ...sansPause }).completer([{ role: "user", content: "x" }], { maxTokens: 8 });
  assert.equal(fg.appels[0].corps.max_tokens, 8);

  // `max_tokens` est marqué obsolète chez xAI, qui attend `max_completion_tokens`.
  const fx = tracant([chat("PONG")]);
  await new MoteurIA({ cles: { xai: "k" }, fetch: fx, ...sansPause }).completer([{ role: "user", content: "x" }], { maxTokens: 8 });
  assert.equal(fx.appels[0].corps.max_completion_tokens, 8);
  assert.equal(fx.appels[0].corps.max_tokens, undefined);
});

// --- Mode JSON -------------------------------------------------------------

test("le mode JSON natif est utilisé là où il est confirmé", async () => {
  const f = tracant([chat('{"tool":"x"}')]);
  await new MoteurIA({ cles: { groq: "k" }, fetch: f, ...sansPause }).completerJson([{ role: "user", content: "x" }]);
  assert.deepEqual(f.appels[0].corps.response_format, { type: "json_object" });
});

test("sans mode JSON natif, la consigne passe par l'invite — jamais un paramètre non documenté", async () => {
  // Envoyer `response_format` à un fournisseur qui ne le documente pas, c'est
  // risquer un 400 sur chaque message.
  const f = tracant([chat('du texte autour de {"tool":"x","params":{}} et après')]);
  const r = await new MoteurIA({ cles: { xai: "k" }, fetch: f, ...sansPause }).completerJson([
    { role: "user", content: "x" },
  ]);
  assert.equal(f.appels[0].corps.response_format, undefined);
  assert.match(f.appels[0].corps.messages.at(-1).content, /UNIQUEMENT par un objet JSON/);
  // Et l'objet est quand même récupéré.
  assert.deepEqual(r.objet, { tool: "x", params: {} });
});

test("les messages de l'appelant ne sont pas modifiés", async () => {
  const messages = [{ role: "user", content: "x" }];
  const f = tracant([chat('{"a":1}')]);
  await new MoteurIA({ cles: { xai: "k" }, fetch: f, ...sansPause }).completerJson(messages);
  assert.equal(messages.length, 1, "la consigne JSON ne doit pas s'accumuler d'un message à l'autre");
});

// --- Erreurs et repli ------------------------------------------------------

test("401 : le fournisseur est écarté, le suivant répond", async () => {
  const f = tracant([ko(401), chat("repli")]);
  const m = new MoteurIA({ cles: QUATRE, fetch: f, ...sansPause });
  const r = await m.completer([{ role: "user", content: "x" }]);
  assert.equal(r.fournisseur, "xai");
  assert.equal(m.etatFournisseurs.groq.statut, "ecarte");
  assert.equal(m.etatFournisseurs.groq.authentifie, false, "un 401 prouve que la clé est refusée");
  assert.equal(f.appels.length, 2, "aucune nouvelle tentative sur une clé refusée");
});

test("403 est traité comme 401 : inutile d'insister", async () => {
  const f = tracant([ko(403), chat("repli")]);
  const m = new MoteurIA({ cles: QUATRE, fetch: f, ...sansPause });
  await m.completer([{ role: "user", content: "x" }]);
  assert.equal(m.etatFournisseurs.groq.statut, "ecarte");
  assert.equal(f.appels.length, 2);
});

test("429 : cooldown, bascule, et la clé est reconnue valide", async () => {
  let t = 0;
  const f = tracant([ko(429, { "retry-after": "30" }), chat("repli")]);
  const m = new MoteurIA({ cles: QUATRE, fetch: f, pause: async () => {}, horloge: () => t });
  const r = await m.completer([{ role: "user", content: "x" }]);
  assert.equal(r.fournisseur, "xai");
  assert.equal(m.etatFournisseurs.groq.statut, "limite");
  assert.equal(m.etatFournisseurs.groq.cooldownRestantMs, 30_000);
  // Un 429 vient d'un service qui nous a identifiés : la clé est bonne.
  assert.equal(m.etatFournisseurs.groq.authentifie, true);
  t += 31_000;
  // La cle a ete acceptee (c'est ce que prouve un 429) : a la fin du cooldown
  // le fournisseur redevient disponible, et non « en erreur ».
  assert.equal(m.etatFournisseurs.groq.statut, "disponible", "le cooldown doit expirer");
});

test("5xx : réessais sur place, puis repli", async () => {
  const f = tracant([ko(500), ko(502), ko(503), chat("repli")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "d" }, fetch: f, ...sansPause });
  const r = await m.completer([{ role: "user", content: "x" }]);
  assert.equal(r.fournisseur, "mistral");
  assert.equal(f.appels.length, 4, "trois tentatives sur Groq, puis une sur Mistral");
  assert.equal(m.etatFournisseurs.groq.echecs, 3);
  assert.equal(m.etatFournisseurs.groq.ecarte, false, "une panne passagère n'écarte pas une clé valide");
});

test("délai dépassé : l'agent bascule au lieu d'attendre indéfiniment", async () => {
  // Un fournisseur muet ne doit pas figer la conversation. On simule
  // l'annulation que déclenche le minuteur interne.
  const abandon = () => {
    throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
  };
  const f = tracant([abandon, abandon, abandon, chat("repli")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "d" }, fetch: f, ...sansPause });
  const r = await m.completer([{ role: "user", content: "x" }]);
  assert.equal(r.fournisseur, "mistral");
});

test("erreur réseau : repli, sans écarter la clé", async () => {
  const coupure = () => {
    throw new Error("ECONNREFUSED");
  };
  const f = tracant([coupure, coupure, coupure, chat("repli")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "d" }, fetch: f, ...sansPause });
  assert.equal((await m.completer([{ role: "user", content: "x" }])).fournisseur, "mistral");
  assert.equal(m.etatFournisseurs.groq.ecarte, false);
});

test("une réponse invalide n'est jamais présentée comme un succès", async () => {
  // Trois réponses bien formées mais vides : aucune ne doit remonter comme
  // résultat. L'agent préfère une erreur franche à une réponse inventée.
  const f = tracant([chat(""), chat(""), chat(""), chat("")]);
  const m = new MoteurIA({ cles: { groq: "a" }, fetch: f, ...sansPause });
  await assert.rejects(() => m.completer([{ role: "user", content: "x" }]), /Aucun fournisseur IA disponible/);
});

test("JSON invalide : objet null, et aucune invention", async () => {
  const f = tracant([chat("desole, je ne peux pas")]);
  const r = await new MoteurIA({ cles: { groq: "a" }, fetch: f, ...sansPause }).completerJson([
    { role: "user", content: "x" },
  ]);
  assert.equal(r.objet, null);
  assert.equal(r.texte, "desole, je ne peux pas");
});

test("un fournisseur secondaire en panne ne bloque pas l'agent", async () => {
  // Groq répond : les trois autres ne doivent même pas être appelés.
  const f = tracant([chat("ok")]);
  const m = new MoteurIA({ cles: QUATRE, fetch: f, ...sansPause });
  assert.equal((await m.completer([{ role: "user", content: "x" }])).fournisseur, "groq");
  assert.equal(f.appels.length, 1);
});

test("tous les fournisseurs en échec : erreur détaillée, fournisseur par fournisseur", async () => {
  const f = tracant([ko(401), ko(401), ko(429), ko(500), ko(500), ko(500)]);
  const m = new MoteurIA({ cles: QUATRE, fetch: f, ...sansPause });
  await assert.rejects(
    () => m.completer([{ role: "user", content: "x" }]),
    (e) => {
      assert.equal(e.code, "IA_INDISPONIBLE");
      assert.match(e.message, /groq/);
      assert.match(e.message, /mistral/);
      return true;
    },
  );
  // groq et xai sont ecartes (401), openrouter est en cooldown (429) ; mistral
  // n'a connu que des pannes passageres, donc il reste essayable au message
  // suivant — une panne de serveur n'est pas une cle invalide.
  assert.deepEqual(m.disponibles, ["mistral"], "seul celui qui n'est ni écarté ni limité reste");
});

// --- Ordre, désactivation, métriques ---------------------------------------

test("l'ordre des fournisseurs est configurable", async () => {
  const f = tracant([chat("ok")]);
  const m = new MoteurIA({ cles: QUATRE, ordre: ["mistral", "groq"], fetch: f, ...sansPause });
  assert.deepEqual(m.fournisseurs, ["mistral", "groq"]);
  assert.equal((await m.completer([{ role: "user", content: "x" }])).fournisseur, "mistral");
});

test("un fournisseur désactivé n'est pas essayé, même avec sa clé", async () => {
  const m = new MoteurIA({ cles: QUATRE, desactives: ["groq", "xai"], fetch: tracant([chat("ok")]), ...sansPause });
  assert.deepEqual(m.fournisseurs, ["openrouter", "mistral"]);
  assert.equal(m.etatFournisseurs.groq.statut, "desactive");
});

test("un fournisseur sans clé est « non configuré », pas « en panne »", () => {
  const m = new MoteurIA({ cles: { groq: "a" }, fetch: tracant([]), ...sansPause });
  assert.equal(m.etatFournisseurs.xai.statut, "non_configure");
  assert.equal(m.etatFournisseurs.openrouter.statut, "non_configure");
  assert.equal(m.etatFournisseurs.groq.statut, "configure", "une clé présente n'est pas une clé vérifiée");
});

test("le moteur sait dire quel fournisseur a répondu, et avec quel modèle", async () => {
  let t = 0;
  const f = tracant([
    ko(500),
    ko(500),
    ko(500),
    () => {
      t = 120;
      return chat("ok", 77);
    },
  ]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "d" }, fetch: f, pause: async () => {}, horloge: () => t });
  const r = await m.completer([{ role: "user", content: "x" }]);
  assert.equal(r.fournisseur, "mistral");
  assert.equal(r.modele, "mistral-small-latest");
  const e = m.etatFournisseurs.mistral;
  assert.equal(e.succes, 1);
  assert.equal(e.tokens, 77);
  assert.equal(e.latenceMoyenneMs, 120);
  assert.equal(e.dernierCode, 200);
});

// --- Transcription ---------------------------------------------------------

test("la transcription a sa propre liste, et elle n'est pas celle des LLM", () => {
  const m = new MoteurIA({ cles: QUATRE, fetch: tracant([]), ...sansPause });
  // Seuls les fournisseurs AYANT une clé sont essayés, dans l'ordre par défaut.
  assert.deepEqual(m.fournisseurs, ORDRE_DEFAUT.filter((n) => QUATRE[n]));
  // Trois des quatre fournisseurs savent discuter sans savoir transcrire.
  assert.deepEqual(m.transcripteurs, ["groq"]);
});

test("ni xAI ni OpenRouter ne sont annoncés comme transcripteurs", () => {
  // xAI propose bien de la reconnaissance vocale, mais sur `POST /v1/stt`, de
  // forme differente ; OpenRouter n'en documente aucune. Les declarer ici
  // ferait echouer tous les messages vocaux au premier essai.
  assert.equal(FOURNISSEURS.xai.transcription, null);
  assert.equal(FOURNISSEURS.openrouter.transcription, null);
  assert.equal(FOURNISSEURS.mistral.transcription, null);
  assert.equal(FOURNISSEURS.groq.transcription, "whisper-large-v3-turbo");
});

test("sans Groq, la transcription échoue explicitement au lieu d'essayer n'importe qui", async () => {
  const m = new MoteurIA({ cles: { xai: "b", openrouter: "c" }, fetch: tracant([]), ...sansPause });
  await assert.rejects(() => m.transcrire(Buffer.from("x")), /Aucun fournisseur de transcription configuré/);
});

// --- Lecture de l'environnement -------------------------------------------

test("configurerDepuisEnv reconnaît les quatre variables de clé", () => {
  const c = configurerDepuisEnv({
    GROQ_API_KEY: "g",
    XAI_API_KEY: "x",
    OPENROUTER_API_KEY: "o",
    MISTRAL_API_KEY: "m",
  });
  assert.deepEqual(c.presents.sort(), ["groq", "mistral", "openrouter", "xai"]);
  assert.deepEqual(c.avertissements, []);
});

test("GROK_API_KEY est accepté comme alias de XAI_API_KEY", () => {
  const c = configurerDepuisEnv({ GROK_API_KEY: "x" });
  assert.equal(c.cles.xai, "x");
});

test("le piège Groq/Grok : la même clé dans les deux cases est refusée", () => {
  // Groq et Grok ne diffèrent que d'une lettre, et le fichier de clés local
  // appelle « grok_api » une clé Groq. Recopier la même valeur donnerait un
  // fournisseur xai qui répond 401 à chaque message, pour rien.
  const c = configurerDepuisEnv({ GROQ_API_KEY: "meme-valeur", GROK_API_KEY: "meme-valeur" });
  assert.deepEqual(c.presents, ["groq"]);
  assert.match(c.avertissements.join(" "), /deux services distincts/);
  assert.ok(!c.avertissements.join(" ").includes("meme-valeur"), "un avertissement ne doit jamais citer la valeur");
});

test("les modèles et l'ordre se lisent dans l'environnement", () => {
  const c = configurerDepuisEnv({
    GROQ_API_KEY: "g",
    MISTRAL_MODEL: "magistral-small-latest",
    XAI_MODEL: "grok-4.7",
    IA_ORDRE: "mistral, groq",
  });
  assert.equal(c.modeles.mistral, "magistral-small-latest");
  assert.equal(c.modeles.xai, "grok-4.7");
  // Un ordre partiel reste valable : les absents passent après, sans disparaître.
  assert.deepEqual(c.ordre.slice(0, 2), ["mistral", "groq"]);
  assert.deepEqual(c.ordre.sort(), [...ORDRE_DEFAUT].sort());
});

test("un fournisseur inconnu dans IA_ORDRE est signalé, pas silencieusement ignoré", () => {
  // « gemini » est connu depuis le 14 novembre 2026 : l'exemple prend un nom inventé.
  const c = configurerDepuisEnv({ GROQ_API_KEY: "g", IA_ORDRE: "claude3000,groq" });
  assert.match(c.avertissements.join(" "), /inconnu/);
  assert.ok(!c.ordre.includes("claude3000"));
});

test("IA_DESACTIVES exclut un fournisseur sans supprimer sa clé", () => {
  const c = configurerDepuisEnv({ GROQ_API_KEY: "g", MISTRAL_API_KEY: "m", IA_DESACTIVES: "mistral" });
  assert.deepEqual(c.desactives, ["mistral"]);
  assert.equal(c.cles.mistral, "m", "la clé reste lisible : la désactivation est réversible sans la ressaisir");
});

test("une variable vide ou en espaces ne compte pas comme configurée", () => {
  assert.deepEqual(configurerDepuisEnv({ GROQ_API_KEY: "   ", XAI_API_KEY: "" }).presents, []);
});

test("mode JSON : le mot « json » figure toujours dans les messages envoyes", async () => {
  // Les API compatibles OpenAI refusent `response_format:json_object` en 400
  // quand aucun message ne contient le mot « json ». Constate pour de vrai sur
  // Groq pendant la recette.
  const f = tracant([chat('{"a":1}')]);
  await new MoteurIA({ cles: { groq: "k" }, fetch: f, ...sansPause }).completerJson([
    { role: "user", content: "trois dernieres absences" },
  ]);
  assert.ok(
    f.appels[0].corps.messages.some((m) => /json/i.test(m.content)),
    "sans ce mot, chaque demande partirait en 400",
  );
});

test("contenu vide par budget de jetons epuise : on ne reessaie pas a l'identique", async () => {
  // Un modele de raisonnement consomme son budget avant d'ecrire : HTTP 200,
  // contenu vide, finish_reason=length. Reessayer trois fois le meme appel ne
  // peut pas aboutir — c'est trois appels facturies pour rien.
  const vide = ok({ choices: [{ message: { content: "" }, finish_reason: "length" }] });
  const f = tracant([vide, chat("repli")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "d" }, fetch: f, ...sansPause });
  const r = await m.completer([{ role: "user", content: "x" }], { maxTokens: 16 });
  assert.equal(r.fournisseur, "mistral");
  assert.equal(f.appels.length, 2, "un seul appel sur groq : le plafond ne changera pas en reessayant");
  assert.equal(m.etatFournisseurs.groq.ecarte, false, "ce n'est pas un probleme de cle");
  assert.match(m.etatFournisseurs.groq.dernierCode === 200 ? "ok" : "", /ok/);
});

test("contenu vide SANS finish_reason=length reste transitoire", async () => {
  const f = tracant([chat(""), chat(""), chat(""), chat("repli")]);
  const m = new MoteurIA({ cles: { groq: "a", mistral: "d" }, fetch: f, ...sansPause });
  assert.equal((await m.completer([{ role: "user", content: "x" }])).fournisseur, "mistral");
  assert.equal(f.appels.length, 4, "une reponse vide inexpliquee merite d'etre reessayee");
});


test("gemini : tous les messages système fusionnés en un seul, en tête", async () => {
  const corps = [];
  const fetch = async (_url, init) => {
    corps.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { total_tokens: 10 } }) };
  };
  const ia = new MoteurIA({ cles: { gemini: "k" }, ordre: ["gemini"], fetch });
  await ia.completerJson([
    { role: "system", content: "A" },
    { role: "system", content: "B" },
    { role: "user", content: "question" },
  ]);
  const m = corps[0].messages;
  assert.equal(m.filter((x) => x.role === "system").length, 1);
  assert.equal(m[0].role, "system");
  assert.match(m[0].content, /^A\n\nB\n\nReponds UNIQUEMENT/);
  assert.equal(m[1].content, "question");
  assert.equal(corps[0].model, "gemini-3.5-flash");
});

test("gemini et gemini_lite partagent la clé GEMINI_API_KEY, et rien ne change pour les autres", () => {
  const c = configurerDepuisEnv({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q" });
  assert.equal(c.cles.gemini, "g");
  assert.equal(c.cles.gemini_lite, "g");
  assert.deepEqual(c.ordre.slice(0, 3), ["groq", "gemini", "gemini_lite"]);
  assert.deepEqual(c.avertissements, []);
});
