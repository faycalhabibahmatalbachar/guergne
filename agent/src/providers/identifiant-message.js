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
 * LA CAUSE EXACTE, ET MA PREMIÈRE EXPLICATION QUI ÉTAIT FAUSSE
 * ------------------------------------------------------------
 * J'avais conclu à un accesseur de prototype perdu dans la traversée
 * Puppeteer. C'était plausible, et c'était faux. Le dépôt amont le dit
 * clairement — commit `95dc87d1`, « fix(client): add fallback for WhatsApp id
 * ._serialized renamed to id.$1 », 15 juillet 2026 :
 *
 *   WhatsApp Web a RENOMMÉ `_serialized` en `$1`.
 *
 * La conséquence observée est la même — `id._serialized` vaut `undefined` —
 * mais le remède, lui, n'est pas le même. La valeur n'a pas disparu : elle a
 * changé de nom. On la LIT donc, au lieu de la reconstituer de mémoire. La
 * reconstitution reste en second recours, pour le jour où ce nom changera
 * encore.
 *
 * POURQUOI NE PAS SIMPLEMENT METTRE À JOUR LA DÉPENDANCE
 * ------------------------------------------------------
 * Parce qu'aucune version publiée ne porte ce correctif : la dernière sur npm
 * est `1.34.7`, du 24 avril 2026, antérieure de trois mois. Le prendre
 * signifierait dépendre d'un commit de la branche principale, donc de sept
 * mois d'autres changements non publiés, sur une session WhatsApp de
 * production. Nous reproduisons donc sa sémantique ici, dans un module à nous,
 * couvert par des tests, sans toucher à la dépendance épinglée.
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

/**
 * Rend la partie texte d'un champ qui peut être une chaîne ou un WID objet.
 *
 * `$1` est le nom que WhatsApp Web donne depuis juillet 2026 à ce qui
 * s'appelait `_serialized`. On accepte les deux : l'ancien d'abord, pour que
 * rien ne change là où il existe encore.
 */
export function chaineIdentifiant(valeur) {
  if (typeof valeur === "string") return valeur || null;
  if (valeur && typeof valeur === "object") {
    for (const nom of NOMS_SERIALISE) {
      const s = valeur[nom];
      if (typeof s === "string" && s) return s;
    }
  }
  return null;
}
const chaine = chaineIdentifiant;

/**
 * Les noms successifs de la même propriété.
 *
 * L'ordre compte : `_serialized` reste la source quand il est présent, et
 * `$1` ne sert que là où WhatsApp l'a remplacé.
 */
export const NOMS_SERIALISE = Object.freeze(["_serialized", "$1"]);

/**
 * Reconstitue `_serialized` à partir des champs qui, eux, survivent.
 *
 * @param {any} id la propriété `id` d'un message whatsapp-web.js
 * @returns {string|null} l'identifiant complet, ou `null` s'il est inexploitable
 */
export function serialiserIdMessage(id) {
  if (typeof id === "string") return id || null;
  if (!id || typeof id !== "object") return null;

  // Quand la valeur est là — sous l'un ou l'autre de ses noms — on ne devine
  // rien. C'est le cas le plus fréquent, et le seul exact.
  for (const nom of NOMS_SERIALISE) {
    const v = id[nom];
    if (typeof v === "string" && v) return v;
  }

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
  if (id && typeof id === "object") {
    if (typeof id.id === "string" && id.id) return id.id;
    // Un identifiant complet rendu sous son nouveau nom : on le relit.
    const complet = chaine(id);
    if (complet) return partieIdMessage(complet);
  }
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
  // La condition porte sur `_serialized` PRÉCISÉMENT, et non sur « une valeur
  // existe » : la bibliothèque lit ce nom-là, et seulement celui-là. Trouver
  // la valeur sous `$1` ne dispense donc pas de la poser sous l'ancien nom.
  if (id && typeof id === "object" && !(typeof id._serialized === "string" && id._serialized)) {
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
