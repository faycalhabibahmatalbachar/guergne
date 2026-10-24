/** Vue explicative d'un audit : aucune donnée brute secrète n'est transmise au navigateur. */
export type ValeurLisible = { label: string; valeur: string; masquee: boolean };
export type ChangementLisible = {
  champ: string;
  avant: string;
  apres: string;
  nature: "modification" | "information";
};
export type DetailLisible = {
  changements: ChangementLisible[];
  lignesAvant: ValeurLisible[];
  lignesApres: ValeurLisible[];
  typePreuve: "comparaison" | "resultat" | "absente";
};

const NOMS: Record<string, string> = {
  nom: "Nom", prenom: "Prénom", classe: "Classe", libelle: "Libellé",
  titre: "Titre", objet: "Objet", statut: "Statut", type: "Type", motif: "Motif",
  actif: "Compte actif", telephone: "Téléphone", urgenceTelephone: "Téléphone d'urgence",
  smsEnvoye: "SMS envoyé", validiteJours: "Validité (jours)", coutSmsFcfa: "Coût SMS (FCFA)",
  coutMaxFcfa: "Plafond SMS (FCFA)", seuilFcfa: "Seuil (FCFA)",
  envoyees: "Notifications envoyées", echecs: "Échecs", echouees: "Envois échoués",
  traitees: "Notifications traitées", ignorees: "Notifications ignorées",
  jetonsNettoyes: "Jetons nettoyés", sans_note: "Bulletins sans note",
  bulletins: "Bulletins", periode: "Période", destinataires: "Destinataires",
  classeId: "Référence de classe", eleveId: "Référence de l'élève",
  matiereId: "Référence de matière", anneeId: "Référence d'année", id: "Référence",
  niveauId: "Référence de niveau", serieId: "Référence de série",
  capaciteMax: "Capacité", canal: "Canal", eleves: "Élèves concernés",
  inscrits: "Élèves inscrits", couleur: "Couleur", email: "Adresse e-mail",
  dateDebut: "Date de début", dateFin: "Date de fin", date: "Date",
  nbEnfants: "Nombre d'enfants", invites: "Invitations envoyées",
  etablissement: "Établissement", peutNotifier: "Notifications autorisées",
  commentaire: "Commentaire", total: "Total", quantite: "Quantité", portee: "Portée",
  nbCreneaux: "Créneaux", salleId: "Référence de salle", matricule: "Matricule",
};

const SENSIBLE = /password|passe|secret|token|jeton|code|activation|cle|api.?key|auth|cookie|session|hash|signature|credential|bearer|otp|pin|access.?key|refresh|authorization/i;
const PROTEGE = /email|telephone|phone|adresse|contact|naissance|identite|nom|prenom|matricule|photo/i;
const ID = /(?:Id|_id|^id$|^uuid$)/i;

export function libelleChamp(key: string): string {
  return NOMS[key] ?? key.replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ").replace(/^\w/, v => v.toUpperCase()).slice(0, 72);
}

/** Aucun objet ni texte arbitraire ne doit être injecté dans la vue de détail. */
export function valeurLisible(key: string, valeur: unknown): string {
  if (SENSIBLE.test(key)) return "Information protégée";
  if (valeur === null || valeur === undefined) return "Non renseigné";
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur.toLocaleString("fr-FR") : "Non renseigné";
  if (Array.isArray(valeur)) return valeur.length + " élément(s)";
  if (typeof valeur === "object") return "Informations détaillées non exposées";
  if (typeof valeur !== "string") return "Non disponible";
  if (ID.test(key) && /^[0-9a-f-]{16,}$/i.test(valeur)) return "Référence ···" + valeur.slice(-6);
  if (PROTEGE.test(key)) {
    if (key.toLowerCase().includes("telephone") || key.toLowerCase().includes("phone")) {
      return "Numéro ···" + valeur.replace(/\D/g, "").slice(-3);
    }
    if (key.toLowerCase().includes("email")) {
      const [nom, domaine] = valeur.split("@");
      return nom && domaine ? nom.slice(0, 2) + "···@" + domaine : "Adresse protégée";
    }
    if (/matricule/i.test(key)) return "Référence ···" + valeur.slice(-4);
    // Noms déjà connus dans l'interface autorisée, mais jamais les autres PII structurées.
    if (!/^(nom|prenom)$/i.test(key)) return "Information personnelle protégée";
  }
  if (/Bearer\s+\S+|(?:sk-|re_)[A-Za-z0-9]{12,}/i.test(valeur)) return "Information protégée";
  return valeur.length > 110 ? valeur.slice(0, 107) + "…" : valeur;
}

function objet(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : {};
}

