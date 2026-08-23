/**
 * Vocabulaire des permissions.
 *
 * La liste des actions vit ici en TypeScript ET en base (table `permissions`,
 * migration 0009). Le typage attrape les fautes de frappe à la compilation ;
 * la base reste la source d'autorité à l'exécution.
 */

export const ACTIONS = [
  // Élèves et scolarité
  "eleve:lire", "eleve:creer", "eleve:modifier",
  "eleve:inscrire", "eleve:reinscrire", "eleve:affecter", "eleve:transferer",
  "eleve:suspendre", "eleve:reactiver", "eleve:exclure",
  "tuteur:gerer", "tuteur:inviter", "piece:deposer", "import:executer",

  // Structure pédagogique
  "classe:lire", "classe:creer", "classe:modifier",
  "matiere:gerer", "coefficient:gerer", "affectation:gerer",
  "emploi_du_temps:lire", "emploi_du_temps:gerer", "calendrier:gerer",

  // Évaluations et bulletins
  "evaluation:creer", "evaluation:modifier", "evaluation:lire",
  "note:lire", "note:saisir", "note:modifier",
  "appreciation:saisir", "periode:verrouiller", "periode:deverrouiller",
  "bulletin:lire", "bulletin:generer", "bulletin:publier", "bulletin:telecharger",
  "conseil_classe:tenir", "conseil_classe:valider", "decision:prononcer",

  // Vie scolaire
  "assiduite:lire", "assiduite:saisir", "assiduite:justifier",
  "retard:saisir", "sortie:autoriser",
  "discipline:lire", "discipline:signaler", "discipline:sanctionner",
  "conduite:noter", "conseil_discipline:convoquer",

  // Travail personnel
  "devoir:lire", "devoir:publier", "ressource:lire", "ressource:publier",
  "seance:saisir",

  // Finances
  "finance:lire", "finance:encaisser", "finance:configurer",
  "finance:exonerer", "finance:relancer", "finance:exporter", "recu:emettre",
  // Arbitrage entre prévenir les familles et dépenser en SMS : une décision de
  // chef d'établissement, distincte de `parametre:modifier` qui ouvre aussi
  // les années, les périodes et les coefficients.
  "notification:configurer",

  // Communication et documents
  "annonce:lire", "annonce:publier", "message:lire", "message:envoyer",
  "convocation:emettre", "document:emettre",

  // Pilotage et système
  "statistique:lire", "audit:lire", "systeme:administrer",
  "utilisateur:creer", "utilisateur:modifier", "utilisateur:desactiver",
  "permission:gerer", "parametre:modifier", "sauvegarde:executer",
  "annee:cloturer",
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Restriction de périmètre appliquée EN PLUS du contrôle de rôle.
 *
 * - `AUCUNE`          : l'action porte sur tout l'établissement.
 * - `PROPRES_CLASSES` : enseignant — uniquement les couples (classe × matière)
 *                       où il est affecté.
 * - `PROPRES_ENFANTS` : parent — uniquement les élèves dont il est tuteur.
 */
export type Portee = "AUCUNE" | "PROPRES_CLASSES" | "PROPRES_ENFANTS";

export type RoleUtilisateur =
  | "SUPER_ADMIN"
  | "DIRECTION"
  | "CENSEUR"
  | "SURVEILLANT"
  | "SECRETARIAT"
  | "COMPTABLE"
  | "ENSEIGNANT"
  | "PARENT"
  | "ELEVE";

export const LIBELLES_ROLES: Record<RoleUtilisateur, string> = {
  SUPER_ADMIN: "Super administrateur",
  DIRECTION: "Direction",
  CENSEUR: "Censeur",
  SURVEILLANT: "Surveillant général",
  SECRETARIAT: "Secrétariat",
  COMPTABLE: "Comptable",
  ENSEIGNANT: "Enseignant",
  PARENT: "Parent",
  ELEVE: "Élève",
};
