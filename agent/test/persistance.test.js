import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DedupPersistant, VerrouInstance, cheminsPersistants } from "../src/persistance.js";

const bac = () => mkdtempSync(join(tmpdir(), "agent-persist-"));

test("la déduplication survit à un redémarrage du processus", () => {
  const d = bac();
  try {
    const f = join(d, "dedup.json");
    const a = new DedupPersistant({ chemin: f });
    a.remember("msg-1");
    assert.equal(a.seen("msg-1"), true);

    // Nouvelle instance = redémarrage : l'identifiant doit être retrouvé.
    const b = new DedupPersistant({ chemin: f });
    assert.equal(b.seen("msg-1"), true, "un rejeu après redémarrage ne doit pas être retraité");
    assert.equal(b.seen("msg-2"), false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("la taille est bornée : les plus anciens sortent", () => {
  const d = bac();
  try {
    const dd = new DedupPersistant({ chemin: join(d, "x.json"), max: 3 });
    for (const id of ["a", "b", "c", "d"]) dd.remember(id);
    assert.equal(dd.taille, 3);
    assert.equal(dd.seen("a"), false, "le plus ancien doit être évincé");
    assert.equal(dd.seen("d"), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un fichier corrompu n'empêche pas le démarrage", () => {
  const d = bac();
  try {
    const f = join(d, "dedup.json");
    writeFileSync(f, "{ceci n'est pas du json", "utf8");
    const dd = new DedupPersistant({ chemin: f });
    assert.equal(dd.taille, 0);
    dd.remember("ok");
    assert.equal(dd.seen("ok"), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("le verrou empêche une seconde instance de démarrer", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    let t = 1000;
    const premier = new VerrouInstance({ chemin: f, pid: 111, horloge: () => t });
    const second = new VerrouInstance({ chemin: f, pid: 222, horloge: () => t });

    assert.equal(premier.acquerir().ok, true);
    const r = second.acquerir();
    assert.equal(r.ok, false, "deux instances sur la même session feraient bannir le numéro");
    assert.equal(r.detenuPar, 111);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un verrou périmé est repris (processus tué sans nettoyage)", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    let t = 1000;
    const mort = new VerrouInstance({ chemin: f, pid: 111, ttlMs: 5000, horloge: () => t });
    mort.acquerir();

    t += 6000; // au-delà du TTL, sans rafraîchissement
    const neuf = new VerrouInstance({ chemin: f, pid: 222, ttlMs: 5000, horloge: () => t });
    assert.equal(neuf.acquerir().ok, true, "un verrou périmé doit pouvoir être repris");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("un verrou rafraîchi reste détenu", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    let t = 1000;
    const vivant = new VerrouInstance({ chemin: f, pid: 111, ttlMs: 5000, horloge: () => t });
    vivant.acquerir();

    t += 4000;
    vivant.rafraichir();
    t += 4000; // 8s depuis l'acquisition, mais 4s depuis le rafraîchissement

    const autre = new VerrouInstance({ chemin: f, pid: 222, ttlMs: 5000, horloge: () => t });
    assert.equal(autre.acquerir().ok, false, "le détenteur vivant doit conserver le verrou");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("libérer le verrou laisse la place", () => {
  const d = bac();
  try {
    const f = join(d, "instance.lock");
    const a = new VerrouInstance({ chemin: f, pid: 111 });
    a.acquerir();
    a.liberer();
    assert.equal(new VerrouInstance({ chemin: f, pid: 222 }).acquerir().ok, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("les chemins persistants sont regroupés sous une racine", () => {
  const c = cheminsPersistants("/data");
  assert.match(c.session, /wwebjs_auth$/);
  assert.match(c.dedup, /dedup\.json$/);
  assert.match(c.verrou, /instance\.lock$/);
});
