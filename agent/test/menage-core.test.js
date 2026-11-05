/**
 * Recette du ménage des vidages mémoire.
 *
 * Un balayage automatique qui se trompe efface des données. Ces tests portent
 * donc surtout sur ce qu'il NE doit PAS toucher.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGE_MINIMAL_MS, balayerCoreDumps } from "../src/menage-core.js";

const dossier = () => mkdtemp(join(tmpdir(), "menage-"));

/** Un vrai en-tête ELF de type CORE, suivi de remplissage. */
function octetsCore(taille = 4096) {
  const b = Buffer.alloc(taille, 7);
  b[0] = 0x7f;
  b.write("ELF", 1, "latin1");
  b[4] = 2; // 64 bits
  b.writeUInt16LE(4, 16); // ET_CORE
  return b;
}

/** Un ELF qui n'est PAS un core : un exécutable. */
function octetsExecutable() {
  const b = octetsCore(2048);
  b.writeUInt16LE(2, 16); // ET_EXEC
  return b;
}

/** Vieillit un fichier au-delà du seuil. */
async function vieillir(chemin) {
  const vieux = new Date(Date.now() - 10 * 60 * 1000);
  await utimes(chemin, vieux, vieux);
}

test("un vidage memoire ELF ancien est balaye", async () => {
  const d = await dossier();
  const f = join(d, "core.104");
  await writeFile(f, octetsCore(8192));
  await vieillir(f);
  const r = await balayerCoreDumps({ dossier: d });
  assert.deepEqual(r.supprimes, ["core.104"]);
  assert.equal(r.octets, 8192);
  assert.deepEqual(await readdir(d), []);
});

test("plusieurs vidages sont balayes et leur poids additionne", async () => {
  const d = await dossier();
  for (const n of ["core.1", "core.22", "core.333"]) {
    const f = join(d, n);
    await writeFile(f, octetsCore(1024));
    await vieillir(f);
  }
  const r = await balayerCoreDumps({ dossier: d });
  assert.equal(r.supprimes.length, 3);
  assert.equal(r.octets, 3072);
});

// --- Ce qu'il ne doit JAMAIS toucher ------------------------------------

test("un fichier qui n'est pas nomme « core.<chiffres> » est intact", async () => {
  const d = await dossier();
  const gardes = ["core.txt", "core", "coreutils", "mon-core.1", "core.1.bak", "score.1"];
  for (const n of gardes) await writeFile(join(d, n), octetsCore(512));
  const r = await balayerCoreDumps({ dossier: d });
  assert.deepEqual(r.supprimes, []);
  assert.deepEqual((await readdir(d)).sort(), [...gardes].sort());
});

test("un fichier bien nomme mais qui n'est PAS un core ELF est intact", async () => {
  // Un executable, ou n'importe quel autre contenu, ne doit pas disparaitre
  // au pretexte de son nom.
  const d = await dossier();
  for (const [nom, contenu] of [
    ["core.1", octetsExecutable()],
    ["core.2", Buffer.from("ceci n'est pas un ELF du tout")],
  ]) {
    const f = join(d, nom);
    await writeFile(f, contenu);
    await vieillir(f);
  }
  const r = await balayerCoreDumps({ dossier: d });
  assert.deepEqual(r.supprimes, []);
  assert.equal(r.ignores, 2);
  assert.equal((await readdir(d)).length, 2);
});

test("un DOSSIER nomme core.1 est intact", async () => {
  const d = await dossier();
  await mkdir(join(d, "core.1"));
  const r = await balayerCoreDumps({ dossier: d });
  assert.deepEqual(r.supprimes, []);
  assert.equal(r.ignores, 1);
  assert.ok((await readdir(d)).includes("core.1"));
});

test("un vidage TROP RECENT est laisse : le noyau peut encore l'ecrire", async () => {
  // L'effacer sous la plume risquerait de bloquer le processus qui tombe.
  const d = await dossier();
  await writeFile(join(d, "core.9"), octetsCore(2048));
  const r = await balayerCoreDumps({ dossier: d });
  assert.deepEqual(r.supprimes, []);
  assert.equal(r.ignores, 1);
  assert.ok(AGE_MINIMAL_MS > 0);
});

test("le ménage ne descend dans AUCUN sous-dossier", async () => {
  // Les modeles vocaux, la session et les donnees scolaires vivent dans des
  // sous-dossiers : le balayage ne doit jamais y entrer.
  const d = await dossier();
  await mkdir(join(d, "donnees"));
  const cache = join(d, "donnees", "core.5");
  await writeFile(cache, octetsCore(1024));
  await vieillir(cache);
  const r = await balayerCoreDumps({ dossier: d });
  assert.deepEqual(r.supprimes, []);
  assert.ok((await readdir(join(d, "donnees"))).includes("core.5"));
});

// --- Robustesse ---------------------------------------------------------

test("un dossier inexistant ne fait pas lever, il est rapporte", async () => {
  // Un menage qui echoue ne doit pas empecher l'agent de demarrer.
  const r = await balayerCoreDumps({ dossier: join(await dossier(), "absent") });
  assert.deepEqual(r.supprimes, []);
  assert.equal(r.erreurs.length, 1);
  assert.match(r.erreurs[0], /impossible/);
});

test("un appel sans dossier ne leve pas", async () => {
  await assert.doesNotReject(() => balayerCoreDumps({}));
});

test("le journal n'est ecrit que s'il y a eu quelque chose a balayer", async () => {
  const d = await dossier();
  const lignes = [];
  await balayerCoreDumps({ dossier: d, journal: (e) => lignes.push(e) });
  assert.deepEqual(lignes, [], "rien a dire quand rien n'a ete supprime");

  const f = join(d, "core.7");
  await writeFile(f, octetsCore(1048576));
  await vieillir(f);
  await balayerCoreDumps({ dossier: d, journal: (e) => lignes.push(e) });
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].evenement, "core_dumps_balayes");
  assert.equal(lignes[0].mo, 1);
});
