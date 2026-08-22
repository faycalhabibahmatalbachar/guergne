/**
 * Découpage d'un SMS en segments facturés.
 *
 * POURQUOI C'EST DÉLICAT
 * ----------------------
 * Un SMS n'est pas facturé au caractère mais au **segment**, et la taille d'un
 * segment dépend de l'alphabet utilisé :
 *
 *   - **GSM-7** — 160 caractères, ou 153 quand le message est découpé, les
 *     7 caractères manquants servant à l'en-tête de recollement ;
 *   - **UCS-2** — 70 caractères seulement, ou 67 en multi-segment.
 *
 * Un SEUL caractère hors alphabet GSM-7 fait basculer tout le message en UCS-2
 * et divise sa capacité par plus de deux. « Contrôle continu » suffit : le `ô`
 * n'est pas dans l'alphabet GSM.
 *
 * L'ANCIENNE VERSION SE TROMPAIT DANS LES DEUX SENS
 * -------------------------------------------------
 * Elle acceptait comme GSM-7 des caractères qui n'y sont pas — â, ê, ë, î, ï,
 * ô, û et la plupart des majuscules accentuées — et en refusait qui y sont —
 * ñ, ø, å, æ, ß, ¡, ¿. Conséquence mesurable : un message « Contrôle continu »
 * de 100 caractères était compté 1 segment alors que la passerelle en
 * facturait 2. Le suivi budgétaire de l'établissement était donc faux, et
 * toujours dans le sens qui sous-estime la dépense.
 *
 * La table ci-dessous est celle de la norme GSM 03.38, recopiée telle quelle.
 */

/**
 * Alphabet GSM-7 de base. Chaque caractère compte pour 1.
 *
 * L'ordre n'a pas d'importance ici — seule l'appartenance compte — mais il est
 * conservé tel que la norme le publie, pour qu'une relecture soit possible.
 */
const GSM7_BASE = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
    "¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/**
 * Caractères de la table d'extension. Chacun compte DOUBLE.
 *
 * Ils sont transmis précédés d'un caractère d'échappement — ce qui explique
 * qu'un crochet coûte deux places, et qu'un message rempli de crochets bascule
 * en multi-segment plus tôt qu'on ne l'attendrait.
 */
const GSM7_EXTENSION = new Set("^{}\\[~]|€");

/** Vrai si le texte tient entièrement dans l'alphabet GSM-7. */
export function estGsm7(texte: string): boolean {
  for (const c of texte) {
    if (!GSM7_BASE.has(c) && !GSM7_EXTENSION.has(c)) return false;
  }
  return true;
}

/**
 * Longueur facturée, en unités de l'alphabet retenu.
 *
 * En GSM-7 les caractères d'extension comptent double. En UCS-2, ce sont les
 * caractères hors du plan de base — émojis notamment — qui comptent double,
 * parce qu'ils occupent deux unités de code UTF-16.
 */
function longueurFacturee(texte: string, gsm7: boolean): number {
  if (gsm7) {
    let n = 0;
    for (const c of texte) n += GSM7_EXTENSION.has(c) ? 2 : 1;
    return n;
  }
  // `.length` compte déjà en unités UTF-16, ce qui est exactement la façon
  // dont un SMS UCS-2 est facturé.
  return texte.length;
}

/**
 * Nombre de segments facturés pour ce texte.
 *
 * C'est cette valeur, multipliée par le prix unitaire, qui apparaît dans le
 * suivi budgétaire de l'établissement. Se tromper ici, c'est présenter à
 * l'économe un budget qui ne correspond pas à sa facture.
 */
export function segmentsSms(texte: string): number {
  if (texte.length === 0) return 1;

  const gsm7 = estGsm7(texte);
  const longueur = longueurFacturee(texte, gsm7);

  const seuilSimple = gsm7 ? 160 : 70;
  const seuilMulti = gsm7 ? 153 : 67;

  if (longueur <= seuilSimple) return 1;
  return Math.ceil(longueur / seuilMulti);
}

/**
 * Retire les accents qui font basculer un texte en UCS-2, sans toucher à ceux
 * que GSM-7 accepte.
 *
 * « Contrôle » devient « Controle » — mais « élève » reste « élève », ses
 * accents étant dans l'alphabet. C'est le seul moyen de garder un message
 * lisible ET facturé une fois : tout translittérer donnerait « eleve », tout
 * garder coûterait le double.
 */
export function alignerSurGsm7(texte: string): string {
  let sortie = "";
  for (const c of texte) {
    if (GSM7_BASE.has(c) || GSM7_EXTENSION.has(c)) {
      sortie += c;
      continue;
    }
    // Décomposition Unicode : « ô » devient « o » + accent circonflexe, dont on
    // ne garde que la lettre de base.
    const sansAccent = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    sortie += GSM7_BASE.has(sansAccent) ? sansAccent : sansAccent || "?";
  }
  return sortie;
}
