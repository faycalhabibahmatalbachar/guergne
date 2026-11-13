/**
 * Retire les données de synthèse du banc (marque BANCIA, téléphones fictifs,
 * classes de banc, surveillant de banc) — utile après une campagne
 * interrompue. Base de TEST uniquement (verrou de `ouvrirOracle`).
 *
 *   node banc/nettoyer.mjs
 */
import { ouvrirOracle } from "./moteur.mjs";
import { retirerSynthese } from "./synthese.mjs";

const o = await ouvrirOracle();
try {
  const r = await retirerSynthese({ q: o.q });
  console.log("base " + o.branche + " : " + r.supprimees + " ligne(s) retirée(s), reste " + r.reste);
  if (r.reste) process.exitCode = 1;
} finally {
  await o.fermer();
}
