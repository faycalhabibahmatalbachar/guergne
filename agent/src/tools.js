/**
 * Registre des outils métier. Un outil = une opération réelle de guergne.
 * Les règles de validation reprennent EXACTEMENT celles du code guergne
 * (web/src/app/(main)/dashboard/assiduite/actions.ts et server/domain/vie-scolaire.ts) :
 *   nbHeures ∈ [0.5, 12] ; dureeMinutes retard ∈ [0, 480] ; justification ≤ 200 ;
 *   motif ≥ 3 caractères pour justifier/supprimer.
 */
import { READ, WRITE, SENSITIVE } from "./guard.js";
import { inviteContrat } from "./plan.js";

const required = (v) => v !== undefined && v !== null && v !== "";
const noErrs = () => ({});

function validateAppel(p) {
  const e = {};
  if (!required(p.periodeId)) e.periodeId = "Période requise.";
  if (!required(p.dateAbsence)) e.dateAbsence = "Date requise.";
  const h = p.nbHeures ?? 1;
  if (!(h >= 0.5 && h <= 12)) e.nbHeures = "nbHeures doit être entre 0.5 et 12.";
  if (!Array.isArray(p.absents)) e.absents = "Liste d'absents requise.";
  return e;
}

function validateRetard(p) {
  const e = {};
  if (!required(p.inscriptionId)) e.inscriptionId = "Élève requis.";
  if (!required(p.periodeId)) e.periodeId = "Période requise.";
  if (!required(p.dateRetard)) e.dateRetard = "Date requise.";
  if (p.dureeMinutes != null && !(p.dureeMinutes >= 0 && p.dureeMinutes <= 480)) {
    e.dureeMinutes = "Durée entre 0 et 480 minutes.";
  }
  return e;
}

function validateJustifier(p) {
  const e = {};
  if (!Array.isArray(p.absenceIds) || p.absenceIds.length === 0) e.absenceIds = "Aucune absence sélectionnée.";
  else if (p.absenceIds.length > 200) e.absenceIds = "200 absences au maximum.";
  if (!["JUSTIFIEE", "NON_JUSTIFIEE"].includes(p.statut)) e.statut = "Statut invalide.";
  if (p.statut === "JUSTIFIEE" && (!p.motif || p.motif.trim().length < 3)) e.motif = "Motif requis (≥3 caractères).";
  return e;
}

function validateSupprimer(p) {
  const e = {};
  if (!required(p.absenceId)) e.absenceId = "Absence requise.";
  if (!p.motif || p.motif.trim().length < 3) e.motif = "Motif requis (≥3 caractères).";
  return e;
}

/**
 * Rendu des lectures pour WhatsApp.
 *
 * POURQUOI ICI
 * ------------
 * Une consultation qui répond « ✅ Opération effectuée. » ne sert à rien :
 * l'agent est allé chercher la donnée, puis l'a jetée. La mise en forme vit
 * donc dans le registre, à côté de l'outil — c'est le seul endroit qui
 * connaisse la forme des lignes que `action` renvoie.
 *
 * CONTRAINTE DU CANAL
 * -------------------
 * Un message WhatsApp se lit sur un téléphone. Déverser les cent lignes que
 * `listerAbsences` renvoie par défaut le rendrait illisible : on borne
 * l'affichage et on annonce le reste, sans jamais prétendre que le reste
 * n'existe pas.
 */
const MAX_LIGNES = 10;

const STATUT_LISIBLE = { JUSTIFIEE: "justifiée", NON_JUSTIFIEE: "non justifiée" };

const nomComplet = (l) => `${l.prenom ?? ""} ${l.nom ?? ""}`.trim() || "élève inconnu";
/** Les dates arrivent en ISO ; seule la partie calendaire intéresse le lecteur. */
const jour = (d) => String(d ?? "").slice(0, 10) || "date inconnue";

