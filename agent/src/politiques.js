/**
 * Politiques d'exécution — l'autorisation permanente qui remplace la
 * confirmation répétée.
 *
 * LE PROBLÈME QUE CE MODULE RÉSOUT
 * ---------------------------------
 * L'agent demandait « répondez oui pour confirmer » à chaque opération
 * sensible. Pour un surveillant qui saisit l'appel de six classes, c'est six
 * interruptions pour six gestes déjà autorisés par son rôle. Une confirmation
 * qu'on donne machinalement soixante fois par jour ne protège plus rien : elle
 * entraîne au réflexe, et le jour où la demande est anormale, elle est
 * approuvée comme les autres.
 *
 * L'établissement décide **une fois** ce que l'agent peut faire seul. L'agent
 * travaille ensuite dans ce cadre, et n'interrompt que ce qui en sort.
 *
 * CE QU'UNE POLITIQUE NE FAIT PAS
 * --------------------------------
 * **Une politique ne donne JAMAIS une permission.** Elle répond à une seule
 * question : « faut-il demander confirmation à un humain ? ». L'ordre reste :
 *
 *     identité → RBAC (pré-filtre) → politique → garde du backend
 *
 * Un rôle qui n'a pas le droit reste refusé, politique ou non. Le garde de la
 * plateforme a le dernier mot dans tous les cas. Autrement dit, une politique
 * ne peut qu'ENLEVER une friction, jamais ajouter un pouvoir.
 *
 * POURQUOI DES DONNÉES, ET PAS DU CODE
 * -------------------------------------
 * Une politique est un objet sérialisable, versionné, lisible par un
 * administrateur. Si elle contenait des fonctions, personne ne pourrait dire ce
 * que l'agent a le droit de faire sans lire le programme — et on ne pourrait ni
 * la stocker, ni la comparer, ni la réviser.
 */

/** Décisions possibles. */
export const DECISIONS = {
  /** Couverte par une politique : l'agent exécute seul. */
  AUTOMATIQUE: "AUTOMATIQUE",
  /** Aucune politique ne couvre le cas : on demande à l'humain. */
  CONFIRMATION: "CONFIRMATION",
};

/** Pourquoi une politique n'a pas couvert l'opération. Sert au diagnostic. */
export const MOTIFS = {
  AUCUNE_POLITIQUE: "AUCUNE_POLITIQUE",
  POLITIQUE_SUSPENDUE: "POLITIQUE_SUSPENDUE",
  ROLE_HORS_POLITIQUE: "ROLE_HORS_POLITIQUE",
  HORS_FENETRE: "HORS_FENETRE",
  PARAMETRE_HORS_BORNES: "PARAMETRE_HORS_BORNES",
  QUOTA_ATTEINT: "QUOTA_ATTEINT",
};

/** Quand prévenir les responsables. */
export const NOTIFIER = {
  JAMAIS: "jamais",
  ECHEC: "echec",
  TOUJOURS: "toujours",
};

const estNombre = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Compteur d'opérations, en mémoire.
 *
 * Les quotas journaliers s'appuient dessus. L'implémentation persistante vit
 * dans `persistance.js` : ici, le défaut sert aux tests et aux démonstrations.
 */
export class CompteurMemoire {
  constructor() {
    this._n = new Map();
  }
  compter(cle) {
    return this._n.get(cle) ?? 0;
  }
  incrementer(cle) {
    const v = this.compter(cle) + 1;
    this._n.set(cle, v);
    return v;
  }
}

/**
 * Valide la forme d'une politique.
 *
 * Une politique mal écrite qui passerait inaperçue serait pire qu'absente :
 * elle donnerait l'illusion d'un cadre. On refuse donc à la construction.
 *
 * @returns {string[]} les défauts trouvés, vide si la politique est saine
 */
export function validerPolitique(p) {
  const defauts = [];
  if (!p || typeof p !== "object") return ["politique absente ou non objet"];
  if (!p.id) defauts.push("id manquant");
  if (!estNombre(p.version)) defauts.push("version manquante (une politique se revise)");
  if (!Array.isArray(p.operations) || p.operations.length === 0) defauts.push("operations manquantes");
  if (!Array.isArray(p.roles) || p.roles.length === 0) defauts.push("roles manquants");
  if (p.notifier && !Object.values(NOTIFIER).includes(p.notifier.quand ?? NOTIFIER.ECHEC)) {
    defauts.push(`notifier.quand inconnu : ${p.notifier.quand}`);
  }
  if (p.fenetre?.heures && (!Array.isArray(p.fenetre.heures) || p.fenetre.heures.length !== 2)) {
    defauts.push("fenetre.heures doit etre [debut, fin]");
  }
  return defauts;
}

