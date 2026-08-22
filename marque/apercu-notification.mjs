/**
 * Aperçu de l'icône de notification sur fond sombre.
 *
 * L'icône est blanche sur transparent : ouverte telle quelle dans une visionneuse
 * à fond clair, elle paraît vide. Ce script la compose sur un gris anthracite,
 * comme la barre d'état, pour qu'on puisse juger la silhouette.
 *
 * Usage : node marque/apercu-notification.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("../web/node_modules/sharp");

const ICI = path.dirname(fileURLToPath(import.meta.url));

// Trois tailles : la réelle en barre d'état (24), l'intermédiaire, et un
// agrandissement pour juger le tracé.
const TAILLES = [24, 48, 192];
const MARGE = 16;

const glyphes = await Promise.all(
  TAILLES.map((taille) =>
    sharp(path.join(ICI, "icone-notification.svg"), { density: 1200 })
      .resize(taille, taille)
      .png()
      .toBuffer(),
  ),
);

const largeur = TAILLES.reduce((somme, t) => somme + t + MARGE, MARGE);
const hauteur = Math.max(...TAILLES) + MARGE * 2;

let x = MARGE;
const calques = glyphes.map((input, i) => {
  const gauche = x;
  x += TAILLES[i] + MARGE;
  return { input, left: gauche, top: Math.round((hauteur - TAILLES[i]) / 2) };
});

await sharp({
  create: { width: largeur, height: hauteur, channels: 4, background: { r: 32, g: 36, b: 44, alpha: 1 } },
})
  .composite(calques)
  .png()
  .toFile(path.join(ICI, "apercu-notification.png"));

console.log(`Aperçu écrit : marque/apercu-notification.png (${TAILLES.join(", ")} px)`);
