/**
 * Préparation d'un texte pour la synthèse vocale.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * La réponse écrite de l'agent est faite pour être LUE : elle porte des puces,
 * des tirets, des matricules, des identifiants, parfois du gras. Donnée telle
 * quelle à un moteur vocal, elle produit une voix qui énonce « étoile »,
 * « tiret bas » et épelle des UUID pendant dix secondes.
 *
 * Ce module ne corrige donc pas le texte : il en dérive une version DITE,
 * destinée à l'oreille. La réponse écrite canonique n'est jamais modifiée —
 * c'est elle qui fait foi, et deux versions divergentes d'une même information
 * scolaire seraient pires qu'une absence de voix.
 *
 * TROIS RESPONSABILITÉS, ET POURQUOI ELLES SONT ENSEMBLE
 * ------------------------------------------------------
 * Détecter la langue, normaliser pour l'oral et découper en segments sont trois
 * étapes d'une seule chose : transformer un texte écrit en quelque chose qu'on
 * peut prononcer. Les séparer en trois fichiers obligerait à faire circuler le
 * même texte et la même langue entre eux sans rien y gagner.
 */

/** Les langues que le système sait prononcer aujourd'hui. */
export const LANGUES = Object.freeze(["fr", "ar"]);

/**
 * Détecte la langue d'un texte.
 *
 * POURQUOI PAR L'ÉCRITURE, ET NON PAR LES MOTS
 * ---------------------------------------------
 * L'arabe et le français n'utilisent pas le même alphabet : compter les
 * caractères arabes est à la fois plus simple et plus sûr qu'une liste de mots
 * fréquents, qui se trompe sur les phrases courtes — et les demandes des
 * utilisateurs sont courtes.
 *
 * Le seuil n'est pas la majorité absolue : une réponse arabe contient des
 * chiffres, des matricules et des noms en caractères latins. Dès qu'une part
 * notable du texte est en écriture arabe, c'est de l'arabe.
 *
 * Aucune langue n'est imposée par défaut sans examen : quand il n'y a rien à
 * examiner, on rend `null` plutôt que de choisir le français.
 */
export function detecterLangue(texte) {
  const t = String(texte ?? "");
  // Plage arabe de base, plus les suppléments : sans eux, un texte en arabe
  // tchadien écrit avec des lettres étendues passerait pour du latin.
  const arabes = (t.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/gu) || []).length;
  const lettres = (t.match(/\p{L}/gu) || []).length;
  if (lettres === 0) return null;
  return arabes / lettres >= 0.2 ? "ar" : "fr";
}

/** Nombre, au plus deux décimales, prononcé à la française. */
const nombreDit = (brut) => {
  const n = Number(String(brut).replace(",", "."));
  if (!Number.isFinite(n)) return String(brut);
  if (Number.isInteger(n)) return String(n);
  const [ent, dec] = n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").split(".");
  return dec ? `${ent} virgule ${dec}` : ent;
};

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * Normalise un texte pour l'oral.
 *
 * Chaque transformation répond à un défaut entendu, pas à une préférence de
 * style. L'ordre compte : les dates avant les nombres, sinon « 2026-11-04 »
 * serait lu comme trois nombres séparés.
 */