/** L'opération est-elle nommée par la politique ? `*` couvre un module entier. */
function couvreOperation(politique, nomOutil) {
  return politique.operations.some((motif) => {
    if (motif === "*") return true;
    if (motif.endsWith(".*")) return nomOutil.startsWith(motif.slice(0, -1));
    return motif === nomOutil;
  });
}

/** Les bornes déclarées sur les paramètres sont-elles respectées ? */
function parametreHorsBornes(politique, params) {
  for (const [nom, borne] of Object.entries(politique.parametres ?? {})) {
    const v = params?.[nom];
    if (borne.requis && (v === undefined || v === null || v === "")) return `${nom} requis par la politique`;
    if (v === undefined || v === null) continue;
    if (estNombre(borne.max) && estNombre(Number(v)) && Number(v) > borne.max) {
      return `${nom}=${v} depasse le maximum ${borne.max}`;
    }
    if (estNombre(borne.min) && estNombre(Number(v)) && Number(v) < borne.min) {
      return `${nom}=${v} sous le minimum ${borne.min}`;
    }
    if (Array.isArray(borne.valeurs) && !borne.valeurs.includes(v)) {
      return `${nom}=${v} hors des valeurs autorisees`;
    }
    if (estNombre(borne.tailleMax) && Array.isArray(v) && v.length > borne.tailleMax) {
      return `${nom} porte ${v.length} elements, maximum ${borne.tailleMax}`;
    }
  }
  return null;
}

/** La demande tombe-t-elle dans la fenêtre d'application ? */
function horsFenetre(politique, date) {
  const f = politique.fenetre;
  if (!f) return false;
  if (Array.isArray(f.joursSemaine) && !f.joursSemaine.includes(date.getDay())) return "jour hors fenetre";
  if (Array.isArray(f.heures)) {
    const [debut, fin] = f.heures;
    const h = date.getHours();
    if (h < debut || h >= fin) return `heure ${h} hors de [${debut},${fin}[`;
  }
  return false;
}

export class MoteurPolitiques {
  /**
   * @param {object} o
   * @param {object[]} o.politiques
   * @param {{compter:(c:string)=>number, incrementer:(c:string)=>number}} [o.compteur]
   * @param {() => Date} [o.maintenant]
   * @param {(e:object) => void} [o.journal]
   */
  constructor({ politiques = [], compteur = new CompteurMemoire(), maintenant = () => new Date(), journal = null } = {}) {
    this._compteur = compteur;
    this._maintenant = maintenant;
    this._journal = journal;
    this._politiques = [];
    for (const p of politiques) {
      const defauts = validerPolitique(p);
      if (defauts.length) {
        // On refuse plutôt que d'appliquer à moitié : une politique mal écrite
        // donnerait l'illusion d'un cadre.
        throw new Error(`politique « ${p?.id ?? "?"} » invalide : ${defauts.join(" ; ")}`);
      }
      this._politiques.push(p);
    }
  }

  get politiques() {
    return this._politiques.map((p) => ({ id: p.id, version: p.version, actif: p.actif !== false, suspendue: Boolean(p.suspendue) }));
  }

  /** Suspend une politique sans la supprimer — un retour arrière doit être immédiat. */
  suspendre(id, suspendue = true) {
    const p = this._politiques.find((x) => x.id === id);
    if (!p) return false;
    p.suspendue = suspendue;
    this._journal?.({ type: "politique", evenement: suspendue ? "suspendue" : "reactivee", id });
    return true;
  }

