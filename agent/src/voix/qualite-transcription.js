/**
 * Juger la fiabilité d'une transcription avant de la croire.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Notre propre note vocale bilingue, repassée dans la reconnaissance, a rendu
 * ceci :
 *
 *   « Bonjour, ceci est un test du système vocal du lycée
 *     Guernier-la-Renaissance. La synthèse française fonctionne et la
 *     transmission WhatsApp est en cours de validation. Bonjour, c'est un test
 *     de la communication de la communication de la communication de la
 *     communication de la communication. […] »
 *
 * La première phrase est juste. La seconde moitié est une hallucination : la
 * partie arabe a été lue comme du français, et le modèle, n'ayant rien à y
 * mapper, a répété la même locution cinq fois.
 *
 * Whisper choisit UNE langue pour TOUT le fichier. Un enregistrement qui
 * change de langue en cours de route produit donc, pour la moitié, du texte
 * qui ressemble à du français et n'en est pas.
 *
 * CE QUE CE DÉFAUT REND DANGEREUX
 * --------------------------------
 * Une transcription hallucinée n'est pas vide : elle est plausible. Elle
 * franchirait sans peine le garde-fou « transcription vide », atteindrait le
 * modèle, et pourrait devenir une intention — donc une action scolaire posée
 * sur du bruit. C'est exactement ce que le projet s'interdit.
 *
 * La répétition est le signe le plus net de ce décrochage, et elle se mesure.
 *
 * CE QUE CE MODULE NE PRÉTEND PAS FAIRE
 * --------------------------------------
 * Il ne juge pas si une transcription est VRAIE — personne ne peut le faire
 * sans réécouter. Il repère un symptôme précis, et il le repère avec des
 * seuils volontairement prudents : mieux vaut laisser passer une hallucination
 * discrète que refuser une demande légitime où quelqu'un s'est répété.
 */

/**
 * Nombre de répétitions consécutives à partir duquel une locution devient
 * suspecte.
 *
 * Trois, parce que deux arrivent naturellement — « très très bien », « non
 * non » — alors que trois fois la même locution de plusieurs mots ne se
 * produit pas dans une phrase parlée normale.
 */
export const REPETITIONS_SUSPECTES = 3;

/** Un mot seul se répète plus facilement : on est plus tolérant. */
export const REPETITIONS_MOT_SEUL = 5;

/** Longueur maximale, en mots, d'une locution dont on cherche la répétition. */
const LOCUTION_MAX = 5;

/** Proportion de mots distincts en dessous de laquelle le texte tourne en rond. */
export const DIVERSITE_MINIMALE = 0.25;

/** En deçà de ce nombre de mots, les proportions ne veulent rien dire. */
const MOTS_MINIMUM_POUR_JUGER = 25;

/** Découpe en mots comparables : sans ponctuation, sans accents, en minuscules. */
function mots(texte) {
  return String(texte ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ْ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Cherche la locution consécutivement répétée le plus de fois.
 *
 * On balaie les longueurs de locution de la plus LONGUE à la plus courte :
 * « de la communication » répété cinq fois doit être rapporté comme une
 * locution de trois mots, et non comme le mot « de » répété cinq fois, qui
 * décrirait mal ce qui se passe.
 *
 * @returns {{locution:string, mots:number, fois:number}|null}
 */
export function detecterRepetition(texte) {
  const m = mots(texte);
  let pire = null;

  for (let taille = LOCUTION_MAX; taille >= 1; taille--) {
    for (let i = 0; i + taille <= m.length; i++) {
      const motif = m.slice(i, i + taille).join(" ");
      let fois = 1;
      let j = i + taille;
      while (j + taille <= m.length && m.slice(j, j + taille).join(" ") === motif) {
        fois += 1;
        j += taille;
      }
      const seuil = taille === 1 ? REPETITIONS_MOT_SEUL : REPETITIONS_SUSPECTES;
      if (fois >= seuil && (!pire || fois * taille > pire.fois * pire.mots)) {
        pire = { locution: motif, mots: taille, fois };
      }
    }
    // Une locution longue trouvée est plus descriptive qu'une courte : on
    // s'arrête à la première taille qui donne un résultat.
    if (pire) break;
  }
  return pire;
}

/**
 * Juge une transcription, et dit pourquoi.
 *
 * @param {string} texte
 * @param {{langueAttendue?:string|null, langueLue?:string|null}} [o]
 * @returns {{fiable:boolean, griefs:string[], repetition:object|null, diversite:number|null}}
 */
export function evaluerTranscription(texte, { langueAttendue = null, langueLue = null } = {}) {
  const t = String(texte ?? "").trim();
  const griefs = [];
  const m = mots(t);

  if (m.length === 0) {
    return { fiable: false, griefs: ["transcription vide"], repetition: null, diversite: null };
  }

  const repetition = detecterRepetition(t);
  if (repetition) {
    griefs.push(
      `« ${repetition.locution} » repete ${repetition.fois} fois de suite : ` +
        "signe d'un decrochage du modele",
    );
  }

  // La diversité lexicale : un texte qui tourne en rond réutilise peu de mots
  // différents. Jugée seulement sur un texte assez long, sinon elle n'a pas
  // de sens — une phrase de cinq mots peut légitimement en répéter deux.
  let diversite = null;
  if (m.length >= MOTS_MINIMUM_POUR_JUGER) {
    diversite = new Set(m).size / m.length;
    if (diversite < DIVERSITE_MINIMALE) {
      griefs.push(`${Math.round(diversite * 100)} % de mots distincts seulement : le texte tourne en rond`);
    }
  }

  // Une langue lue qui contredit la langue attendue n'est pas en soi une
  // hallucination — l'utilisateur a le droit de changer de langue. Mais
  // combinée à une répétition, elle confirme le décrochage.
  if (langueAttendue && langueLue && langueAttendue !== langueLue && repetition) {
    griefs.push(`langue lue « ${langueLue} » au lieu de « ${langueAttendue} », avec repetition`);
  }

  return { fiable: griefs.length === 0, griefs, repetition, diversite };
}