export function rendreChangements(avant: unknown, apres: unknown): DetailLisible {
  const a = objet(avant);
  const b = objet(apres);
  const typePreuve = Object.keys(a).length ? "comparaison" : Object.keys(b).length ? "resultat" : "absente";
  const champs = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => x.localeCompare(y, "fr")).slice(0, 40);
  const changements: ChangementLisible[] = [];
  const lignesAvant: ValeurLisible[] = [];
  const lignesApres: ValeurLisible[] = [];
  for (const key of champs) {
    const label = libelleChamp(key);
    const secret = SENSIBLE.test(key);
    const av = Object.hasOwn(a, key) ? valeurLisible(key, a[key]) : "Non enregistré";
    const ap = Object.hasOwn(b, key) ? valeurLisible(key, b[key]) : "Non enregistré";
    if (Object.hasOwn(a, key)) lignesAvant.push({ label, valeur: av, masquee: secret });
    if (Object.hasOwn(b, key)) lignesApres.push({ label, valeur: ap, masquee: secret });
    if (!Object.hasOwn(a, key) && !Object.hasOwn(b, key)) continue;
    if (Object.hasOwn(a, key) && Object.hasOwn(b, key) && JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
    changements.push({
      champ: label,
      avant: av,
      apres: ap,
      nature: Object.hasOwn(a, key) && Object.hasOwn(b, key) ? "modification" : "information",
    });
  }
  return { changements, lignesAvant, lignesApres, typePreuve };
}

const ACTIONS: Record<string, string> = {
  "connexion.succes": "Connexion réussie",
  "connexion.verrouillage": "Compte temporairement verrouillé",
  "connexion.admin.role_refuse": "Accès administratif refusé",
  deconnexion: "Déconnexion",
  "mot_de_passe.change": "Mot de passe modifié",
  "mot_de_passe.reinitialisation_demandee": "Réinitialisation demandée",
  "mot_de_passe.reinitialise_par_email": "Mot de passe réinitialisé par e-mail",
  "tuteur.invite": "Invitation d'un parent",
  "tuteur.compte_cree": "Compte parent créé",
  "tuteur.acces_revoque": "Accès parent révoqué",
  "tuteur.coordonnees_modifiees": "Coordonnées du parent modifiées",
  "tuteurs.invites_en_masse": "Invitations groupées aux parents",
  "eleve.inscrit": "Élève inscrit",
  "eleve.classe_changee": "Élève déplacé de classe",
  "eleve.photo_definie": "Photo d'élève enregistrée",
  "eleve.dossier_modifie": "Dossier élève modifié",
  "eleve.suspendu_impaye": "Suspension pour impayé",
  "classe.creee": "Classe créée",
  "periode.modifiee": "Période scolaire modifiée",
  "evaluation.verrouillee": "Évaluation verrouillée",
  "bulletins.generes": "Bulletins générés",
  "bulletin.reglage_blocage": "Règles de blocage des bulletins modifiées",
  "notification.envoyee_depuis_fiche": "Notification envoyée depuis un dossier",
  "notification.envoyee_depuis_classe": "Notification envoyée à une classe",
  "notifications.traitees": "Notifications traitées",
  "message.envoye": "Message envoyé",
  "sanction.prononcee": "Sanction prononcée",
  "sanction.executee": "Sanction appliquée",
  "edt.cours_pose": "Cours planifié",
  "edt.publie": "Emploi du temps publié",
  "dossier.valide": "Dossier validé",
  "dossier.incomplet": "Dossier marqué incomplet",
};

export function libelleAction(action: string): string {
  return ACTIONS[action] ?? action.replace(/[._-]+/g, " ")
    .replace(/^\w/, c => c.toUpperCase()).slice(0, 100);
}

export function libelleFamille(famille: string): string {
  const noms: Record<string,string> = {
    tuteur: "Parents et responsables", tuteurs: "Parents et responsables",
    connexion: "Connexions", deconnexion: "Connexions",
    eleve: "Dossiers élèves", classe: "Classes",
    notification: "Notifications", notifications: "Notifications",
    message: "Messagerie", bulletin: "Bulletins", bulletins: "Bulletins",
    evaluation: "Évaluations", periode: "Périodes scolaires",
    mot_de_passe: "Sécurité des comptes", edt: "Emplois du temps",
    sanction: "Discipline", finance: "Finances",
  };
  return noms[famille] ?? libelleChamp(famille);
}

export function appareilLisible(agent: string | null): string {
  if (!agent) return "Appareil non enregistré";
  const navigateur = /Edg\//.test(agent) ? "Microsoft Edge" :
    /Chrome\//.test(agent) ? "Google Chrome" :
    /Firefox\//.test(agent) ? "Firefox" :
    /Safari\//.test(agent) ? "Safari" : /bot|curl|postman/i.test(agent) ? "Outil automatisé" : "Navigateur non identifié";
  const systeme = /Android/i.test(agent) ? "Android" : /iPhone|iPad/i.test(agent) ? "iOS" :
    /Windows/i.test(agent) ? "Windows" : /Macintosh/i.test(agent) ? "macOS" :
    /Linux/i.test(agent) ? "Linux" : "Système non identifié";
  return navigateur + " · " + systeme;
}

export function formatDateAudit(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "Date indisponible" :
    new Intl.DateTimeFormat("fr-FR", { timeZone:"Africa/Ndjamena", dateStyle:"medium", timeStyle:"medium" }).format(d);
}
