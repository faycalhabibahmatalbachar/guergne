import test from "node:test";
import assert from "node:assert/strict";

import { GuergneHttpClient } from "../src/guergne-client.js";

/** fetch factice : enregistre l'appel et renvoie une réponse programmée. */
function fakeFetch(response) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return response;
  };
  fn.calls = calls;
  return fn;
}
const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test("construit la bonne requête (URL, en-têtes, corps)", async () => {
  const f = fakeFetch(jsonResponse(200, { ok: true, message: "OK" }));
  const client = new GuergneHttpClient({ baseUrl: "https://x.test/", serviceToken: "svc", fetch: f });
  await client.enregistrerAppel({ dateAbsence: "2026-10-31", absents: ["i1"] }, { actorId: "staff-1" });

  const call = f.calls[0];
  assert.equal(call.url, "https://x.test/api/agent/enregistrerAppel");
  assert.equal(call.opts.method, "POST");
  assert.equal(call.opts.headers.authorization, "Bearer svc");
  assert.equal(call.opts.headers["x-acteur-id"], "staff-1");
  assert.deepEqual(JSON.parse(call.opts.body), { dateAbsence: "2026-10-31", absents: ["i1"] });
});

test("un 2xx { ok:true } est transmis tel quel", async () => {
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test", serviceToken: "svc",
    fetch: fakeFetch(jsonResponse(200, { ok: true, message: "2 absence(s) enregistrée(s)." })),
  });
  const r = await client.enregistrerAppel({}, { actorId: "s" });
  assert.equal(r.ok, true);
  assert.match(r.message, /enregistrée/);
});

test("un 403 devient un échec de droits (jamais une réussite)", async () => {
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test", serviceToken: "svc",
    fetch: fakeFetch(jsonResponse(403, { message: "interdit" })),
  });
  const r = await client.supprimerAbsence({ absenceId: "a1", motif: "test" }, { actorId: "s" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("une erreur 500 est un échec explicite", async () => {
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test", serviceToken: "svc",
    fetch: fakeFetch(jsonResponse(500, { message: "boom" })),
  });
  const r = await client.listerAbsences({}, { actorId: "s" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  assert.match(r.message, /boom/);
});

test("une panne réseau est un échec, pas une fausse réussite", async () => {
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test", serviceToken: "svc",
    fetch: async () => { throw new Error("ECONNREFUSED"); },
  });
  const r = await client.enregistrerRetard({}, { actorId: "s" });
  assert.equal(r.ok, false);
  assert.match(r.message, /injoignable/);
});

// --- Deux refus 403 qui n'ont rien a voir -------------------------------------

test("des ecritures eteintes ne sont PAS presentees comme un defaut de droits", async () => {
  // Le directeur s'entendait dire qu'il n'avait pas les droits, alors que les
  // ecritures etaient simplement desactivees sur le deploiement.
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test",
    serviceToken: "svc",
    fetch: fakeFetch(jsonResponse(403, { ok: false, code: "ECRITURES_DESACTIVEES", message: "Les ecritures ne sont pas activees." })),
  });
  const r = await client.inscrireEleve({}, { actorId: "u1" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "ECRITURES_DESACTIVEES");
  assert.match(r.message, /pas activées sur ce déploiement/);
  assert.doesNotMatch(r.message, /Droits insuffisants/);
});

test("un vrai refus de droits garde son code et son message", async () => {
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test",
    serviceToken: "svc",
    fetch: fakeFetch(jsonResponse(403, { ok: false, code: "ROLE_INSUFFISANT", message: "Droits insuffisants." })),
  });
  const r = await client.archiverEleve({}, { actorId: "u1" });
  assert.equal(r.code, "ROLE_INSUFFISANT");
  assert.match(r.message, /Droits insuffisants/);
});

test("un refus de validation (422) transmet ses raisons champ par champ", async () => {
  // Seul `erreurs` est rempli : l'ancien client rendait « Erreur backend (422) »
  // et l'utilisateur ne savait pas quoi corriger.
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test",
    serviceToken: "svc",
    fetch: fakeFetch(jsonResponse(422, { ok: false, erreurs: { classeId: "Cette classe n'appartient pas à l'année en cours." } })),
  });
  const r = await client.inscrireEleve({}, { actorId: "u1" });
  assert.equal(r.status, 422);
  assert.deepEqual(r.erreurs, { classeId: "Cette classe n'appartient pas à l'année en cours." });
  assert.match(r.message, /n'appartient pas à l'année en cours/);
});

test("les nouvelles operations de dossier partent vers leur route exacte", async () => {
  const appels = [];
  const client = new GuergneHttpClient({
    baseUrl: "https://x.test",
    serviceToken: "svc",
    fetch: async (url, init) => {
      appels.push({ url, acteur: init.headers["x-acteur-id"] });
      return jsonResponse(200, { ok: true, data: null });
    },
  });
  for (const m of ["consulterEleve", "listerNiveaux", "listerSeries", "inscrireEleve", "modifierEleve", "changerClasseEleve", "archiverEleve", "creerClasse", "modifierClasse", "archiverClasse"]) {
    await client[m]({}, { actorId: "u1" });
  }
  assert.deepEqual(
    appels.map((a) => a.url.split("/api/agent/")[1]),
    ["consulterEleve", "listerNiveaux", "listerSeries", "inscrireEleve", "modifierEleve", "changerClasseEleve", "archiverEleve", "creerClasse", "modifierClasse", "archiverClasse"],
  );
  assert.ok(appels.every((a) => a.acteur === "u1"), "l'acteur accompagne chaque appel");
});
