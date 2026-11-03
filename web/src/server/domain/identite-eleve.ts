/**
 * Identité d'un élève : normalisation et comparaison (P0 — doublons).
 *
 * POURQUOI UN MODULE À PART, SANS BASE NI SERVEUR
 * ------------------------------------------------
 * Trois endroits du logiciel décident si deux lignes parlent du même enfant :
 * l'inscription au guichet, l'import en masse, et la recherche. Chacun avait
 * sa propre idée de l'égalité — l'import comparait des chaînes brutes, donc
 * « MAHAMAT » et « Mahamat » y passaient pour deux personnes. Une règle écrite
 * une fois, testable sans base, vaut mieux que trois approximations.
 *
 * Ce fichier ne contient que des fonctions pures : il est importé par des
 * actions serveur, mais aussi exécuté tel quel par `node --test`. Il ne doit
 * donc jamais importer `@/server/db` ni quoi que ce soit de « server-only ».
 *
 * CE QUE LA NORMALISATION NE FAIT PAS
 * ------------------------------------
 * Elle ne corrige pas les fautes de frappe et ne mesure aucune distance
 * d'édition. « MBAIRAMADJI » et « MBAIRABE » sont deux familles différentes du
 * Logone, et un rapprochement approximatif les confondrait. Ici, deux
 * écritures du même nom se rejoignent ; deux noms différents restent
 * différents, même proches à l'œil.
 */

/** Longueur d'une date au format `YYYY-MM-DD`, tel que stocké en base. */
const LONGUEUR_DATE_ISO = 10;

/** Au-delà, l'utilisateur ne cherche plus : il colle une phrase. */
const MOTS_RECHERCHE_MAX = 5;

/**
 * Normalise un nom ou un prénom pour la comparaison.
 *
 * Accents retirés, casse neutralisée, tirets et apostrophes ramenés à un
 * espace, espaces multiples réduits, bords nettoyés.
 *
 * POURQUOI LE TIRET ET L'APOSTROPHE DEVIENNENT UN ESPACE
 * -------------------------------------------------------
 * Les noms composés tchadiens s'écrivent indifféremment « Mahamat-Saleh »,
 * « Mahamat Saleh » ou « MAHAMAT  SALEH » selon qui tient le registre, et
 * « N'Garta » ou « N Garta » selon le clavier. Ces variantes désignent la même
 * personne : la normalisation doit les réunir, sinon le guichet crée un second
 * dossier en toute bonne foi.
 *
 * Le résultat garde les frontières de mots — c'est ce qui permet de l'afficher
 * ou de le découper. La comparaison stricte, elle, passe par `cleIdentite`.
 */
export function normaliserIdentite(valeur: string | null | undefined): string {
  if (typeof valeur !== "string") return "";
  return (
    valeur
      .normalize("NFD")
      // `\p{M}` = marques combinantes : ce qui reste après NFD une fois la
      // lettre de base détachée (l'accent de « é », la cédille de « ç »).
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      // Tout ce qui n'est ni lettre ni chiffre devient une séparation : cela
      // couvre l'apostrophe droite comme typographique, le tiret de toutes
      // largeurs, le point et les espaces multiples, en une seule règle.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Clé de comparaison stricte d'un nom ou d'un prénom.
 *
 * Même traitement que `normaliserIdentite`, mais les séparations de mots
 * disparaissent aussi.
 *
 * POURQUOI ALLER PLUS LOIN QUE L'ESPACE
 * --------------------------------------
 * « N'Djamena », « Ndjamena » et « N Djamena » sont le même mot ; seule la
 * machine à écrire a changé. Pour DÉTECTER un doublon on accepte cette
 * tolérance, parce que le coût d'un dossier en double — deux matricules, deux
 * échéanciers, deux bulletins — est très supérieur au coût d'un avertissement
 * de trop, que l'utilisateur peut écarter.
 */
export function cleIdentite(valeur: string | null | undefined): string {
  return normaliserIdentite(valeur).replace(/ /g, "");
}

/**
 * Ramène une date de naissance à `YYYY-MM-DD`, ou `""` si elle est absente.
 *
 * La base stocke un `date` que le pilote rend en chaîne, les formulaires
 * envoient une chaîne d'`<input type="date">`, et certains appels passent un
 * horodatage complet. On compare des jours, jamais des instants : une heure
 * parasite ne doit pas décider qu'il s'agit de deux enfants.
 */
export function normaliserDateNaissance(valeur: string | Date | null | undefined): string {
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) return "";
    return valeur.toISOString().slice(0, LONGUEUR_DATE_ISO);
  }
  if (typeof valeur !== "string") return "";
  const brut = valeur.trim();
  if (!brut) return "";
  const debut = brut.slice(0, LONGUEUR_DATE_ISO);
  return /^\d{4}-\d{2}-\d{2}$/.test(debut) ? debut : "";
}

