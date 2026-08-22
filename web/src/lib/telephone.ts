/**
 * Numéros de téléphone tchadiens.
 *
 * Règle unique du projet, définie ICI et nulle part ailleurs. Elle est
 * dupliquée une seule fois, dans `mobile/lib/outils/telephone.dart`, faute de
 * pouvoir partager du code entre TypeScript et Dart — les deux fichiers se
 * citent mutuellement pour qu'une modification de l'un rappelle l'autre.
 *
 * Le plan de numérotation tchadien : indicatif +235, huit chiffres, dont le
 * premier identifie l'opérateur.
 */

/**
 * Premiers chiffres acceptés.
 *
 * Élargir cette liste est un changement d'un caractère ; la restreindre
 * bloquerait des parents dont le numéro est parfaitement valide. En cas de
 * doute sur un préfixe, mieux vaut l'accepter : le SMS partira, ou il ne
 * partira pas, mais le parent ne sera pas arrêté à la saisie.
 */
export const PREFIXES_TCHAD = ["3", "6", "8", "9"] as const;

/** Longueur d'un numéro national, sans l'indicatif. */
export const LONGUEUR_NATIONALE = 8;

const MOTIF = new RegExp(`^[${PREFIXES_TCHAD.join("")}]\\d{${LONGUEUR_NATIONALE - 1}}$`);

/** Ne conserve que les chiffres. */
export function chiffresSeuls(saisie: string): string {
  return saisie.replace(/\D/g, "");
}

/**
 * Extrait la partie nationale d'une saisie, quelle qu'en soit la forme.
 *
 * Le secrétariat saisit les numéros de vingt façons : « 66 00 00 00 »,
 * « +235 66000000 », « 0023566000000 », « 235-66-00-00-00 ». Toutes doivent
 * mener au même numéro, sans quoi le même parent existe en double dans le
 * fichier et ne reçoit jamais ses alertes.
 */
export function partieNationale(saisie: string): string {
  let chiffres = chiffresSeuls(saisie);

  // Préfixe international, sous ses trois écritures courantes.
  if (chiffres.startsWith("00235")) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith("235")) chiffres = chiffres.slice(3);

  // Un zéro de tête est une habitude française sans effet au Tchad.
  chiffres = chiffres.replace(/^0+/, "");

  return chiffres;
}

/**
 * Vrai si la saisie correspond à un numéro tchadien complet et plausible.
 *
 * Ne vaut que pour le Tchad : l'application des parents ne propose pas de
 * sélecteur de pays, et le plan de numérotation d'un autre pays n'est pas
 * vérifiable ici. Un numéro étranger saisi au secrétariat passe par le
 * portail, pas par cet écran.
 */
export function telephoneValide(saisie: string): boolean {
  return MOTIF.test(partieNationale(saisie));
}

/**
 * Message expliquant POURQUOI le numéro est refusé.
 *
 * « Numéro invalide » n'aide personne. Dire qu'il manque deux chiffres, ou que
 * le numéro ne peut pas commencer par 5, permet de corriger sans appeler
 * l'école.
 */
export function motifRefus(saisie: string): string | null {
  const national = partieNationale(saisie);

  if (national.length === 0) return "Entrez votre numéro de téléphone.";

  if (national.length < LONGUEUR_NATIONALE) {
    const manquants = LONGUEUR_NATIONALE - national.length;
    return `Il manque ${manquants} chiffre${manquants > 1 ? "s" : ""}.`;
  }

  if (national.length > LONGUEUR_NATIONALE) {
    return `Un numéro tchadien compte ${LONGUEUR_NATIONALE} chiffres.`;
  }

  if (!PREFIXES_TCHAD.includes(national[0] as (typeof PREFIXES_TCHAD)[number])) {
    return `Un numéro tchadien commence par ${PREFIXES_TCHAD.join(", ")}.`;
  }

  return null;
}

/**
 * Numéro étranger explicitement indiqué.
 *
 * Un tuteur peut vivre hors du Tchad — un parent expatrié, un oncle en
 * France. S'il écrit son indicatif avec un « + », on le respecte : forcer
 * +235 devant produirait un numéro inexistant, et l'alerte d'absence
 * n'arriverait jamais.
 */
function etrangerExplicite(saisie: string): string | null {
  const nettoye = saisie.trim();
  if (!nettoye.startsWith("+") && !nettoye.startsWith("00")) return null;

  const chiffres = chiffresSeuls(nettoye).replace(/^00/, "");
  if (chiffres.startsWith("235")) return null;

  return chiffres.length >= 8 ? `+${chiffres}` : null;
}

/**
 * Forme internationale, seule forme stockée en base.
 *
 * Stocker « 66000000 » ici et « +235 66 00 00 00 » là rendrait impossible de
 * retrouver un parent par son numéro — et deux fiches finiraient par exister
 * pour la même personne.
 */
export function formatInternational(saisie: string): string {
  return etrangerExplicite(saisie) ?? `+235${partieNationale(saisie)}`;
}

/** Forme lisible : « 66 00 00 00 ». */
export function formatLisible(saisie: string): string {
  const national = partieNationale(saisie);
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
