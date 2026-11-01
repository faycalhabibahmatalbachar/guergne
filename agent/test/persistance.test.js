import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DedupPersistant, cheminsPersistants } from "../src/persistance.js";

// Le verrou d'instance a ses propres tests : voir `verrou.test.js`.

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

test("les chemins persistants sont regroupés sous une racine", () => {
  const c = cheminsPersistants("/data");
  assert.match(c.session, /wwebjs_auth$/);
  assert.match(c.dedup, /dedup\.json$/);
  assert.match(c.verrou, /instance\.lock$/);
  assert.match(c.redemarrages, /redemarrages\.json$/);
});