/** Identité minimale suffisante pour décider d'un doublon. */
export interface IdentiteEleve {
  nom: string | null | undefined;
  prenom: string | null | undefined;
  dateNaissance: string | Date | null | undefined;
}

/**
 * Dit si deux identités désignent probablement la même personne.
 *
 * CE QUI COMPTE COMME IDENTIQUE
 * ------------------------------
 * Le nom et le prénom comparés sur leur clé (sans accents, sans casse, sans
 * tiret ni apostrophe, espaces indifférents), ET la même date de naissance au
 * jour près.
 *
 * CE QUI NE COMPTE PAS
 * ---------------------
 * 1. Une date de naissance DIFFÉRENTE n'est jamais la même personne, même à
 *    nom et prénom rigoureusement identiques. Les homonymes existent, et ils
 *    sont nombreux ici : plusieurs « MAHAMAT Ali » par promotion. Confondre
 *    deux enfants parce qu'ils portent le même nom, c'est leur mélanger leurs
 *    notes, leur assiduité et leur scolarité — exactement ce qu'il faut ne
 *    jamais faire.
 * 2. Une date de naissance ABSENTE ou illisible d'un côté ne décide rien : on
 *    répond « non », faute de quoi un champ vide rapprocherait tous les
 *    homonymes du fichier.
 * 3. Un nom ou un prénom vide ne décide rien non plus.
 * 4. Un prénom plus court n'est pas un prénom égal : « Mahamat » n'est pas
 *    « Mahamat Ali ». On ne tronque pas, on ne devine pas.
 *
 * Le nom et le prénom ne sont PAS interchangeables : voir la note du rapport,
 * l'inversion nom/prénom des registres est une décision métier à trancher.
 */
export function memePersonne(a: IdentiteEleve, b: IdentiteEleve): boolean {
  const dateA = normaliserDateNaissance(a.dateNaissance);
  const dateB = normaliserDateNaissance(b.dateNaissance);
  if (!dateA || !dateB || dateA !== dateB) return false;

  const nomA = cleIdentite(a.nom);
  const nomB = cleIdentite(b.nom);
  if (!nomA || !nomB || nomA !== nomB) return false;

  const prenomA = cleIdentite(a.prenom);
  const prenomB = cleIdentite(b.prenom);
  if (!prenomA || !prenomB || prenomA !== prenomB) return false;

  return true;
}

/**
 * Découpe une saisie de recherche en mots.
 *
 * POURQUOI DÉCOUPER
 * ------------------
 * Au guichet on tape « Mahamat Ali » sans savoir lequel des deux est le nom.
 * Avec un seul motif collé, la requête cherchait « %Mahamat Ali%» dans le nom
 * puis dans le prénom, et ne trouvait rien — les deux morceaux étant dans deux
 * colonnes. Chaque mot doit pouvoir tomber dans n'importe laquelle, et tous
 * doivent être trouvés : « Mahamat Ali » et « Ali Mahamat » désignent le même
 * dossier.
 *
 * Les séparateurs des noms composés sont des espaces ici aussi : chercher
 * « Mahamat-Saleh » revient à chercher les deux mots.
 *
 * On plafonne le nombre de mots : au-delà, la saisie est un collage et la
 * requête n'y gagnerait qu'une conjonction interminable.
 */
export function motsRecherche(terme: string | null | undefined): string[] {
  const normalise = normaliserIdentite(terme);
  if (!normalise) return [];
  return normalise.split(" ").slice(0, MOTS_RECHERCHE_MAX);
}
