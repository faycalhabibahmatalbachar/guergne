/**
 * Délais maximaux — pour qu'aucune attente ne soit infinie.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Un message WhatsApp a cessé d'obtenir toute réponse, sans la moindre ligne
 * de journal. Ni erreur, ni refus : le silence. La cause n'était pas une
 * exception — celles-là sont attrapées — mais une promesse qui ne se résout
 * jamais.
 *
 * La résolution d'un identifiant LID traverse Puppeteer jusqu'à la page de
 * WhatsApp, qui interroge le réseau. Si cette requête reste en suspens, le
 * traitement du message reste en suspens avec elle, pour toujours. Le
 * processus paraît sain, `/sante` répond, WhatsApp est `ready` — et
 * l'utilisateur n'a rien.
 *
 * **Une attente sans borne est un échec qui ne dit pas son nom.** Toute
 * dépendance externe passe désormais par ici.
 */

/** Erreur distincte : l'appelant doit pouvoir distinguer un délai d'une panne. */
export class DelaiDepasse extends Error {
  constructor(operation, ms) {
    super(`${operation} n'a pas repondu en ${ms} ms`);
    this.name = "DelaiDepasse";
    this.operation = operation;
    this.delaiMs = ms;
  }
}

/**
 * Borne une promesse dans le temps.
 *
 * Le minuteur est toujours nettoyé : sans cela, un `setTimeout` en attente
 * garderait la boucle d'événements vivante et retarderait l'arrêt du service.
 *
 * @param {Promise<T>|(() => Promise<T>)} travail
 * @param {object} o
 * @param {number} o.ms
 * @param {string} o.operation  nom lisible, pour le journal
 * @param {T} [o.defaut]        valeur rendue au lieu de lever, si fournie
 * @returns {Promise<T>}
 * @template T
 */
export async function avecDelai(travail, { ms, operation = "operation", defaut = undefined } = {}) {
  let minuteur;
  const promesse = typeof travail === "function" ? travail() : travail;
  try {
    return await Promise.race([
      promesse,
      new Promise((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new DelaiDepasse(operation, ms)), ms);
      }),
    ]);
  } catch (e) {
    // `defaut` n'absorbe QUE le dépassement de délai. Une vraie erreur doit
    // continuer de remonter : la masquer transformerait une panne en silence,
    // exactement ce que ce module corrige.
    if (e instanceof DelaiDepasse && defaut !== undefined) return defaut;
    throw e;
  } finally {
    clearTimeout(minuteur);
    // La promesse abandonnée peut encore échouer plus tard ; sans ce garde,
    // Node signalerait un rejet non géré et pourrait arrêter le processus.
    Promise.resolve(promesse).catch(() => {});
  }
}
