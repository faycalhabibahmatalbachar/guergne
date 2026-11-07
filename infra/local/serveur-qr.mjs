/**
 * Sert la page d'appairage, et EXACTEMENT deux fichiers.
 *
 * POURQUOI UN SERVEUR, ET POURQUOI SI ÉTROIT
 * -------------------------------------------
 * Le code QR change toutes les vingt secondes. Une image envoyée comme pièce
 * jointe est figée à l'instant de l'envoi : c'est ce qui a fait échouer le
 * premier scan, « QR expiré ». Il faut une page qui relit l'image en continu,
 * donc un vrai serveur HTTP — un `file://` ne peut pas recharger une ressource
 * voisine dans l'aperçu.
 *
 * Mais le dossier qui contient le QR contient AUSSI la session WhatsApp
 * appairée : 76 Mo de jetons qui valent un accès au compte. Servir ce dossier
 * reviendrait à publier la session sur le réseau local. Ce serveur n'expose
 * donc que deux chemins, nommés un par un, et refuse tout le reste — y compris
 * ce qui ressemblerait à une remontée d'arborescence.
 *
 *   node infra/local/serveur-qr.mjs            écoute sur 8787
 *   PORT=9000 node infra/local/serveur-qr.mjs
 *
 * Il n'écoute que sur la boucle locale : rien n'est joignable depuis le réseau.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOSSIER = join(racine, "agent", "donnees-locales");
const PORT = Number(process.env.PORT ?? 8787);

/**
 * La liste blanche. Deux entrées, et pas une de plus.
 *
 * Un `startsWith(DOSSIER)` aurait suffi à bloquer les remontées, mais pas à
 * empêcher de servir `wwebjs_auth_local/…`. Nommer les fichiers est la seule
 * barrière qui ne se contourne pas.
 */
const SERVIS = new Map([
  ["/", { fichier: "qr.html", type: "text/html; charset=utf-8" }],
  ["/qr.html", { fichier: "qr.html", type: "text/html; charset=utf-8" }],
  ["/qr-local.png", { fichier: "qr-local.png", type: "image/png" }],
]);

const serveur = createServer(async (req, res) => {
  // La requête peut porter un paramètre anti-cache : on ne garde que le chemin.
  const chemin = (req.url ?? "/").split("?")[0];
  const entree = SERVIS.get(chemin);

  const entetes = {
    // Le QR change toutes les vingt secondes : rien ne doit être mis en cache.
    "cache-control": "no-store, no-cache, must-revalidate",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    // Cette page n'a aucune raison d'être encadrée par un tiers.
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer",
  };

  if (!entree) {
    res.writeHead(404, { ...entetes, "content-type": "text/plain; charset=utf-8" });
    res.end("Ce serveur ne sert que la page d'appairage et son image.\n");
    return;
  }

  try {
    const complet = join(DOSSIER, entree.fichier);
    const info = await stat(complet);
    const contenu = await readFile(complet);
    res.writeHead(200, {
      ...entetes,
      "content-type": entree.type,
      "content-length": contenu.length,
      // L'age de l'image dit si l'ecoute produit encore des codes : une image
      // qui ne change plus signale une ecoute arretee.
      "x-age-s": Math.round((Date.now() - info.mtimeMs) / 1000),
    });
    res.end(contenu);
  } catch {
    res.writeHead(503, { ...entetes, "content-type": "text/plain; charset=utf-8" });
    res.end("Pas encore de code : l'ecoute ne l'a pas encore produit.\n");
  }
});

// 127.0.0.1 et non 0.0.0.0 : rien ne doit etre joignable depuis le reseau.
serveur.listen(PORT, "127.0.0.1", () => {
  console.log(`Page d'appairage : http://localhost:${PORT}/`);
  console.log(`Sert uniquement : ${[...new Set([...SERVIS.values()].map((e) => e.fichier))].join(", ")}`);
  console.log(`Depuis : ${DOSSIER}`);
});
