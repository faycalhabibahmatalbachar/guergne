/**
 * Reflet de la matrice de permissions de guergne (db/migrations/0009_seed_referentiel.sql).
 *
 * Ce n'est PAS l'autorité : le `guard` de guergne reste seul juge à l'exécution
 * (AUTH → RÔLE → PÉRIMÈTRE). Cette copie sert uniquement de pré-filtre côté agent,
 * pour refuser tôt et avec un message clair, sans aller-retour inutile. Elle est
 * chargée comme données (ici en dur pour le pré-filtre ; en production, rechargée
 * depuis la table `permissions`), jamais injectée dans le prompt du modèle.
 *
 * La portée (PROPRES_CLASSES / PROPRES_ENFANTS) n'est PAS évaluée ici : elle dépend
 * de rattachements que seul guergne connaît, et reste vérifiée côté backend.
 */

const DIRECTION = [
  "eleve:lire", "eleve:creer", "eleve:modifier", "eleve:suspendre", "eleve:reactiver",
  "eleve:exclure", "eleve:transferer", "classe:lire", "classe:creer", "classe:modifier",
  "note:lire", "periode:verrouiller", "periode:deverrouiller", "bulletin:lire",
  "bulletin:generer", "bulletin:publier", "conseil_classe:tenir", "conseil_classe:valider",
  "decision:prononcer", "assiduite:lire", "discipline:lire", "discipline:sanctionner",
  "conseil_discipline:convoquer", "finance:lire", "finance:exonerer", "finance:configurer",
  "annonce:publier", "message:envoyer", "convocation:emettre", "document:emettre",
  "statistique:lire", "audit:lire", "utilisateur:creer", "utilisateur:desactiver", "annee:cloturer",
];
const CENSEUR = [
  "eleve:lire", "eleve:modifier", "classe:lire", "classe:creer", "classe:modifier",
  "matiere:gerer", "coefficient:gerer", "affectation:gerer", "emploi_du_temps:gerer",
  "calendrier:gerer", "note:lire", "evaluation:lire", "periode:verrouiller", "bulletin:lire",
  "bulletin:generer", "conseil_classe:tenir", "conseil_classe:valider", "assiduite:lire",
  "discipline:lire", "annonce:publier", "message:envoyer", "document:emettre", "statistique:lire",
];
const SURVEILLANT = [
  "eleve:lire", "assiduite:lire", "assiduite:saisir", "assiduite:justifier", "retard:saisir",
  "sortie:autoriser", "discipline:lire", "discipline:signaler", "discipline:sanctionner",
  "conduite:noter", "eleve:suspendre", "message:envoyer", "convocation:emettre", "document:emettre",
];
const SECRETARIAT = [
  "eleve:lire", "eleve:creer", "eleve:modifier", "eleve:inscrire", "eleve:reinscrire",
  "eleve:transferer", "eleve:affecter", "tuteur:gerer", "piece:deposer", "import:executer",
  "classe:lire", "assiduite:lire", "assiduite:justifier", "document:emettre", "annonce:publier",
  "tuteur:inviter", "bulletin:lire",
];
const COMPTABLE = [
  "eleve:lire", "finance:lire", "finance:encaisser", "finance:configurer", "finance:relancer",
  "finance:exporter", "recu:emettre", "message:envoyer", "statistique:lire",
];
const ENSEIGNANT = [
  "eleve:lire", "evaluation:creer", "evaluation:modifier", "note:lire", "note:saisir",
  "note:modifier", "appreciation:saisir", "assiduite:saisir", "discipline:signaler",
  "devoir:publier", "ressource:publier", "seance:saisir", "bulletin:lire", "message:envoyer",
];
const PARENT = [
  "eleve:lire", "note:lire", "bulletin:lire", "bulletin:telecharger", "assiduite:lire",
  "discipline:lire", "emploi_du_temps:lire", "devoir:lire", "ressource:lire", "finance:lire",
  "annonce:lire", "message:lire", "message:envoyer",
];
const ELEVE = [
  "note:lire", "bulletin:lire", "assiduite:lire", "emploi_du_temps:lire", "devoir:lire",
  "ressource:lire", "annonce:lire",
];

/** role -> Set(action). SUPER_ADMIN détient tout (union de la matrice). */
export const MATRICE = {
  DIRECTION: new Set(DIRECTION),
  CENSEUR: new Set(CENSEUR),
  SURVEILLANT: new Set(SURVEILLANT),
  SECRETARIAT: new Set(SECRETARIAT),
  COMPTABLE: new Set(COMPTABLE),
  ENSEIGNANT: new Set(ENSEIGNANT),
  PARENT: new Set(PARENT),
  ELEVE: new Set(ELEVE),
};
MATRICE.SUPER_ADMIN = new Set(Object.values(MATRICE).flatMap((s) => [...s]));

/** Pré-filtre de permissions basé sur la matrice réelle (reflet de guergne). */
export class MatricePermissions {
  constructor(matrice = MATRICE) {
    this._m = matrice;
  }
  allows(staff, action) {
    const set = this._m[staff.role];
    return !!set && set.has(action);
  }
}