function listeRendue(lignes, titre, ligne) {
  if (!Array.isArray(lignes)) return null;
  if (lignes.length === 0) return `${titre} : aucun résultat.`;
  const montrees = lignes.slice(0, MAX_LIGNES);
  const reste = lignes.length - montrees.length;
  return [
    `${titre} — ${lignes.length} résultat${lignes.length > 1 ? "s" : ""} :`,
    ...montrees.map((l) => `• ${ligne(l)}`),
    reste > 0 ? `… et ${reste} de plus.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Outils du module Assiduité / Vie scolaire.
 * `action` = nom de la fonction guergne appelée à l'exécution.
 * `requiresConfirmation` force une confirmation même pour une écriture ordinaire
 * (cas des modifications en lot).
 */
/**
 * PARAMÈTRES ET NLU
 * -----------------
 * Chaque outil déclare les paramètres que l'API agent traite réellement
 * (`web/src/app/api/agent/[action]/route.ts`). Ils sont ici pour une raison
 * précise et mesurée : le catalogue transmis au modèle ne portait que le nom de
 * l'outil et sa sensibilité. Le modèle ne pouvait donc pas remplir un paramètre
 * dont on ne lui avait jamais parlé — « les 3 dernières absences » produisait
 * `params:{}`, et la lecture renvoyait les 100 lignes par défaut.
 *
 * N'y figurent QUE des paramètres que la route honore. En annoncer d'autres
 * ferait inventer au modèle des filtres silencieusement ignorés, ce qui est
 * pire qu'un filtre absent : la réponse paraîtrait filtrée sans l'être.
 */
export const ASSIDUITE_TOOLS = [
  {
    name: "assiduite.consulter_absences",
    description: "lister les absences enregistrees (par classe, periode, statut ou dates)",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "listerAbsences",
    parametres: {
      periodeId: "facultatif, identifiant de periode scolaire (UUID) ; par defaut toutes les periodes",
      classeId: "facultatif, identifiant de classe (UUID) ; par defaut toutes les classes",
      statut: "facultatif, JUSTIFIEE ou NON_JUSTIFIEE ; par defaut les deux",
      depuis: "facultatif, date de debut incluse (AAAA-MM-JJ)",
      jusqua: "facultatif, date de fin incluse (AAAA-MM-JJ)",
      limite: "facultatif, nombre maximum de lignes ; 100 par defaut",
    },
    validate: noErrs,
    summarize: (p) => `Consulter les absences${p.classeId ? " de la classe " + p.classeId : ""}.`,
    rendre: (lignes) =>
      listeRendue(lignes, "Absences", (l) => {
        const statut = STATUT_LISIBLE[l.statut] ?? l.statut ?? "statut inconnu";
        return `${nomComplet(l)} (${l.classe ?? "classe inconnue"}) — ${jour(l.dateAbsence)}, ${l.nbHeures ?? "?"} h, ${statut}`;
      }),
  },
  {
    name: "assiduite.alertes",
    description: "lister les eleves QUI DEPASSENT le seuil d'absences — depassements de seuil, eleves les plus concernes, eleves a signaler",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "listerAlertes",
    parametres: {
      periodeId: "facultatif, identifiant de periode scolaire (UUID) ; par defaut toutes les periodes",
    },
    validate: noErrs,
    summarize: () => "Lister les alertes d'assiduité (seuils dépassés).",
    rendre: (lignes) =>
      listeRendue(
        lignes,
        "Alertes d'assiduité",
        (l) =>
          `${nomComplet(l)} (${l.classe ?? "classe inconnue"}) — ${l.heuresNonJustifiees ?? "?"} h non justifiées, ` +
          `${l.nbRetards ?? 0} retard(s), seuil ${l.seuil ?? "?"}`,
      ),
  },
  {
    // La route expose cette lecture depuis l'origine ; aucun outil ne
    // l'offrait. Un surveillant ne pouvait donc pas demander les retards.
    name: "assiduite.consulter_retards",
    description: "lister les retards enregistres",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "listerRetards",
    parametres: {
      periodeId: "facultatif, identifiant de periode scolaire (UUID) ; par defaut toutes les periodes",
      classeId: "facultatif, identifiant de classe (UUID) ; par defaut toutes les classes",
      limite: "facultatif, nombre maximum de lignes ; 100 par defaut",
    },
    validate: noErrs,
    summarize: (p) => `Consulter les retards${p.classeId ? " de la classe " + p.classeId : ""}.`,
    rendre: (lignes) =>
      listeRendue(lignes, "Retards", (l) => {
        const duree = l.dureeMinutes != null ? `${l.dureeMinutes} min` : "duree inconnue";
        const arrivee = l.heureArrivee ? `, arrive ${String(l.heureArrivee).slice(0, 5)}` : "";
        return `${nomComplet(l)} (${l.classe ?? "classe inconnue"}) — ${jour(l.dateRetard)}, ${duree}${arrivee}`;
      }),
  },
  {
    name: "assiduite.tableau_de_bord",
    description: "chiffres du jour : nombre d'absences et de retards aujourd'hui, total non justifie, incidents, alertes",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "statistiquesVieScolaire",
    parametres: {
      periodeId: "facultatif, identifiant de periode scolaire (UUID) ; par defaut la periode courante",
    },
    validate: noErrs,
    summarize: () => "Chiffres du jour pour la vie scolaire.",
    // Ce n'est pas une liste mais un seul objet de compteurs : `listeRendue`
    // ne s'applique pas, et rendre un tableau de bord en puces le rendrait
    // illisible sur un telephone.
    rendre: (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return null;
      return [
        "Vie scolaire — aujourd'hui :",
        `• ${d.absencesJour ?? 0} absence(s) ce jour`,
        `• ${d.retardsJour ?? 0} retard(s) ce jour`,
        `• ${d.nonJustifiees ?? 0} absence(s) non justifiee(s) sur la periode`,
        `• ${d.incidentsPeriode ?? 0} incident(s) sur la periode`,
        `• ${d.alertes ?? 0} eleve(s) au-dela du seuil`,
      ].join("\n");
    },
  },
  {
    name: "assiduite.conduite_classe",
    description: "notes de conduite des eleves d'une classe sur une periode",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "chargerConduiteClasse",
    parametres: {
      classeId: "OBLIGATOIRE, identifiant de classe (UUID)",
      periodeId: "OBLIGATOIRE, identifiant de periode scolaire (UUID)",
    },
    // La route refuse l'appel sans ces deux parametres : mieux vaut le dire
    // ici et demander une precision que de partir en erreur.
    validate: (p) => {
      const e = {};
      if (!required(p.classeId)) e.classeId = "Classe requise.";
      if (!required(p.periodeId)) e.periodeId = "Période requise.";
      return e;
    },
    summarize: () => "Notes de conduite d'une classe sur une période.",
    rendre: (lignes) =>
      listeRendue(lignes, "Conduite", (l) => {
        const note = l.note == null ? "non notee" : `${l.note}/20`;
        const app = l.appreciation ? ` — ${String(l.appreciation).slice(0, 40)}` : "";
        return `${l.eleve ?? "eleve inconnu"} (${l.matricule ?? "?"}) — ${note}${app}`;
      }),
  },
  {
    name: "discipline.consulter_incidents",
    description: "lister les incidents disciplinaires declares",
    module: "discipline",
    permission: "discipline:lire",
    sensitivity: READ,
    action: "listerIncidents",
    parametres: {
      periodeId: "facultatif, identifiant de periode scolaire (UUID) ; par defaut toutes les periodes",
      classeId: "facultatif, identifiant de classe (UUID) ; par defaut toutes les classes",
      limite: "facultatif, nombre maximum de lignes ; 100 par defaut",
    },
    validate: noErrs,
    summarize: () => "Consulter les incidents déclarés.",
    rendre: (lignes) =>
      listeRendue(lignes, "Incidents", (l) => {
        const sanctions = l.nbSanctions > 0 ? `, ${l.nbSanctions} sanction(s)` : "";
        const notifies = l.parentsNotifies ? "" : ", tuteurs NON prevenus";
        return (
          `${nomComplet(l)} (${l.classe ?? "classe inconnue"}) — ${jour(l.dateIncident)}, ` +
          `gravite ${l.gravite ?? "inconnue"}${l.lieu ? `, ${l.lieu}` : ""}${sanctions}${notifies}`
        );
      }),
  },
  {
    name: "discipline.consulter_sanctions",
    description: "lister les sanctions prononcees",
    module: "discipline",
    permission: "discipline:lire",
    sensitivity: READ,
    action: "listerSanctions",
    parametres: {
      periodeId: "facultatif, identifiant de periode scolaire (UUID) ; par defaut toutes les periodes",
      classeId: "facultatif, identifiant de classe (UUID) ; par defaut toutes les classes",
      limite: "facultatif, nombre maximum de lignes ; 100 par defaut",
    },
    validate: noErrs,
    summarize: () => "Consulter les sanctions prononcées.",
    rendre: (lignes) =>
      listeRendue(lignes, "Sanctions", (l) => {
        const periode = l.dateFin && l.dateFin !== l.dateDebut ? `${jour(l.dateDebut)} au ${jour(l.dateFin)}` : jour(l.dateDebut);
        return (
          `${nomComplet(l)} (${l.classe ?? "classe inconnue"}) — ${l.type ?? "type inconnu"}, ${periode}` +
          `${l.executee ? "" : ", NON executee"}`
        );
      }),
  },
  {
    name: "assiduite.enregistrer_appel",
    description: "ENREGISTRER l'appel : creer des absences pour des eleves nommes",
    module: "assiduite",
    permission: "assiduite:saisir",
    sensitivity: WRITE,
    action: "enregistrerAppel",
    // L'utilisateur dicte des NOMS, l'API exige des identifiants d'inscription.
    // La conversion est faite avant l'appel, contre l'effectif reel de la classe.
    nommes: {
      eleves: {
        vers: "absents",
        liste: true,
        role: "noms des eleves absents, tels que dictes, separes par des virgules",
      },
    },
    parametres: {
      classeId: "obligatoire, identifiant de classe (UUID) : sert a retrouver les eleves nommes et a verifier le perimetre",
      periodeId: "obligatoire, identifiant de periode (UUID)",
      dateAbsence: "obligatoire (AAAA-MM-JJ)",
      nbHeures: "facultatif, entre 0.5 et 12 ; 1 par defaut",
      absents: "obligatoire, liste d'identifiants d'inscription",
    },
    validate: validateAppel,
    summarize: (p) =>
      `Enregistrer l'appel du ${p.dateAbsence} : ${(p.absents || []).length} absent(s), ${(p.retards || []).length} retard(s).`,
  },
  {
    name: "assiduite.enregistrer_retard",
    description: "ENREGISTRER un retard pour un eleve nomme",
    module: "assiduite",
    permission: "retard:saisir",
    sensitivity: WRITE,
    action: "enregistrerRetard",
    nommes: {
      eleve: { vers: "inscriptionId", liste: false, role: "nom de l'eleve en retard, tel que dicte" },
    },
    parametres: {
      classeId: "obligatoire, identifiant de classe (UUID) : sert a retrouver l'eleve nomme et a verifier le perimetre",
      inscriptionId: "obligatoire, inscription de l'eleve (UUID)",
      periodeId: "obligatoire, identifiant de periode (UUID)",
      dateRetard: "obligatoire (AAAA-MM-JJ)",
      dureeMinutes: "facultatif, entre 0 et 480",
    },
    validate: validateRetard,
    summarize: (p) => `Enregistrer un retard le ${p.dateRetard}.`,
    // Le noyau d'ecriture ne renvoie aucun message pour cette operation : sans
    // ce rendu, l'utilisateur recevait « Operation effectuee » et ne savait pas
    // ce qui avait ete enregistre. La confirmation se formule donc a partir de
    // ce qui a ete demande.
    rendre: (_d, p = {}) => {
      const duree = p.dureeMinutes != null ? `${p.dureeMinutes} min` : "duree non precisee";
      return `Retard enregistre : ${duree}, le ${jour(p.dateRetard)}.`;
    },
  },
  {
    name: "assiduite.justifier_absences",
    description: "JUSTIFIER ou DEJUSTIFIER des absences existantes",
    module: "assiduite",
    permission: "assiduite:justifier",
    sensitivity: WRITE,
    requiresConfirmation: true,
    action: "justifierEnLot",
    parametres: {
      absenceIds: "obligatoire, 200 identifiants d'absence au maximum",
      statut: "obligatoire, JUSTIFIEE ou NON_JUSTIFIEE",
      motif: "obligatoire si JUSTIFIEE, au moins 3 caracteres",
    },
    validate: validateJustifier,
    summarize: (p) =>
      `${p.statut === "JUSTIFIEE" ? "Justifier" : "Repasser en non justifiée"} ${(p.absenceIds || []).length} absence(s).`,
  },
  {
    name: "assiduite.supprimer_absence",
    description: "SUPPRIMER une absence enregistree par erreur",
    module: "assiduite",
    permission: "assiduite:saisir",
    sensitivity: SENSITIVE,
    requiresConfirmation: true,
    action: "supprimerAbsence",
    parametres: {
      absenceId: "obligatoire, identifiant de l'absence (UUID)",
      motif: "obligatoire, au moins 3 caracteres",
    },
    validate: validateSupprimer,
    summarize: (p) => `SUPPRIMER une absence (motif : ${p.motif}).`,
    // Meme raison que pour le retard : une suppression confirmee doit se dire,
    // d'autant qu'elle est irreversible.
    rendre: (_d, p = {}) => `Absence supprimee (motif : ${p.motif ?? "non precise"}).`,
  },
];

