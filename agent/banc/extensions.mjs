/**
 * Ce que la mission « intelligence » ajoute au moteur, branché dans le banc
 * EXACTEMENT comme dans `app.js` : le résolveur central d'entités, et
 * l'interprète qui s'appuie sur lui (le modèle écrit des noms, pas des
 * identifiants).
 *
 * `BANC_SANS_EXTENSIONS=oui` mesure le moteur sans elles — la référence.
 */
import { poserExtensions } from "./moteur.mjs";
import { Resolveur } from "../src/resolution-parametres.js";
import { creerInterprete } from "../src/interprete.js";

poserExtensions(({ guergne, referentiel, outils, ia, evenements }) => ({
  resolveur: new Resolveur({ guergne, referentiel }),
  interpret: creerInterprete({ ia, outils, referentiel, guergne, resolutionCentrale: true, journal: (e) => evenements.push(e) }),
}));
