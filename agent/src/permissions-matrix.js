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
 *
 * LA DIRECTION N'EST PLUS UNE LISTE — ET C'EST VOLONTAIRE
 * -------------------------------------------------------
 * Elle l'était : 35 noms recopiés de 0009. Deux défauts en découlaient.
 *
 * D'abord elle était FAUSSE. La décision du propriétaire du 2026-11-10, portée
 * en base par `db/migrations/0041_direction_permissions_metier.sql`, donne à la
 * DIRECTION tous les droits MÉTIER : 75 sur 78. Le pré-filtre en refusait donc
 * 40 que le backend aurait accordés — un refus prématuré, avec un message net
 * et parfaitement injustifié.
 *
 * Ensuite, et c'est le plus durable : une liste recopiée se périme au module
 * suivant. Le besoin exprimé est l'inverse — « éviter que chaque nouveau module
 * oublie le rôle DIRECTION ». La DIRECTION est donc DÉRIVÉE : tout le
 * vocabulaire, moins les trois droits réservés. Ajouter une permission métier à
 * n'importe quel rôle la lui accorde automatiquement, ici comme en base, où la
 * migration applique exactement la même règle.
 */

/**
 * Les trois droits réservés au SUPER_ADMIN. Mêmes que ceux de la migration 0041.
 *
 *   permission:gerer      modifier la matrice, donc s'attribuer tout droit.
 *   systeme:administrer   administration technique, dont l'appairage WhatsApp.
 *   sauvegarde:executer   sauvegardes et restaurations de la base.
 *
 * `utilisateur:modifier` n'en fait PAS partie, contrairement à ce qu'on a cru :
 * l'audit du code montre qu'il ne garde que le dossier administratif d'un
 * enseignant, sa photo et la lecture de son document. Le changement de rôle,
 * lui, passe par `utilisateur:creer`, borné à ENSEIGNANT, et la DIRECTION le
 * détenait déjà. Le détail est dans l'en-tête de la migration 0041.
 */
export const RESERVES_SUPER_ADMIN = Object.freeze([
  "permission:gerer",
  "systeme:administrer",
  "sauvegarde:executer",
]);

/**
 * Droits d'administration MÉTIER qu'aucun autre rôle ne porte.
 *
 * Sans eux, l'union des listes ci-dessous ne faisait que 72 actions sur les 78
 * du catalogue (`web/src/server/guard/permissions.ts`) : SUPER_ADMIN lui-même
 * était incomplet dans ce reflet.
 */
const ADMINISTRATION_METIER = ["notification:configurer", "parametre:modifier", "utilisateur:modifier"];

const AUTRES_DIRECTION_HISTORIQUE = [
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

/** role -> Set(action). SUPER_ADMIN détient tout ; DIRECTION, tout le métier. */
export const MATRICE = {
  CENSEUR: new Set(CENSEUR),
  SURVEILLANT: new Set(SURVEILLANT),
  SECRETARIAT: new Set(SECRETARIAT),
  COMPTABLE: new Set(COMPTABLE),
  ENSEIGNANT: new Set(ENSEIGNANT),
  PARENT: new Set(PARENT),
  ELEVE: new Set(ELEVE),
};

/**
 * Le vocabulaire complet : les rôles, l'administration métier, les réservés, et
 * les droits que seule la DIRECTION portait dans 0009 (`eleve:exclure`,
 * `decision:prononcer`…). Sans ce dernier apport, dériver la DIRECTION de
 * l'union la priverait de ce qu'elle avait déjà.
 */
const TOUT = new Set([
  ...Object.values(MATRICE).flatMap((s) => [...s]),
  ...AUTRES_DIRECTION_HISTORIQUE,
  ...ADMINISTRATION_METIER,
  ...RESERVES_SUPER_ADMIN,
]);

MATRICE.SUPER_ADMIN = new Set(TOUT);
// Dérivée, et non recopiée : c'est la règle même de la migration 0041.
MATRICE.DIRECTION = new Set([...TOUT].filter((a) => !RESERVES_SUPER_ADMIN.includes(a)));

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
