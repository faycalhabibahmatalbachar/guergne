/**
 * Registre des outils métier. Un outil = une opération réelle de guergne.
 * Les règles de validation reprennent EXACTEMENT celles du code guergne
 * (web/src/app/(main)/dashboard/assiduite/actions.ts et server/domain/vie-scolaire.ts) :
 *   nbHeures ∈ [0.5, 12] ; dureeMinutes retard ∈ [0, 480] ; justification ≤ 200 ;
 *   motif ≥ 3 caractères pour justifier/supprimer.
 */
import { READ, WRITE, SENSITIVE } from "./guard.js";

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
    name: "assiduite.controle_saisies",
    module: "assiduite",
    permission: "assiduite:lire",
    sensitivity: READ,
    action: "controleSaisies",
    validate: noErrs,
    summarize: (p) => `Classes sans appel le ${p.date ?? "jour courant"}.`,
  },
  {
    name: "assiduite.enregistrer_appel",
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
  },
  {
    name: "assiduite.justifier_absences",
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
  invitePourNlu() {
    return [
      "Tu choisis UN outil parmi :",
      this.pourNlu(),
      'Reponds en JSON {"tool":"<nom>","params":{...}}.',
      "Renseigne les parametres que la demande precise, et EUX SEULS :",
      "n'invente aucune valeur, surtout pas un identifiant.",
      'Un parametre marque "facultatif" doit rester absent si la demande ne le',
      "precise pas : ne le demande JAMAIS a l'utilisateur.",
      "Si un parametre OBLIGATOIRE manque, ou si la demande est ambigue,",
      'reponds {"clarify":"<question>"}.',
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
        return `- ${t.name} [${t.sensitivity}] parametres : ${noms.length ? noms.join(", ") : "aucun parametre"}`;
      })
      .join("\n");
  }
}
