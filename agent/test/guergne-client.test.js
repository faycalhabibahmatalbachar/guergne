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
