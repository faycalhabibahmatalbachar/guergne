/**
 * Résolution d'un numéro autorisé vers un VRAI compte de la plateforme.
 *
 * POURQUOI CETTE ÉTAPE EXISTE
 * ----------------------------
 * Figurer sur la liste blanche ne donne aucun droit. Un numéro n'est qu'un
 * moyen de joindre l'agent ; ce qui décide de ce qu'il peut faire, c'est le
 * compte guergné derrière lui, son rôle réel et son état réel. Lier un numéro
 * à un compte inventé, ou lui prêter un rôle qu'il n'a pas, reviendrait à
 * créer une porte dérobée dans le RBAC de l'établissement.
 *
 * Ce module ne consulte rien : il reçoit les candidats lus dans la source
 * faisant autorité et tranche. Il est donc testable sur les cas qui comptent,
 * et surtout il ne peut rien fabriquer — il n'a aucun moyen d'inventer un
 * identifiant, puisqu'il ne peut que choisir parmi ce qu'on lui donne.
 *
 * AU MOINDRE DOUTE, ON NE LIE PAS. Une liaison erronée donne à quelqu'un les
 * droits d'un autre sur les dossiers de 549 élèves ; une liaison manquante ne
 * coûte qu'un message d'erreur.
 */
import { normaliserNumero } from "./identity-store.js";

/**
 * Rôles autorisés à PILOTER l'agent.
 *
 * `PARENT` et `ELEVE` en sont volontairement absents : l'agent WhatsApp est un
 * outil de supervision destiné aux personnels. Ouvrir le canal aux familles
 * est une décision d'établissement, pas un réglage technique — et elle
 * supposerait d'abord un périmètre « propres enfants » éprouvé.
 */
export const ROLES_PILOTES = [
  "SUPER_ADMIN",
  "DIRECTION",
  "CENSEUR",
  "SURVEILLANT",
  "SECRETARIAT",
  "COMPTABLE",
  "ENSEIGNANT",
];

const INDICATIF_TCHAD = "235";

/**
 * Forme canonique d'un numéro : chiffres seuls, indicatif pays compris.
 *
 * Les numéros se transmettent de mille façons — « +235 68 66 37 37 »,
 * « 0023568663737 », ou simplement « 68663737 » entre gens du pays. WhatsApp,
 * lui, ne connaît qu'une forme. Comparer sans canoniser ferait passer pour
 * inconnu un numéro pourtant autorisé.
 *
 * @param {string} valeur
 * @param {string} indicatif indicatif pays par défaut, sans le `+`
 */
export function canoniser(valeur, indicatif = INDICATIF_TCHAD) {
  let n = normaliserNumero(valeur);
  if (!n) return "";
  // Préfixe international « 00 » : on le remplace par rien, l'indicatif suit.
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith(indicatif)) return n;
  // Numéro national : on ajoute l'indicatif. On ne le fait QUE si la longueur
  // correspond à un numéro local, pour ne pas maquiller une saisie fautive.
  if (n.length === 8) return indicatif + n;
  return n;
}

/** Numéro plausible après canonisation ? */
export function numeroPlausible(numero, indicatif = INDICATIF_TCHAD) {
  const n = canoniser(numero, indicatif);
  return n.startsWith(indicatif) && n.length === indicatif.length + 8;
}

/**
 * Tranche sur un numéro, au vu des comptes trouvés dans la source autoritaire.
 *
 * @param {object} o
 * @param {string} o.numero
 * @param {Array<{id:string, nom?:string, prenom?:string, role:string, actif:boolean, source?:string}>} o.candidats
 *   TOUS les comptes dont le téléphone correspond, toutes tables confondues.
 * @param {string[]} [o.rolesAutorises]
 * @returns {{statut:string, compte?:object, candidats?:object[], raison:string}}
 */
export function resoudreCompteAutorise({ numero, candidats = [], rolesAutorises = ROLES_PILOTES }) {
  const n = canoniser(numero);

  if (!numeroPlausible(n)) {
    return { statut: "numero_invalide", raison: `numero non conforme apres normalisation (${n.length} chiffres)` };
  }

  // Toutes les lignes qui portent le numéro ne sont pas des COMPTES. Une fiche
  // de tuteur est un contact, pas une identité connectable : un même numéro
  // apparaît légitimement une fois comme compte et plusieurs fois comme
  // contact, pour chacun de ses enfants. Les confondre ferait passer pour
  // ambiguë la situation la plus ordinaire qui soit.
  const comptes = candidats.filter((c) => (c.source ?? "utilisateurs") === "utilisateurs");
  const contacts = candidats.filter((c) => (c.source ?? "utilisateurs") !== "utilisateurs");

  if (comptes.length === 0) {
    // On ne crée jamais le compte manquant : l'agent n'est pas une source
    // d'identités, il en consomme.
    if (contacts.length > 0) {
      return {
        statut: "contact_sans_compte",
        contacts,
        raison: `numero connu comme contact (${contacts.length} fiche(s) tuteur) mais aucun compte connectable`,
      };
    }
    return { statut: "inconnu", raison: "aucun compte de la plateforme ne porte ce numero" };
  }

  if (comptes.length > 1) {
    // Deux comptes pour un numéro, c'est une donnée à corriger dans la
    // plateforme, pas un choix à faire ici.
    return {
      statut: "ambigu",
      candidats: comptes,
      raison: `${comptes.length} comptes portent ce numero (${comptes.map((c) => c.role).join(", ")})`,
    };
  }

  const compte = { ...comptes[0], contacts: contacts.length };

  if (compte.actif === false) {
    return { statut: "inactif", compte, raison: `compte ${compte.role} desactive sur la plateforme` };
  }

  if (!rolesAutorises.includes(compte.role)) {
    // Ni élévation locale, ni contournement : si le rôle réel ne pilote pas
    // l'agent, la liaison n'a pas lieu d'être.
    return { statut: "role_refuse", compte, raison: `role ${compte.role} non autorise a piloter l'agent` };
  }

  return { statut: "ok", compte, raison: `compte ${compte.role} actif et autorise` };
}

