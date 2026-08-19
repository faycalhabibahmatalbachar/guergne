#!/usr/bin/env node
/**
 * Convertit les lettres du logo en tracés.
 *
 * POURQUOI
 * --------
 * Un `<text>` dans un SVG dépend de la police présente sur la machine qui
 * l'affiche. Deux conséquences, toutes deux constatées :
 *
 *   - `flutter_svg` ne rend pas les balises `<text>` : les lettres du logo
 *     apparaissaient en blocs verts pleins dans l'application.
 *   - Sur un navigateur sans Georgia, le monogramme changeait de dessin.
 *
 * Un logo ne doit jamais dépendre d'une police installée. On convertit donc
 * les lettres en contours une fois pour toutes : le fichier devient autonome
 * et rend rigoureusement à l'identique partout — application, navigateur,
 * imprimeur.
 *
 * Usage : node marque/vectoriser-lettres.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const opentype = require("../web/node_modules/opentype.js");

const ICI = path.dirname(fileURLToPath(import.meta.url));
const POLICE = path.resolve(ICI, "../mobile/assets/polices/Inter-Bold.ttf");

const octets = readFileSync(POLICE);
const police = opentype.parse(
  octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength),
);

/**
 * Trace d'une chaîne, glyphe par glyphe.
 *
 * `font.getPath()` échoue sur cette police — on compose donc la ligne à la
 * main, ce qui a l'avantage de rendre l'avance de chaque glyphe explicite.
 */
function tracer(texte, x, y, taille) {
  const echelle = taille / police.unitsPerEm;
  const morceaux = [];
  let curseur = x;

  for (const caractere of texte) {
    const glyphe = police.charToGlyph(caractere);
    const trace = glyphe.getPath(curseur, y, taille);
    const donnees = trace.toPathData(2);
    if (donnees) morceaux.push(donnees);
    curseur += glyphe.advanceWidth * echelle;
  }

  return { d: morceaux.join(" "), largeur: curseur - x };
}

/** Trace centré horizontalement sur `x`. */
function tracerCentre(texte, x, y, taille) {
  const essai = tracer(texte, 0, 0, taille);
  return tracer(texte, x - essai.largeur / 2, y, taille).d;
}

// ---------------------------------------------------------------------------
// Lettres du logo, aux positions établies dans le SVG source
// ---------------------------------------------------------------------------

const lettres = [
  ["GR", 256, 206, 112],
  ["A", 138, 306, 72],
  ["1", 172, 272, 34],
  ["2", 388, 306, 72],
];

const traces = lettres
  .map(([texte, x, y, taille]) => {
    const d = tracerCentre(texte, x, y, taille);
    return `    <path d="${d}"/>  <!-- ${texte} -->`;
  })
  .join("\n");

// ---------------------------------------------------------------------------
// Remplacement dans le SVG
// ---------------------------------------------------------------------------

const cible = path.join(ICI, "logo-lgr.svg");
let svg = readFileSync(cible, "utf8");

const debut = svg.indexOf("  <!-- ================= Monogramme");
const fin = svg.indexOf("  <!-- ================= Encrier");
if (debut === -1 || fin === -1) {
  console.error("Repères du monogramme introuvables dans le SVG.");
  process.exit(1);
}

const bloc = `  <!-- ================= Monogramme ================= -->
  <!--
    Lettres converties en contours par \`marque/vectoriser-lettres.mjs\`.

    Ne pas les réécrire en \`<text>\` : \`flutter_svg\` ne rend pas cette balise,
    et le logo perdrait ses lettres dans l'application mobile. Pour changer le
    monogramme, modifier le script et le rejouer.
  -->
  <g fill="#1B5E20">
${traces}
  </g>

`;

svg = svg.slice(0, debut) + bloc + svg.slice(fin);
writeFileSync(cible, svg);

console.log(`Lettres vectorisées : ${lettres.map((l) => l[0]).join(", ")}`);
console.log("marque/logo-lgr.svg est désormais autonome — aucune police requise.");
