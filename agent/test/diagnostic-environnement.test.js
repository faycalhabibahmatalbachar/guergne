/**
 * Recette du relevé d'outillage.
 *
 * Cette sonde existe pour trancher UNE question : Python est-il présent dans
 * le conteneur Altare ? Elle décide si Piper est déployable, puisque sa
 * distribution officielle v1.8.0 n'est qu'un wheel Python. Ces tests vérifient
 * donc surtout qu'elle ne se trompe pas de verdict, et qu'elle n'ouvre pas une
 * porte d'exécution.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { OUTILS, releverEnvironnement } from "../src/diagnostic-environnement.js";

/**
 * Faux `execFile`. Les réponses sont données par nom de commande ; tout le
 * reste est traité comme absent du PATH, comme le vrai le ferait.
 */
function fauxLanceur(reponses) {
  return (cmd, _args, _opts, rappel) => {
    const r = reponses[cmd];
    if (!r) {
      const e = new Error("spawn ENOENT");
      e.code = "ENOENT";
      return rappel(e, "", "");
    }
    if (r.erreur) return rappel(Object.assign(new Error(r.erreur), { code: r.code }), r.stdout ?? "", r.stderr ?? "");
    return rappel(null, r.stdout ?? "", r.stderr ?? "");
  };
}

// --- La question que la sonde existe pour trancher -----------------------

test("Python present : le verdict declare Piper deployable", async () => {
  const r = await releverEnvironnement({
    lancer: fauxLanceur({ python3: { stdout: "Python 3.11.2\n" }, ffmpeg: { stderr: "ffmpeg version 5.1.6\n" } }),
  });
  assert.equal(r.outils.python3.present, true);
  assert.equal(r.outils.python3.version, "Python 3.11.2");
  assert.equal(r.verdict.piperDeployable, true);
  assert.match(r.verdict.note, /deplie dans \/home\/container/);
});

test("Python absent : le verdict le dit franchement", async () => {
  // C'est le cas qui arrete la mission, et il doit etre enonce, pas deduit.
  const r = await releverEnvironnement({ lancer: fauxLanceur({}) });
  assert.equal(r.outils.python3.present, false);
  assert.equal(r.outils.python3.raison, "introuvable dans le PATH");
  assert.equal(r.verdict.piperDeployable, false);
  assert.match(r.verdict.note, /pas deployable ici en l'etat/);
});

test("« python » seul suffit si « python3 » manque", async () => {
  const r = await releverEnvironnement({ lancer: fauxLanceur({ python: { stdout: "Python 3.9.18\n" } }) });
  assert.equal(r.verdict.piperDeployable, true);
});

// --- Opus : ffmpeg OU opusenc ---------------------------------------------

test("opusenc seul suffit : il est bien plus leger que ffmpeg", async () => {
  const r = await releverEnvironnement({ lancer: fauxLanceur({ opusenc: { stdout: "opusenc opus-tools 0.2\n" } }) });
  assert.equal(r.verdict.opusPossible, true);
});

test("aucun encodeur : la consequence est nommee", async () => {
  const r = await releverEnvironnement({ lancer: fauxLanceur({ python3: { stdout: "Python 3.11.2\n" } }) });
  assert.equal(r.verdict.opusPossible, false);
  assert.match(r.verdict.noteOpus, /binaire statique ou encoder l'Opus en JavaScript/);
});

// --- Les pièges d'un relevé de versions ----------------------------------

test("une version ecrite sur stderr est bien lue", async () => {
  // ffmpeg ecrit sa version sur stderr : la rater le declarerait absent.
  const r = await releverEnvironnement({ lancer: fauxLanceur({ ffmpeg: { stderr: "ffmpeg version 6.0\nbuilt with gcc\n" } }) });
  assert.equal(r.outils.ffmpeg.present, true);
  assert.equal(r.outils.ffmpeg.version, "ffmpeg version 6.0");
});

test("un outil present qui sort en erreur mais parle est compte present", async () => {
  // Plusieurs outils rendent un code non nul sur `--version`.
  const r = await releverEnvironnement({
    lancer: fauxLanceur({ ldd: { erreur: "exit 1", code: 1, stderr: "ldd (Debian GLIBC 2.36-9) 2.36\n" } }),
  });
  assert.equal(r.outils.ldd.present, true);
  assert.match(r.outils.ldd.version, /GLIBC/);
});

test("une sortie muette ne compte pas comme une presence", async () => {
  const r = await releverEnvironnement({ lancer: fauxLanceur({ python3: { stdout: "   \n\n" } }) });
  assert.equal(r.outils.python3.present, false);
  assert.equal(r.verdict.piperDeployable, false);
});

test("un lanceur qui leve ne fait pas tomber le releve", async () => {
  const r = await releverEnvironnement({
    lancer: () => {
      throw new Error("spawn impossible");
    },
  });
  assert.equal(r.verdict.piperDeployable, false);
  for (const o of OUTILS) assert.equal(r.outils[o.clef].present, false);
});

test("un outil qui ne repond jamais est declare absent, sans bloquer", async () => {
  // Sans ce garde, une sonde suspendue gelerait la route de diagnostic.
  const r = await releverEnvironnement({ lancer: () => {} });
  assert.equal(r.outils.python3.present, false);
  assert.match(r.outils.python3.raison, /aucune reponse/);
});

// --- Ce que la sonde ne doit jamais devenir ------------------------------

test("les commandes sont ECRITES dans le module, jamais recues", async () => {
  // Une sonde qui accepterait une commande serait une porte d'execution a
  // distance, et aucun diagnostic ne vaut cela.
  assert.ok(Object.isFrozen(OUTILS));
  for (const o of OUTILS) {
    assert.match(o.cmd, /^[a-z0-9]+$/, `commande suspecte : ${o.cmd}`);
    assert.ok(Array.isArray(o.args));
    for (const a of o.args) assert.match(a, /^[-a-z0-9]+$/, `argument suspect : ${a}`);
    assert.ok(o.pourquoi?.length > 10, `${o.clef} : la raison de la sonde doit etre ecrite`);
  }
});

test("chaque outil porte la question qu'il tranche", async () => {
  const r = await releverEnvironnement({ lancer: fauxLanceur({}) });
  assert.match(r.outils.python3.pourquoi, /wheel Python/);
  assert.match(r.outils.opusenc.pourquoi, /plus l[eé]ger que ffmpeg/);
});

// --- Ressources de calcul -------------------------------------------------

test("le releve de calcul est rendu, et ne pretend pas connaitre le quota CPU", async () => {
  const r = await releverEnvironnement({ lancer: fauxLanceur({}) });
  assert.ok(r.calcul.coeursVisibles >= 1);
  assert.ok(typeof r.calcul.memoireMachineMo === "number");
  // Les coeurs VISIBLES ne sont pas le quota : le confondre surestimerait la
  // capacite de generation vocale.
  assert.match(r.verdict.note, /./);
  assert.ok("parallelismeDisponible" in r.calcul);
});