  /**
   * Faut-il demander confirmation pour cette opération ?
   *
   * @param {object} o
   * @param {{name:string, module?:string, sensitivity:string}} o.outil
   * @param {object} o.params
   * @param {{role:string, id:string}} o.staff
   * @returns {{decision:string, politique:string|null, version:number|null,
   *            motif:string|null, detail:string|null, notifier:object|null}}
   */
  decider({ outil, params = {}, staff }) {
    const date = this._maintenant();
    const examens = [];

    for (const p of this._politiques) {
      if (p.actif === false) continue;
      if (!couvreOperation(p, outil.name)) continue;

      if (p.suspendue) {
        examens.push({ id: p.id, motif: MOTIFS.POLITIQUE_SUSPENDUE, detail: null });
        continue;
      }
      if (!p.roles.includes(staff.role)) {
        examens.push({ id: p.id, motif: MOTIFS.ROLE_HORS_POLITIQUE, detail: staff.role });
        continue;
      }
      const fenetre = horsFenetre(p, date);
      if (fenetre) {
        examens.push({ id: p.id, motif: MOTIFS.HORS_FENETRE, detail: fenetre });
        continue;
      }
      const bornes = parametreHorsBornes(p, params);
      if (bornes) {
        examens.push({ id: p.id, motif: MOTIFS.PARAMETRE_HORS_BORNES, detail: bornes });
        continue;
      }
      if (estNombre(p.quotaJournalier)) {
        // Le quota est compté PAR POLITIQUE ET PAR ACTEUR : un plafond commun
        // laisserait une personne consommer celui de tous les autres.
        const cle = this._cleQuota(p, staff, date);
        if (this._compteur.compter(cle) >= p.quotaJournalier) {
          examens.push({ id: p.id, motif: MOTIFS.QUOTA_ATTEINT, detail: `${p.quotaJournalier}/jour` });
          continue;
        }
      }

      return {
        decision: DECISIONS.AUTOMATIQUE,
        politique: p.id,
        version: p.version,
        motif: null,
        detail: null,
        notifier: p.notifier ?? null,
      };
    }

    // Aucune politique ne couvre : ce n'est PAS un refus. L'opération reste
    // possible, mais un humain doit la confirmer.
    const meilleur = examens[0] ?? null;
    return {
      decision: DECISIONS.CONFIRMATION,
      politique: meilleur?.id ?? null,
      version: null,
      motif: meilleur?.motif ?? MOTIFS.AUCUNE_POLITIQUE,
      detail: meilleur?.detail ?? null,
      notifier: null,
    };
  }

  /** Enregistre une exécution, pour les quotas. */
  enregistrerExecution({ politique, staff }) {
    const p = this._politiques.find((x) => x.id === politique);
    if (!p || !estNombre(p.quotaJournalier)) return 0;
    return this._compteur.incrementer(this._cleQuota(p, staff, this._maintenant()));
  }

  _cleQuota(politique, staff, date) {
    return `${politique.id}:${staff.id}:${date.toISOString().slice(0, 10)}`;
  }
}

/**
 * Politiques par défaut de l'établissement.
 *
 * Elles traduisent une règle simple : **ce que le rôle autorise déjà et qui se
 * corrige facilement se fait seul ; ce qui est irréversible se confirme.**
 *
 * Les lectures ne modifient rien et sont déjà filtrées par le périmètre du
 * backend : les confirmer n'apportait aucune sécurité, seulement de la gêne.
 *
 * Les écritures d'assiduité sont le métier quotidien d'un surveillant. Elles
 * sont bornées — nombre d'élèves par saisie, heures, quota journalier — pour
 * qu'une erreur de compréhension reste petite et visible.
 *
 * La suppression d'une absence n'y figure pas, délibérément : elle est
 * irréversible et reste sous confirmation.
 */
export const POLITIQUES_DEFAUT = [
  {
    id: "lectures-vie-scolaire",
    version: 1,
    description: "Toute consultation autorisee par le role s'execute sans confirmation.",
    operations: ["assiduite.consulter_absences", "assiduite.alertes", "assiduite.consulter_retards", "assiduite.tableau_de_bord", "assiduite.conduite_classe", "discipline.consulter_incidents", "discipline.consulter_sanctions"],
    roles: ["SUPER_ADMIN", "DIRECTION", "CENSEUR", "SURVEILLANT", "SECRETARIAT", "ENSEIGNANT"],
    parametres: { limite: { max: 500 } },
    notifier: { quand: NOTIFIER.ECHEC, destinataires: ["SUPER_ADMIN"] },
  },
  {
    id: "appel-quotidien",
    version: 1,
    description: "Saisie de l'appel par les personnels qui en ont la charge.",
    operations: ["assiduite.enregistrer_appel", "assiduite.enregistrer_retard"],
    roles: ["SUPER_ADMIN", "SURVEILLANT", "ENSEIGNANT"],
    parametres: {
      // Une saisie porte une classe, pas un niveau entier : au-dela, c'est
      // probablement une mauvaise comprehension de la demande.
      absents: { tailleMax: 60 },
      nbHeures: { min: 0.5, max: 12 },
      dureeMinutes: { min: 0, max: 480 },
    },
    quotaJournalier: 80,
    notifier: { quand: NOTIFIER.ECHEC, destinataires: ["SUPER_ADMIN", "DIRECTION"] },
  },
  {
    id: "justification-assiduite",
    version: 1,
    description: "Justification d'absences existantes, en lot borne.",
    operations: ["assiduite.justifier_absences"],
    roles: ["SUPER_ADMIN", "SECRETARIAT", "SURVEILLANT"],
    parametres: { absenceIds: { tailleMax: 50 }, motif: { requis: true } },
    quotaJournalier: 40,
    notifier: { quand: NOTIFIER.TOUJOURS, destinataires: ["DIRECTION"] },
  },
];
