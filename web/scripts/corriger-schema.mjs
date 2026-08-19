#!/usr/bin/env node
/**
 * Corrige le schéma généré par `drizzle-kit pull`.
 *
 * L'introspection ne sait pas traduire `bytea` et écrit `unknown("contenu")`,
 * qui ne compile pas. Plutôt que de corriger à la main après chaque
 * régénération — et de l'oublier un jour — on rejoue la correction ici,
 * appelée automatiquement par `npm run db:pull`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CIBLE = path.resolve(ICI, "../src/server/db/generated/schema.ts");

let source = readFileSync(CIBLE, "utf8");
let corrections = 0;

if (source.includes('unknown("contenu")') || /:\s*unknown\(/.test(source)) {
  source = source.replace(/\t\/\/ TODO: failed to parse database type 'bytea'\n/g, "");
  source = source.replace(/:\s*unknown\(/g, ": bytea(");

  if (!source.includes('from "../types-personnalises"')) {
    // L'import est ajouté après le dernier import existant.
    const lignes = source.split("\n");
    const dernierImport = lignes.reduce(
      (dernier, ligne, index) => (ligne.startsWith("import ") ? index : dernier),
      0,
    );
    lignes.splice(dernierImport + 1, 0, 'import { bytea } from "../types-personnalises";');
    source = lignes.join("\n");
  }
  corrections += 1;
}

if (corrections > 0) {
  writeFileSync(CIBLE, source);
  console.log("Schéma corrigé : type bytea rétabli.");
} else {
  console.log("Schéma généré : rien à corriger.");
}