export function normaliserPourOral(texte, { langue = null } = {}) {
  let t = String(texte ?? "");
  if (t.trim() === "") return "";

  // 1. Les URL. Une adresse énoncée caractère par caractère occupe la voix
  //    plusieurs secondes et n'apprend rien : on dit qu'il y a un lien.
  t = t.replace(/https?:\/\/\S+/gu, langue === "ar" ? " رابط " : " un lien ");

  // 2. Markdown. Les marqueurs se prononceraient : « étoile étoile ».
  t = t.replace(/\*\*(.+?)\*\*/gsu, "$1").replace(/__(.+?)__/gsu, "$1");
  t = t.replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$)/gu, "$1$2");
  t = t.replace(/`{1,3}([^`]*)`{1,3}/gsu, "$1");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gmu, "");
  // Une puce devient une pause : la liste reste audible comme une liste.
  t = t.replace(/^\s*[•\-*+]\s+/gmu, " … ");
  t = t.replace(/^\s*\d+[.)]\s+/gmu, " … ");
  // Les séparateurs de tableau et les filets n'ont aucun sens à l'oreille.
  t = t.replace(/^\s*\|?[\s:|-]{6,}\|?\s*$/gmu, " ");
  t = t.replace(/\s*\|\s*/gu, " , ");

  // 3. Les dates ISO, avant les nombres.
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/gu, (_, a, m, j) => {
    const mois = MOIS[Number(m) - 1];
    if (!mois) return `${a} ${m} ${j}`;
    const jour = Number(j) === 1 ? "premier" : String(Number(j));
    return `${jour} ${mois} ${a}`;
  });
  t = t.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/gu, (_, j, m, a) => {
    const mois = MOIS[Number(m) - 1];
    return mois ? `${Number(j) === 1 ? "premier" : Number(j)} ${mois} ${a}` : `${j} ${m} ${a}`;
  });

  // 4. Les matricules. « LGR-2025-1050 » épelé est illisible à l'oreille ;
  //    groupé, il reste reconnaissable et se note.
  t = t.replace(/\b([A-Z]{2,4})-(\d{4})-(\d{3,5})\b/gu, (_, p, a, n) => `${p.split("").join(" ")} ${a} ${n}`);

  // 5. Les identifiants techniques. Un UUID prononcé est du bruit pur.
  t = t.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, " ");

  // 6. Les heures et les nombres décimaux.
  t = t.replace(/\b(\d{1,2})[h:](\d{2})\b/gu, (_, h, m) => (m === "00" ? `${Number(h)} heures` : `${Number(h)} heures ${Number(m)}`));
  t = t.replace(/\b(\d+)[.,](\d+)\b/gu, (m) => nombreDit(m));
  // Les pourcentages et unités abrégées.
  t = t.replace(/(\d)\s*%/gu, "$1 pour cent");
  t = t.replace(/\b(\d+(?:\s\w+)?)\s*h\b/gu, "$1 heures");

  // 7. Les émojis et symboles décoratifs : muets, mais ils cassent la prosodie.
  t = t.replace(/[\p{Extended_Pictographic}←-⇿☀-➿]/gu, " ");

  // 8. Espaces. On conserve les accents français et les caractères arabes :
  //    les retirer changerait la prononciation, ce qui est tout l'inverse du
  //    but.
  t = t.replace(/[ \t]{2,}/gu, " ").replace(/\n{3,}/gu, "\n\n");
  return t.trim();
}

/** Longueur visée d'un segment : assez long pour être naturel, assez court pour partir vite. */
export const CIBLE_SEGMENT = 320;

/** Le premier segment est plus court : c'est lui qui décide du délai ressenti. */
export const CIBLE_PREMIER = 140;

/**
 * Découpe un texte en segments prononçables.
 *
 * POURQUOI LE PREMIER EST PLUS COURT
 * -----------------------------------
 * L'utilisateur ne mesure pas la durée totale de génération : il mesure
 * l'attente avant d'entendre quelque chose. Un premier segment de cent
 * quarante caractères se synthétise en une fraction de seconde et part
 * aussitôt ; les suivants se génèrent pendant qu'il est écouté.
 *
 * POURQUOI ON NE COUPE QU'AUX FRONTIÈRES DE PHRASE
 * -------------------------------------------------
 * Couper au milieu d'une phrase produit deux moitiés dont aucune n'a de
 * prosodie : la voix tombe là où elle devrait monter. Une phrase plus longue
 * que la cible part donc seule, entière, plutôt que mutilée.
 */
export function segmenter(texte, { ciblePremier = CIBLE_PREMIER, cible = CIBLE_SEGMENT } = {}) {
  const t = String(texte ?? "").trim();
  if (t === "") return [];
  if (t.length <= ciblePremier) return [t];

  // Frontières de phrase, y compris la ponctuation arabe (؟ ،) et les points
  // de suspension produits par les puces.
  const phrases = t
    .split(/(?<=[.!?؟…])\s+|\n{2,}/u)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const segments = [];
  let courant = "";
  for (const phrase of phrases) {
    const limite = segments.length === 0 ? ciblePremier : cible;
    if (courant === "") {
      courant = phrase;
    } else if (`${courant} ${phrase}`.length <= limite) {
      courant = `${courant} ${phrase}`;
    } else {
      segments.push(courant);
      courant = phrase;
    }
    // Une phrase qui depasse deja la limite part seule : la couper serait pire.
    if (courant.length >= limite) {
      segments.push(courant);
      courant = "";
    }
  }
  if (courant !== "") segments.push(courant);
  return segments;
}

/**
 * Prépare un texte de bout en bout : langue, version dite, segments.
 *
 * `langue` peut être imposée — l'utilisateur a le droit de demander une langue
 * — mais n'est jamais devinée en faveur du français quand rien ne permet de
 * trancher.
 */
export function preparerPourVoix(texte, { langue = null, ciblePremier, cible } = {}) {
  const detectee = langue ?? detecterLangue(texte);
  const oral = normaliserPourOral(texte, { langue: detectee });
  return {
    langue: detectee,
    texteOral: oral,
    segments: segmenter(oral, { ciblePremier, cible }),
  };
}
