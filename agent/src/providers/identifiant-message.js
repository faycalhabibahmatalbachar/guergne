/**
 * Identifiant d'un message WhatsApp : le reconstituer quand la passerelle
 * ne le rend pas.
 *
 * LE DÉFAUT QUE CE MODULE CORRIGE
 * --------------------------------
 * Les journaux de production montraient `idMessage: null` sur CHAQUE message,
 * reçu comme envoyé. Ce n'était pas un défaut de journalisation : la propriété
 * `id._serialized` est réellement absente des objets `Message` rendus par
 * whatsapp-web.js 1.34.7 sur la version actuelle de WhatsApp Web.
 *
 * La raison est mécanique. `WWebJS.getMessageModel` fait
 * `Object.assign({}, msg.id, …)`, et le modèle traverse ensuite la frontière
 * Puppeteer, qui sérialise en JSON. Or `_serialized` est un accesseur porté
 * par le PROTOTYPE de `MsgKey` : ni `Object.assign` ni `JSON.stringify` ne
 * recopient un accesseur de prototype. La propriété disparaît donc des deux
 * côtés à la fois.
 *
 * CE QUE CELA CASSAIT
 * -------------------
 * Bien plus qu'un journal. `Message.downloadMedia()` passe `this.id._serialized`
 * — donc `undefined` — au code de WhatsApp Web, qui tentait de résoudre un
 * identifiant vide et levait une erreur minifiée d'une seule lettre : le
 * fameux `handler_failed: "r"` qui empêchait toute note vocale entrante
 * d'arriver jusqu'au modèle. Les messages textuels, qui ne téléchargent aucun
 * média, n'étaient pas touchés — ce qui explique qu'ils fonctionnaient.
 *
 * LE FORMAT
 * ---------
 * WhatsApp sérialise une clé de message en `fromMe_remote_id`, avec un
 * quatrième champ `participant` pour les messages de groupe. C'est exactement
 * ce que `Client.getMessageById` attend (il refuse toute autre longueur).
 */

/** Rend la partie texte d'un champ qui peut être une chaîne ou un WID objet. */
function chaine(valeur) {
  if (typeof valeur === "string") return valeur || null;
  if (valeur && typeof valeur === "object") {
    const s = valeur._serialized;
    return typeof s === "string" && s ? s : null;
  }
  return null;
}

/**
 * Reconstitue `_serialized` à partir des champs qui, eux, survivent.
 *
 * @param {any} id la propriété `id` d'un message whatsapp-web.js
 * @returns {string|null} l'identifiant complet, ou `null` s'il est inexploitable
 */
export function serialiserIdMessage(id) {
  if (typeof id === "string") return id || null;
  if (!id || typeof id !== "object") return null;

  // Quand la passerelle l'a fourni, on ne devine rien.
  const fourni = chaine(id._serialized);
  if (fourni) return fourni;

  const remote = chaine(id.remote);
  const partie = typeof id.id === "string" && id.id ? id.id : null;
  // Sans ces deux champs, aucune reconstitution n'est honnête : on le dit.
  if (!remote || !partie) return null;

  const morceaux = [id.fromMe ? "true" : "false", remote, partie];
  const participant = chaine(id.participant);
  if (participant) morceaux.push(participant);
  return morceaux.join("_");
}

/**
 * La partie proprement aléatoire de l'identifiant, sans le correspondant.
 *
 * L'identifiant complet porte le JID de l'autre partie, donc un numéro de
 * téléphone : il n'a rien à faire dans un journal. Cette partie-ci, en
 * revanche, est une chaîne opaque tirée au hasard par WhatsApp. Elle suffit à
 * retrouver un message dans l'historique du téléphone, et ne divulgue personne.
 */
export function partieIdMessage(id) {
  if (typeof id === "string") {
    const m = id.split("_");
    return m.length >= 3 ? m[2] : null;
  }
  if (id && typeof id === "object" && typeof id.id === "string" && id.id) return id.id;
  return null;
}

/**
 * Pose `_serialized` sur l'objet `id` d'un message quand il manque.
 *
 * Réparation volontairement locale : l'objet appartient à notre processus, et
 * la bibliothèque le lira ensuite sans savoir qu'il a été complété. C'est
 * préférable à une copie de `downloadMedia` chez nous, qui divergerait à la
 * prochaine mise à jour de WhatsApp Web.
 *
 * @returns {{ok:boolean, repare:boolean, id:string|null}}
 */
export function reparerIdMessage(message) {
  const id = message?.id;
  const serialise = serialiserIdMessage(id);
  if (!serialise) return { ok: false, repare: false, id: null };
  if (id && typeof id === "object" && !chaine(id._serialized)) {
    try {
      id._serialized = serialise;
      return { ok: true, repare: true, id: serialise };
    } catch {
      // Objet gelé : la lecture reste possible, l'appel de la bibliothèque non.
      return { ok: false, repare: false, id: serialise };
    }
  }
  return { ok: true, repare: false, id: serialise };
}
