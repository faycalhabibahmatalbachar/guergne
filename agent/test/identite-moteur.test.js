/**
 * Recette du parcours d'identification, bout en bout dans le moteur.
 *
 * C'est l'étape qui a produit neuf `REFUSED_UNKNOWN` en production. Ces tests
 * verrouillent les deux propriétés qui comptent :
 *   - un responsable autorisé est reconnu, quel que soit l'adressage WhatsApp ;
 *   - tout le reste est refusé, avec une raison qui dit où chercher.
 *
 * Aucun numéro réel : les valeurs sont synthétiques.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditLog } from "../src/audit.js";
import { Agent, Status } from "../src/engine.js";
import { FakePermissionChecker } from "../src/guard.js";
import { IdempotencyStore } from "../src/idempotency.js";
import { IdentityStore } from "../src/identity.js";
import { IdentityStorePersistant } from "../src/identity-store.js";
import { RAISONS } from "../src/jid.js";
import { FakeProvider } from "../src/provider.js";
import { ASSIDUITE_TOOLS, ToolRegistry } from "../src/tools.js";
import { GuergneSim } from "./harness.js";

const NUM = "23560000001"; // synthétique
const JID = `${NUM}@c.us`;
const LID = "198765432109876@lid";

function monter({ identity, resoudreLid } = {}) {
  const provider = new FakeProvider();
  if (resoudreLid) provider.resoudreLid = resoudreLid;
  const audit = new AuditLog();
  const journal = [];
  const agent = new Agent({
    provider,
    identity: identity ?? new IdentityStore([{ jid: JID, id: "staff-1", nom: "Awa", role: "surveillant" }]),
    idempotency: new IdempotencyStore(),
    audit,
    tools: new ToolRegistry(ASSIDUITE_TOOLS),
    permissions: new FakePermissionChecker({ surveillant: new Set(["assiduite:lire"]) }),
    guergne: new GuergneSim(),
    interpret: async () => ({ tool: "assiduite.consulter_absences", params: { limite: 1 } }),
    journalIdentite: (e) => journal.push(e),
    selEmpreinte: "sel-de-test",
  });
  let n = 0;
  const ecrire = (from, text = "les absences") => agent.handle({ id: `m-${n++}`, from, body: text });
  return { agent, provider, audit, journal, ecrire };
}

// --- Le cas qui marchait déjà ---------------------------------------------

test("un numero autorise en c.us est reconnu", async () => {
  const { ecrire, audit, journal } = monter();
  const r = await ecrire(JID);
  assert.notEqual(r.status, Status.REJECTED_UNKNOWN);
  assert.equal(audit.last().result, "SUCCESS");
  assert.equal(journal.at(-1).decision, "ALLOW");
  assert.equal(journal.at(-1).jidType, "c.us");
  assert.equal(journal.at(-1).viaLid, false);
});

// --- Le cas qui cassait tout ----------------------------------------------

test("un LID resolu vers un numero autorise est reconnu", async () => {
  // Sans resolution, ce responsable restait refuse indefiniment.
  const { ecrire, audit, journal } = monter({ resoudreLid: async () => JID });
  const r = await ecrire(LID);
  assert.notEqual(r.status, Status.REJECTED_UNKNOWN);
  assert.equal(audit.last().result, "SUCCESS");
  assert.equal(journal.at(-1).decision, "ALLOW");
  assert.equal(journal.at(-1).jidType, "lid");
  assert.equal(journal.at(-1).viaLid, true);
});

test("un LID dont les CHIFFRES valent un numero autorise reste refuse", async () => {
  // Le test de securite central. La partie gauche d'un LID ne designe aucun
  // abonne : l'utiliser en repli donnerait le compte d'un responsable a
  // quiconque se voit attribuer le bon identifiant interne.
  const { ecrire, audit, journal } = monter();
  const r = await ecrire(`${NUM}@lid`);
  assert.equal(r.status, Status.REJECTED_UNKNOWN);
  assert.equal(r.raison, RAISONS.LID_NOT_RESOLVED);
  assert.equal(audit.last().result, "REFUSED_UNKNOWN");
  assert.equal(journal.at(-1).decision, "DENY");
});

test("un LID que WhatsApp ne sait pas resoudre est refuse, pas devine", async () => {
  const { ecrire, journal } = monter({ resoudreLid: async () => null });
  const r = await ecrire(LID);
  assert.equal(r.raison, RAISONS.LID_NOT_RESOLVED);
  assert.equal(journal.at(-1).normalisation, "failed");
});

// --- Les refus, chacun avec sa raison --------------------------------------

test("un numero inconnu : UNKNOWN_NUMBER", async () => {
  const { ecrire, provider } = monter();
  const r = await ecrire("23599999999@c.us");
  assert.equal(r.status, Status.REJECTED_UNKNOWN);
  assert.equal(r.raison, RAISONS.UNKNOWN_NUMBER);
  assert.match(provider.lastTextTo("23599999999@c.us") ?? "", /non autoris/i);
});

test("un message de groupe : GROUP_NOT_SUPPORTED, jamais confondu avec un inconnu", async () => {
  const { ecrire } = monter();
  assert.equal((await ecrire("1234567890-1600000000@g.us")).raison, RAISONS.GROUP_NOT_SUPPORTED);
});

test("une diffusion : BROADCAST_NOT_SUPPORTED", async () => {
  assert.equal((await monter().ecrire("status@broadcast")).raison, RAISONS.BROADCAST_NOT_SUPPORTED);
});

test("un JID invalide : INVALID_JID", async () => {
  assert.equal((await monter().ecrire("pas-un-jid")).raison, RAISONS.INVALID_JID);
});

// --- Suspension et révocation ---------------------------------------------

function magasinPersistant(bac, { suspendu = false, revoque = false } = {}) {
  const m = new IdentityStorePersistant({ chemin: join(bac, "identites.json") });
  m.lier({ numero: NUM, utilisateurId: "u-1", nom: "Awa", role: "surveillant", parQui: "admin-1" });
  if (suspendu) m.suspendre({ numero: NUM, suspendu: true, parQui: "admin-1" });
  if (revoque) m.revoquer({ numero: NUM, parQui: "admin-1" });
  return m;
}

test("un numero suspendu : IDENTITY_SUSPENDED, et non UNKNOWN_NUMBER", async () => {
  // Les confondre fait chercher une association manquante alors qu'elle
  // existe et qu'il suffit de la reactiver.
  const bac = mkdtempSync(join(tmpdir(), "ident-moteur-"));
  try {
    const { ecrire } = monter({ identity: magasinPersistant(bac, { suspendu: true }) });
    assert.equal((await ecrire(JID)).raison, RAISONS.IDENTITY_SUSPENDED);
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
});

test("un numero revoque : IDENTITY_REVOKED", async () => {
  const bac = mkdtempSync(join(tmpdir(), "ident-moteur-"));
  try {
    const { ecrire } = monter({ identity: magasinPersistant(bac, { revoque: true }) });
    assert.equal((await ecrire(JID)).raison, RAISONS.IDENTITY_REVOKED);
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
});

test("le magasin persistant reconnait son numero apres redemarrage", async () => {
  const bac = mkdtempSync(join(tmpdir(), "ident-moteur-"));
  try {
    magasinPersistant(bac);
    // Nouvelle instance = redemarrage du service.
    const relu = new IdentityStorePersistant({ chemin: join(bac, "identites.json") });
    const { ecrire, journal } = monter({ identity: relu });
    await ecrire(JID);
    assert.equal(journal.at(-1).decision, "ALLOW");
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
});

// --- Le journal ne doit rien divulguer -------------------------------------

test("le journal d'identification ne contient aucun numero complet", async () => {
  const bac = mkdtempSync(join(tmpdir(), "ident-moteur-"));
  try {
    const magasin = magasinPersistant(bac);
    const { ecrire, journal } = monter({ identity: magasin });
    await ecrire(JID);
    await ecrire("23599999999@c.us");
    const texte = JSON.stringify(journal);
    assert.ok(!texte.includes(NUM), "le numero reconnu ne doit pas apparaitre");
    assert.ok(!texte.includes("23599999999"), "le numero refuse non plus");
    assert.match(journal[0].numeroMasque, /^235•+001$/);

    // L'empreinte du message accepte doit valoir celle du magasin : c'est ce
    // qui permet, en production, de dire « c'est le bon numero » ou « c'en est
    // un autre » sans jamais en afficher un seul.
    const duMagasin = magasin.empreintes("sel-de-test").find((e) => e.utilisateurId === "u-1");
    assert.equal(journal[0].empreinte, duMagasin.empreinte);
    assert.notEqual(journal[1].empreinte, duMagasin.empreinte, "un autre numero, une autre empreinte");
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
});

test("un refus d'identite n'est jamais presente comme un refus de permission", async () => {
  const { ecrire, audit } = monter();
  await ecrire("23599999999@c.us");
  const e = audit.last();
  assert.equal(e.result, "REFUSED_UNKNOWN");
  assert.equal(e.raison, RAISONS.UNKNOWN_NUMBER);
  assert.equal(e.permission, undefined, "aucune permission n'a ete evaluee : l'identite a manque avant");
});
