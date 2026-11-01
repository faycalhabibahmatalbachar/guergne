/**
 * Analyse des identifiants WhatsApp (JID) — l'étape où l'agent décide QUI écrit.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * L'agent comparait la partie numérique de `msg.from` à la liste blanche. Cela
 * fonctionne pour `235xxxxxxxx@c.us`, et **seulement** pour celui-là.
 *
 * Depuis la migration de WhatsApp vers les identifiants LID, un message peut
 * arriver de `19876543210987@lid`. La partie numérique d'un LID est un
 * identifiant interne de WhatsApp : elle ne désigne aucun abonné téléphonique.
 * La comparer à la liste blanche a deux issues, toutes deux fausses :
 *   - aucune correspondance, et un responsable pourtant autorisé est refusé ;
 *   - une correspondance fortuite, et un inconnu obtient le compte d'un autre.
 *
 * Ce module refuse donc de traiter la partie numérique d'un LID comme un
 * numéro. Il dit de quel type est l'identifiant, et laisse à l'appelant le soin
 * de résoudre le vrai numéro par le mécanisme officiel de la bibliothèque
 * (`client.getContactLidAndPhone`, présent en 1.34).
 *
 * AU MOINDRE DOUTE, ON REFUSE. Une identité mal résolue ouvre les dossiers de
 * 549 élèves à la mauvaise personne ; une identité refusée coûte un message.
 */

/** Serveurs JID que WhatsApp emploie réellement. */
export const SERVEURS = {
  /** Conversation individuelle : la partie gauche EST le numéro international. */
  UTILISATEUR: "c.us",
  /** Même sens que `c.us`, forme employée par d'autres bibliothèques. */
  UTILISATEUR_ALT: "s.whatsapp.net",
  /** Identifiant interne WhatsApp : la partie gauche N'EST PAS un numéro. */
  LID: "lid",
  /** Conversation de groupe. */
  GROUPE: "g.us",
  /** Statuts et diffusions. */
  DIFFUSION: "broadcast",
};

/** Raisons de refus, exposées telles quelles dans l'audit. */
export const RAISONS = {
  INVALID_JID: "INVALID_JID",
  NORMALIZATION_FAILED: "NORMALIZATION_FAILED",
  GROUP_NOT_SUPPORTED: "GROUP_NOT_SUPPORTED",
  BROADCAST_NOT_SUPPORTED: "BROADCAST_NOT_SUPPORTED",
  LID_NOT_RESOLVED: "LID_NOT_RESOLVED",
  UNKNOWN_NUMBER: "UNKNOWN_NUMBER",
  IDENTITY_SUSPENDED: "IDENTITY_SUSPENDED",
  IDENTITY_REVOKED: "IDENTITY_REVOKED",
};

/**
 * Décompose un JID sans rien interpréter.
 *
 * @returns {{valide:boolean, serveur:string|null, partie:string, porteLeNumero:boolean}}
 *   `porteLeNumero` dit si la partie gauche peut être lue comme un numéro.
 *   C'est la distinction qui manquait.
 */
export function analyserJid(jid) {
  const brut = String(jid ?? "").trim();
  const at = brut.lastIndexOf("@");
  if (at <= 0 || at === brut.length - 1) {
    return { valide: false, serveur: null, partie: brut, porteLeNumero: false };
  }
  // La partie gauche peut porter un suffixe d'appareil (`:12`) ou un
  // discriminant d'agent, qui ne font pas partie de l'identifiant.
  const partie = brut.slice(0, at).split(":")[0];
  const serveur = brut.slice(at + 1).toLowerCase();

  const connu = Object.values(SERVEURS).includes(serveur);
  const porteLeNumero = serveur === SERVEURS.UTILISATEUR || serveur === SERVEURS.UTILISATEUR_ALT;

  return { valide: connu, serveur, partie, porteLeNumero };
}

/** Un JID de conversation individuelle, construit à partir d'un numéro. */
export const jidUtilisateur = (numero) => `${String(numero ?? "").replace(/\D/g, "")}@${SERVEURS.UTILISATEUR}`;

/**
 * Numéro réel de l'expéditeur d'un message.
 *
 * `resoudreLid` est fourni par le transport : c'est lui seul qui sait
 * interroger WhatsApp. Il reçoit le JID LID et rend le JID téléphonique, ou
 * rien. Il n'est appelé QUE pour un LID : un `c.us` porte déjà son numéro, et
 * y ajouter un aller-retour réseau ralentirait chaque message sans rien
 * apporter.
 *
 * @param {object} o
 * @param {string} o.jid
 * @param {(jid:string) => Promise<string|null>} [o.resoudreLid]
 * @returns {Promise<{ok:true, numero:string, serveur:string, viaLid:boolean}
 *                 | {ok:false, raison:string, serveur:string|null}>}
 */
export async function resoudreNumeroDepuisJid({ jid, resoudreLid }) {
  const a = analyserJid(jid);

  if (!a.valide) return { ok: false, raison: RAISONS.INVALID_JID, serveur: a.serveur };
  if (a.serveur === SERVEURS.GROUPE) return { ok: false, raison: RAISONS.GROUP_NOT_SUPPORTED, serveur: a.serveur };
  if (a.serveur === SERVEURS.DIFFUSION) {
    return { ok: false, raison: RAISONS.BROADCAST_NOT_SUPPORTED, serveur: a.serveur };
  }

  if (a.porteLeNumero) {
    const numero = a.partie.replace(/\D/g, "");
    if (!numero) return { ok: false, raison: RAISONS.NORMALIZATION_FAILED, serveur: a.serveur };
    return { ok: true, numero, serveur: a.serveur, viaLid: false };
  }

  // Ici, et seulement ici : un LID. Sa partie numérique ne doit JAMAIS servir
  // de numéro de repli — c'est exactement la confusion que ce module empêche.
  if (typeof resoudreLid !== "function") {
    return { ok: false, raison: RAISONS.LID_NOT_RESOLVED, serveur: a.serveur };
  }
  let resolu = null;
  try {
    resolu = await resoudreLid(jid);
  } catch {
    resolu = null;
  }
  if (!resolu) return { ok: false, raison: RAISONS.LID_NOT_RESOLVED, serveur: a.serveur };

  // Ce que rend le transport doit être un JID téléphonique. Un LID rendu pour
  // un LID ne nous avance en rien, et doit être refusé plutôt qu'accepté.
  const b = analyserJid(resolu);
  if (!b.porteLeNumero) return { ok: false, raison: RAISONS.LID_NOT_RESOLVED, serveur: a.serveur };
  const numero = b.partie.replace(/\D/g, "");
  if (!numero) return { ok: false, raison: RAISONS.NORMALIZATION_FAILED, serveur: a.serveur };

  return { ok: true, numero, serveur: a.serveur, viaLid: true };
}

/**
 * Empreinte non réversible d'un numéro, pour comparer deux numéros dans les
 * journaux sans en divulguer aucun.
 *
 * Un numéro tchadien tient dans 10^8 possibilités : un condensat nu se casse
 * par force brute en quelques secondes. Le sel rend l'empreinte inutilisable
 * hors du serveur qui l'a produite — c'est un outil de comparaison, pas un
 * identifiant à publier.
 */
export function empreinte(numero, sel = "") {
  const n = String(numero ?? "").replace(/\D/g, "");
  if (!n) return null;
  let h = 0x811c9dc5;
  for (const c of `${sel}:${n}`) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