export class ToolRegistry {
  constructor(tools = []) {
    this._byName = new Map();
    for (const t of tools) this.register(t);
  }
  register(t) {
    this._byName.set(t.name, t);
  }
  get(name) {
    return this._byName.get(name) ?? null;
  }
  all() {
    return [...this._byName.values()];
  }

  /**
   * Catalogue destiné au NLU : un outil par ligne, avec ses paramètres.
   *
   * Le registre est la seule source de ce texte. Il existait auparavant en deux
   * exemplaires — un dans `app.js`, un dans le script de démonstration — qui
   * pouvaient diverger sans que rien ne le signale : un outil ajouté ici restait
   * invisible du modèle là-bas.
   */
  /**
   * Invite systeme complete pour le NLU.
   *
   * Elle vit ici, et non dans `app.js`, pour deux raisons. D'abord elle depend
   * entierement du registre : ce sont les outils qui dictent ce qu'on peut
   * demander au modele. Ensuite, construite dans une fonction flechee au fond
   * de `app.js`, elle n'etait evaluee qu'a l'arrivee d'un message : une faute
   * de syntaxe dans ce texte ne se manifestait donc qu'en production, et
   * `node --check` ne la voyait pas. Ici, un test l'evalue.
   */
  /**
   * Invite du modele.
   *
   * Le contrat des intentions vit dans `plan.js`, a cote de sa validation :
   * une consigne donnee au modele et une regle appliquee au code qui
   * divergent, c'est exactement ce qui produit « Action inconnue. ».
   */
  invitePourNlu() {
    return [
      inviteContrat(),
      "",
      "Outils disponibles :",
      this.pourNlu(),
      "",
      "Renseigne les parametres que la demande precise, et EUX SEULS :",
      "n'invente aucune valeur, surtout pas un identifiant.",
      'Un parametre marque "facultatif" doit rester absent si la demande ne le',
      "precise pas : ne le demande JAMAIS a l'utilisateur.",
    ].join("\n");
  }

  pourNlu() {
    return this.all()
      .map((t) => {
        // Un parametre nomme REMPLACE celui qu'il alimente : demander a la fois
        // `eleves` et `absents` ferait inventer au modele des identifiants.
        const vers = new Set(Object.values(t.nommes ?? {}).map((d) => d.vers));
        const declares = Object.entries(t.parametres ?? {}).filter(([n]) => !vers.has(n));
        const nommes = Object.entries(t.nommes ?? {}).map(([n, d]) => `${n} (${d.role})`);
        const noms = [...nommes, ...declares.map(([n, role]) => `${n} (${role})`)];
        const quoi = t.description ? ` — ${t.description}` : "";
        return `- ${t.name} [${t.sensitivity}]${quoi}\n  parametres : ${noms.length ? noms.join(", ") : "aucun"}`;
      })
      .join("\n");
  }
}
