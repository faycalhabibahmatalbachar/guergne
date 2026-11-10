/**
 * La confirmation d'une écriture : ce qu'un « oui » autorise, et ce qu'il n'autorise pas.
 *
 * LES TROIS FAILLES QUE CE MODULE FERME
 * --------------------------------------
 * Le moteur gardait une écriture en attente par conversation, et l'exécutait au
 * premier message qui COMMENÇAIT par « oui », « ok » ou « valide ». Trois
 * conséquences, toutes réelles :
 *
 *   1. Aucune expiration. Un « oui » envoyé le lendemain, à propos de tout
 *      autre chose, exécutait l'écriture de la veille.
 *   2. Une nouvelle demande n'effaçait pas l'attente. « Inscris Mahamat en
 *      6e A », puis « au fait, combien d'absences ? », puis « oui, merci »
 *      inscrivait Mahamat.
 *   3. « Oui » en préfixe suffisait. « Oui mais mets-le plutôt en 5e B »
 *      exécutait l'inscription en 6e A — les paramètres D'ORIGINE —, en
 *      ignorant précisément la correction.
 *
 * CE QU'UNE CONFIRMATION EST DÉSORMAIS
 * -------------------------------------
 *   - liée à UNE opération, à UN utilisateur, à UNE conversation ;
 *   - porteuse d'une empreinte des paramètres, figés au moment du récapitulatif ;
 *   - à usage unique ;
 *   - limitée dans le temps ;
 *   - abandonnée dès que l'utilisateur dit autre chose qu'un oui ou un non NETS.
 *
 * Un message ambigu n'est jamais une approbation : dans le doute, on ne fait
 * rien et on le dit.
 */
import { createHash } from "node:crypto";

/** Au-delà, un « oui » ne vaut plus : la situation a pu changer. */
export const DUREE_CONFIRMATION_MS = Number(process.env.AGENT_CONFIRMATION_TTL_MS ?? 5 * 60 * 1000);

/** Minuscules, sans accents ni ponctuation, espaces réduits. */
function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Les formes NETTES d'un oui. Une liste fermée, et non un préfixe : tout ce qui
 * ajoute une condition, une correction ou une autre demande n'en fait pas partie.
 */
/**
 * Les listes passent par LA MÊME normalisation que les messages.
 *
 * Écrites brutes, elles ne correspondaient pas : la décomposition Unicode
 * sépare la hamza de « أؤكد » (U+0623 → U+0627 + U+0654), et le message
 * normalisé ne retrouvait plus l'entrée. Le test l'a montré sur l'arabe.
 */
const normalisees = (formes) => new Set(formes.map(normaliser));

const OUI = normalisees([
  "oui", "oui merci", "oui confirme", "oui je confirme", "je confirme", "confirme", "confirmer",
  "c est confirme", "confirmation", "valide", "valider", "je valide", "oui valide", "ok", "ok merci",
  "d accord", "oui d accord", "oui vas y", "vas y", "allez y", "oui allez y", "oui c est bon", "c est bon",
  "oui oui", "affirmatif", "yes",
  // Arabe : « oui », « oui je confirme », « je confirme », « d'accord ».
  "نعم", "نعم أؤكد", "أؤكد", "موافق", "تمام", "اي", "أكيد",
]);

const NON = normalisees([
  "non", "non merci", "annule", "annuler", "j annule", "non annule", "stop", "laisse tomber",
  "pas maintenant", "cancel", "abandonne", "abandon", "non pas maintenant",
  // Arabe : « non », « annule ».
  "لا", "الغاء", "إلغاء", "لا شكرا",
]);

export const estConfirmation = (texte) => OUI.has(normaliser(texte));
export const estRefus = (texte) => NON.has(normaliser(texte));

/** Copie profonde gelée : les paramètres confirmés ne peuvent plus bouger. */
function figer(valeur) {
  const copie = JSON.parse(JSON.stringify(valeur ?? {}));
  const geler = (o) => {
    if (o && typeof o === "object") {
      Object.freeze(o);
      for (const v of Object.values(o)) geler(v);
    }
    return o;
  };
  return geler(copie);
}

/** Empreinte de ce qui est confirmé : l'opération ET ses paramètres. */
export function empreinteOperation(nomOutil, params) {
  return createHash("sha256").update(`${nomOutil}\n${JSON.stringify(params ?? {})}`).digest("hex").slice(0, 16);
}

/**
 * Prépare l'attente qui suit un récapitulatif.
 *
 * @returns {{tool:object, params:object, runId:string, staffId:string, empreinte:string, creeA:number, expireA:number}}
 */
export function creerAttente({ tool, params, runId, staffId, maintenant = Date.now(), dureeMs = DUREE_CONFIRMATION_MS }) {
  const figes = figer(params);
  return Object.freeze({
    tool,
    params: figes,
    runId,
    staffId,
    empreinte: empreinteOperation(tool?.name, figes),
    creeA: maintenant,
    expireA: maintenant + dureeMs,
  });
}

/**
 * Ce que vaut une réponse face à une attente.
 *
 * @returns {"confirmer"|"annuler"|"expiree"|"autre_utilisateur"|"abandonnee"}
 *   - `confirmer` : un oui net, du bon utilisateur, dans le délai ;
 *   - `annuler`   : un non net ;
 *   - `expiree`   : le délai est passé — l'attente ne vaut plus rien ;
 *   - `autre_utilisateur` : l'identité ne correspond pas ;
 *   - `abandonnee` : l'utilisateur a dit autre chose — l'attente tombe, et le
 *     message est traité comme une nouvelle demande.
 */
export function evaluerReponse(attente, { texte, staffId, maintenant = Date.now() }) {
  if (!attente) return "abandonnee";
  if (attente.staffId && staffId && attente.staffId !== staffId) return "autre_utilisateur";
  if (maintenant > attente.expireA) return "expiree";
  // L'empreinte est recalculée : si quoi que ce soit avait altéré les
  // paramètres depuis le récapitulatif, l'attente serait invalide.
  if (empreinteOperation(attente.tool?.name, attente.params) !== attente.empreinte) return "abandonnee";
  if (estConfirmation(texte)) return "confirmer";
  if (estRefus(texte)) return "annuler";
  return "abandonnee";
}