/**
 * Résolution d'un numéro de PERSONNEL — la seule qui soit sûre.
 *
 * POURQUOI ON NE CHERCHE PAS DANS LA TABLE DES COMPTES
 * -----------------------------------------------------
 * Chercher le numéro directement parmi les comptes paraît naturel, et c'est un
 * piège. Constaté sur la plateforme réelle : le numéro d'un DIRECTEUR de
 * l'annuaire est porté, dans la table des comptes, par un compte PARENT
 * appartenant à **quelqu'un d'autre**. Une résolution par téléphone aurait donc
 * fait parler le directeur au nom d'un parent — ou l'inverse.
 *
 * La chaîne faisant autorité est donc :
 *
 *     numero -> fiche de l'annuaire du personnel -> compte lié -> rôle
 *
 * Le rôle vient du compte que l'établissement a LUI-MÊME rattaché à la fiche,
 * jamais d'une correspondance de numéro. Les correspondances trouvées dans la
 * table des comptes ne servent qu'à signaler la collision.
 *
 * @param {object} o
 * @param {string} o.numero
 * @param {Array<{id:string, nom:string, prenom:string, fonction?:string, actif:boolean,
 *                compte:{id:string, role:string, actif:boolean}|null, source?:string}>} o.personnels
 * @param {Array<object>} [o.collisions] comptes portant ce numéro sans être le compte lié
 */
export function resoudreViaPersonnel({ numero, personnels = [], collisions = [], rolesAutorises = ROLES_PILOTES }) {
  const n = canoniser(numero);
  const avec = (r) => ({ ...r, collisions });

  if (!numeroPlausible(n)) {
    return avec({ statut: "numero_invalide", raison: `numero non conforme apres normalisation (${n.length} chiffres)` });
  }

  if (personnels.length === 0) {
    return avec({ statut: "inconnu", raison: "aucune fiche de personnel ne porte ce numero" });
  }

  if (personnels.length > 1) {
    return avec({
      statut: "ambigu",
      candidats: personnels,
      raison: `${personnels.length} fiches de personnel portent ce numero`,
    });
  }

  const fiche = personnels[0];
  const qui = `${fiche.prenom ?? ""} ${fiche.nom ?? ""}`.trim();

  if (fiche.actif === false) {
    return avec({ statut: "inactif", fiche, raison: `fiche de ${qui} desactivee dans l'annuaire` });
  }

  if (!fiche.compte) {
    // L'agent ne crée pas de compte : c'est un acte d'administration de la
    // plateforme, avec mot de passe et traçabilité propres.
    return avec({
      statut: "personnel_sans_compte",
      fiche,
      raison: `${qui} (${fiche.fonction ?? "fonction non precisee"}) n'a pas de compte d'acces au portail`,
    });
  }

  if (fiche.compte.actif === false) {
    return avec({ statut: "inactif", fiche, compte: fiche.compte, raison: `compte de ${qui} desactive` });
  }

  if (!rolesAutorises.includes(fiche.compte.role)) {
    return avec({
      statut: "role_refuse",
      fiche,
      compte: fiche.compte,
      raison: `role ${fiche.compte.role} non autorise a piloter l'agent`,
    });
  }

  return avec({
    statut: "ok",
    fiche,
    compte: { ...fiche.compte, nom: fiche.nom, prenom: fiche.prenom },
    raison: `${qui} — compte ${fiche.compte.role} actif, rattache par l'etablissement`,
  });
}

/**
 * Qui a le droit d'autoriser une liaison ?
 *
 * `lier()` exige un auteur, et cet auteur doit être une personne réelle de la
 * plateforme — pas la chaîne « system », qui ne répond de rien devant
 * personne. Seuls les comptes capables de créer des utilisateurs peuvent
 * décider qu'un numéro parlera au nom d'un compte.
 */
export const ROLES_AUTORISANTS = ["SUPER_ADMIN", "DIRECTION"];

export function verifierAuteur(compte, roles = ROLES_AUTORISANTS) {
  if (!compte?.id) return { ok: false, raison: "auteur introuvable dans la plateforme" };
  if (compte.actif === false) return { ok: false, raison: "compte auteur desactive" };
  if (!roles.includes(compte.role)) return { ok: false, raison: `role ${compte.role} ne peut pas autoriser une liaison` };
  return { ok: true };
}
