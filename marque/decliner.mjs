#!/usr/bin/env node
/**
 * Décline le logo vectoriel en toutes les tailles attendues par les deux
 * applications.
 *
 * POURQUOI UN SCRIPT PLUTÔT QUE DES FICHIERS COMMITÉS À LA MAIN
 * -------------------------------------------------------------
 * Une identité visuelle se décline en une quinzaine de fichiers : favicon,
 * icônes PWA, icône Android par densité, écran de lancement. Les produire à
 * la main garantit qu'au premier retouchage du logo, deux ou trois d'entre
 * eux resteront à l'ancienne version — et personne ne s'en apercevra avant
 * de voir l'ancien logo dans un onglet.
 *
 * Ici, une seule source : `logo-lgr.svg`. Tout le reste en découle.
 *
 * Usage : node marque/decliner.mjs
 */

import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

// `sharp` vit dans les dépendances de l'application web : ce script n'a pas
// son propre `package.json`, on le résout donc depuis là plutôt que de
// dupliquer une dépendance de 30 Mo pour un usage ponctuel.
const require = createRequire(import.meta.url);
const sharp = require("../web/node_modules/sharp");

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const SOURCE = path.join(ICI, "logo-lgr.svg");

/** Densité de rastérisation. Élevée : on réduit ensuite, jamais l'inverse. */
const DENSITE = 1200;

const dossier = (...morceaux) => {
  const chemin = path.join(...morceaux);
  mkdirSync(chemin, { recursive: true });
  return chemin;
};

/** Rend le logo sur fond transparent. */
const transparent = (taille) =>
  sharp(SOURCE, { density: DENSITE }).resize(taille, taille).png({ compressionLevel: 9 });

/**
 * Rend le logo sur fond plein, avec marge.
 *
 * Android rogne les icônes en cercle, en carré arrondi ou en goutte selon le
 * lanceur : sans marge, la couronne de laurier serait amputée sur la moitié
 * des téléphones. La zone sûre est de 66 % du côté, d'où le facteur retenu.
 */
async function surFond(taille, fond, proportion = 0.68) {
  const interieur = Math.round(taille * proportion);
  const logo = await transparent(interieur).toBuffer();

  return sharp({
    create: { width: taille, height: taille, channels: 4, background: fond },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 });
}

const BLANC = { r: 255, g: 255, b: 255, alpha: 1 };

console.log("Déclinaison du logo…\n");

// ---------------------------------------------------------------------------
// Fichiers de référence
// ---------------------------------------------------------------------------
const marque = dossier(ICI, "export");
for (const taille of [256, 512, 1024, 2048]) {
  await transparent(taille).toFile(path.join(marque, `logo-${taille}.png`));
}
await (await surFond(1024, BLANC, 0.78)).toFile(path.join(marque, "logo-carre-1024.png"));
console.log("  marque/export : 4 tailles transparentes + 1 carré blanc");

// ---------------------------------------------------------------------------
// Application web (Next.js)
//
// Next.js sert `app/icon.png` et `app/apple-icon.png` automatiquement ; les
// icônes PWA vont dans `public/`.
// ---------------------------------------------------------------------------
const publicWeb = dossier(RACINE, "web", "public");
const appWeb = path.join(RACINE, "web", "src", "app");

copyFileSync(SOURCE, path.join(publicWeb, "logo.svg"));
await transparent(192).toFile(path.join(publicWeb, "icone-192.png"));
await transparent(512).toFile(path.join(publicWeb, "icone-512.png"));
await (await surFond(512, BLANC, 0.8)).toFile(path.join(publicWeb, "icone-512-pleine.png"));

// L'onglet du navigateur affiche l'icône sur 16 pixels : la couronne y devient
// une bouillie verte. On y met donc le logo sur fond blanc, plus lisible.
await (await surFond(32, BLANC, 0.92)).toFile(path.join(appWeb, "icon.png"));
await (await surFond(180, BLANC, 0.84)).toFile(path.join(appWeb, "apple-icon.png"));
console.log("  web : logo.svg, icônes PWA 192/512, favicon, icône Apple");

// ---------------------------------------------------------------------------
// Application mobile (Flutter)
// ---------------------------------------------------------------------------
const marqueMobile = dossier(RACINE, "mobile", "assets", "marque");
copyFileSync(SOURCE, path.join(marqueMobile, "logo.svg"));
await transparent(1024).toFile(path.join(marqueMobile, "logo-1024.png"));

// Sources de `flutter_launcher_icons` : l'icône complète pour iOS et les
// anciens Android, la seule couronne pour le premier plan adaptatif.
const iconesMobile = dossier(RACINE, "mobile", "assets", "icone");
await (await surFond(1024, BLANC, 0.8)).toFile(path.join(iconesMobile, "icone.png"));
await transparent(1024).toFile(path.join(iconesMobile, "premier-plan.png"));
console.log("  mobile : logo.svg, sources d'icônes 1024");

// ---------------------------------------------------------------------------
// Manifeste PWA
// ---------------------------------------------------------------------------
writeFileSync(
  path.join(publicWeb, "manifest.webmanifest"),
  `${JSON.stringify(
    {
      name: "Lycée Guergné La Renaissance",
      short_name: "LGR",
      description: "Administration scolaire du Lycée Guergné La Renaissance",
      start_url: "/dashboard/default",
      display: "standalone",
      background_color: "#F8FAFC",
      theme_color: "#1E429F",
      lang: "fr",
      icons: [
        { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icone-512-pleine.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  )}\n`,
);
console.log("  web : manifest.webmanifest\n");

console.log("Déclinaison terminée. Source unique : marque/logo-lgr.svg");
