/**
 * Recette STRUCTURELLE des imports : un symbole utilisé doit être importé.
 *
 * POURQUOI CE TEST EXISTE
 * ------------------------
 * Le moteur vocal a échoué en production sur `path is not defined`. La cause
 * tenait à une seule ligne : `app.js` importait `{ join } from "node:path"` —
 * donc le nom `join`, pas l'espace de noms `path` — et une autre ligne
 * utilisait `path.delimiter`. Le fichier se chargeait sans erreur, la syntaxe
 * était valide, et `node --check` ne voyait rien : la référence n'échoue qu'à
 * l'EXÉCUTION de la ligne concernée, laquelle ne tourne qu'au démarrage réel
 * sur le serveur.
 *
 * Aucun test unitaire ne pouvait l'attraper, parce que ce chemin de code exige
 * un conteneur, Python et des modèles de 63 Mo. Il a donc fallu un démarrage en
 * production pour découvrir une faute d'import.
 *
 * Ce test attrape la CLASSE entière du défaut, sans rien exécuter : il lit les
 * sources et vérifie que tout espace de noms employé est bien lié.
 *
 * CE QU'IL NE PRÉTEND PAS FAIRE
 * ------------------------------
 * Ce n'est pas une analyse sémantique : il ne connaît pas les portées
 * imbriquées et ne remplace pas un vérificateur de types. Il couvre les
 * espaces de noms des modules natifs, qui sont la source observée de ce
 * défaut, et il le fait sur tout le dossier plutôt que sur un fichier.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Les espaces de noms dont un usage `x.y` trahit un import manquant.
 *
 * On ne prend que des noms de modules natifs : un `path.join` ou un `fs.read`
 * sans import est toujours une faute, alors qu'un `audio.truc` peut
 * parfaitement être une variable locale.
 */
const ESPACES = ["path", "fs", "os", "crypto", "url", "util", "child_process", "process"];

/** Tous les `.js` et `.mjs` de l'agent, sauf les dépendances et les tests. */
async function sources(dossier = RACINE, trouves = []) {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "donnees" || e.name.startsWith(".")) continue;
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) {
      await sources(chemin, trouves);
    } else if (/\.m?js$/.test(e.name) && !/\.test\.m?js$/.test(e.name)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Le nom est-il lié dans ce fichier — par un import, une déclaration, ou global ? */
function estLie(nom, texte) {
  if (nom === "process") return true; // global de Node
  const motifs = [
    // import path from "node:path"  /  import * as path from …
    new RegExp(`import\\s+(?:\\*\\s+as\\s+)?${nom}\\s+from`),
    // import { x as path } from …
    new RegExp(`import\\s*\\{[^}]*\\bas\\s+${nom}\\b[^}]*\\}\\s*from`),
    // const path = require(…)  /  const { ... } = await import(…)
    new RegExp(`(?:const|let|var)\\s+${nom}\\s*=`),
    // function path() {} — improbable mais licite
    new RegExp(`function\\s+${nom}\\s*\\(`),
  ];
  return motifs.some((m) => m.test(texte));
}

test("aucun espace de noms natif n'est utilise sans etre importe", async () => {
  const fautes = [];
  for (const fichier of await sources()) {
    const texte = await readFile(fichier, "utf-8");
    // Les commentaires et les chaines produiraient de faux positifs : on les
    // retire grossierement avant d'analyser.
    const code = texte
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");

    for (const nom of ESPACES) {
      // `nom.` precede d'un caractere qui ne fait pas partie d'un identifiant
      // ni d'un acces a une propriete : `a.path.b` n'est pas concerne.
      const usage = new RegExp(`(^|[^\\w$.])${nom}\\s*\\.\\s*\\w`, "m");
      if (usage.test(code) && !estLie(nom, code)) {
        const ligne = code.split("\n").findIndex((l) => usage.test(l)) + 1;
        fautes.push(`${fichier.slice(RACINE.length + 1)}:${ligne} utilise « ${nom}. » sans l'importer`);
      }
    }
  }
  assert.deepEqual(fautes, [], `imports manquants :\n  ${fautes.join("\n  ")}`);
});

test("le defaut EXACT observe en production serait attrape", () => {
  // `import { join } from "node:path"` lie `join`, pas `path`.
  const fautif = 'import { join } from "node:path";\nconst x = [a, b].join(path.delimiter);';
  assert.equal(estLie("path", fautif), false, "le test doit voir que `path` n'est pas lie");

  // Les formes correctes, elles, doivent passer.
  for (const bon of [
    'import path from "node:path";\npath.delimiter;',
    'import * as path from "node:path";\npath.delimiter;',
    'const path = require("node:path");\npath.delimiter;',
  ]) {
    assert.equal(estLie("path", bon), true, `forme correcte rejetee : ${bon.split("\n")[0]}`);
  }
});

test("un nom importe nommement ne declenche pas de fausse alerte", async () => {
  // `app.js` importe desormais `{ delimiter, join }` et n'utilise plus
  // `path.` : c'est la correction, et elle doit rester.
  const texte = await readFile(join(RACINE, "app.js"), "utf-8");
  assert.match(texte, /import \{ delimiter, join \} from "node:path"/);
  assert.ok(!/[^\w$.]path\s*\.\s*\w/.test(texte.replace(/\/\*[\s\S]*?\*\//g, " ")), "app.js ne doit plus utiliser « path. »");
});

// --- La même famille de défaut, sur un objet du projet -------------------

test("toute clef de « chemins » employee par app.js existe vraiment", async () => {
  // Defaut observe en production : `chemins.donnees` valait `undefined`, parce
  // que `cheminsPersistants` rend `racine` et non `donnees`. Le chemin devenait
  // « undefined/voix », et 160 Mo de modeles ont ete telecharges dans un
  // dossier nomme « undefined ». Aucune exception n'a ete levee : une propriete
  // absente vaut `undefined`, et `undefined/voix` est une chaine parfaitement
  // valide.
  const { cheminsPersistants } = await import("../src/persistance.js");
  const offertes = new Set(Object.keys(cheminsPersistants("/une/racine")));
  // Les commentaires sont retires : celui qui EXPLIQUE ce defaut cite
  // forcement la clef fautive, et se signalerait donc lui-meme.
  const texte = (await readFile(join(RACINE, "app.js"), "utf-8"))
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const employees = new Set([...texte.matchAll(/\bchemins\.(\w+)/g)].map((m) => m[1]));
  const inconnues = [...employees].filter((c) => !offertes.has(c));
  assert.deepEqual(
    inconnues,
    [],
    `app.js lit des clefs que « cheminsPersistants » ne rend pas : ${inconnues.join(", ")} ` +
      `(offertes : ${[...offertes].join(", ")})`,
  );
});
