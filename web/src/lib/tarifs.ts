/**
 * Tarifs, définis ici et nulle part ailleurs.
 *
 * Ils sont lus par le serveur — pour valoriser une notification expédiée — et
 * par l'interface — pour annoncer à l'économe ce que va coûter un clic. Les
 * deux doivent donner le même chiffre, sans quoi le bouton promet un montant
 * et le journal en enregistre un autre.
 */

/**
 * Coût d'un segment de SMS, en francs CFA.
 *
 * **50 F, et non 25.** C'est le prix pratiqué par 235SMS
 * (`apps/api/src/services/quota.ts`, `PRIX_SMS_FCFA = 50`), donc celui que
 * l'établissement paie réellement. Le portail affichait 25 F : tout son suivi
 * budgétaire était faux de moitié, ce qui est pire qu'absent — un économe qui
 * se fie à un chiffre à moitié faux engage des dépenses sur cette base.
 *
 * À corriger ici, et ici seulement, si 235SMS change son tarif.
 */
export const COUT_SMS_FCFA = 50;

/**
 * Longueur d'un SMS, en caractères.
 *
 * Un message latin fait 160 caractères ; au-delà il est découpé et **facturé
 * plusieurs fois**. Un seul accent hors de l'alphabet GSM-7 fait basculer tout
 * le message en UCS-2, soit 70 caractères par segment — d'où des messages
 * rédigés sans accents dans les gabarits d'expédition.
 */
export const CARACTERES_PAR_SMS = 160;
