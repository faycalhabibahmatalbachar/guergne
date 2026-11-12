/**
 * Supervision de l'agent : comprendre ce qu'il fait, sans lire ce qu'on lui dit.
 *
 * Le journal existe déjà — chaque étape écrit une ligne JSON. Mais une ligne
 * par étape ne répond à aucune question : quel outil échoue, quelles demandes
 * ne sont pas comprises, qu'est-ce qui est lent, combien de confirmations
 * attendent. Ce module écoute les MÊMES événements (`journalEtape`, l'audit) et
 * tient les réponses à jour.
 *
 * CE QUI N'Y ENTRE PAS
 * --------------------
 * Aucun texte de message, aucun paramètre d'outil, aucun nom, aucun numéro,
 * aucun jeton. Une conversation y est une suite d'étapes typées :
 * intention, outil, issue, durée. C'est assez pour superviser, et rien de ce
 * qui s'y trouve ne décrit un élève ou une famille. Le banc d'essai, lui,
 * garde tout — mais sur des données de test.
 */

const MAX_TRACES = 200;
const MAX_INCIDENTS = 50;
const LENT_MS = 8_000;

const issueDe = (resultat) =>
  ({
    SUCCESS: "reussies",
    PARTIAL: "reussies",
    FAILURE: "echouees",
    FAILED: "echouees",
    UNVERIFIED: "nonVerifiees",
    DENIED: "refusees",
    REFUSED_UNKNOWN: "refusees",
    WAITING_APPROVAL: "confirmationsDemandees",
    CANCELLED: "annulees",
    EXPIRED: "expirees",
    CLARIFICATION: "clarifications",
    INVALID: "clarifications",
    REJECTED_BEFORE_EXECUTION: "clarifications",
    PLAN_INVALIDE: "incomprises",
    SUPERSEDED: "abandonnees",
    REJECTED_CONFIRMATION: "refusees",
  })[resultat] ?? "autres";

export class Supervision {
  constructor({ maintenant = () => Date.now(), lentMs = LENT_MS } = {}) {
    this._maintenant = maintenant;
    this._lentMs = lentMs;
    this._depuis = maintenant();
    /** @type {Map<string, object>} outil -> compteurs */
    this._outils = new Map();
    /** @type {Map<string, object>} run -> trace en cours */
    this._runs = new Map();
    this._traces = [];
    this._incidents = { lentes: [], erreursBackend: [], incomprises: [], interrompues: [], resolutions: [] };
    this._totaux = { messages: 0, conversations: 0, missions: 0, clarificationsDuModele: 0, choixProposes: 0, choixCompris: 0, enchainements: 0, valeursInventeesRetirees: 0, reprisesMemoire: 0 };
    this._intentions = {};
    this._rejets = {};
  }

  _outil(nom) {
    if (!this._outils.has(nom)) {
      this._outils.set(nom, { appels: 0, reussies: 0, echouees: 0, nonVerifiees: 0, refusees: 0, clarifications: 0, confirmationsDemandees: 0, annulees: 0, expirees: 0, abandonnees: 0, incomprises: 0, autres: 0, dureeCumuleeMs: 0, dureeMaxMs: 0, dernierAppel: null });
    }
    return this._outils.get(nom);
  }

  _trace(run) {
    if (!run) return null;
    if (!this._runs.has(run)) {
      if (this._runs.size > 500) this._runs.delete(this._runs.keys().next().value);
      this._runs.set(run, { run, debut: new Date(this._maintenant()).toISOString(), etapes: [] });
    }
    return this._runs.get(run);
  }

  _incident(liste, e) {
    liste.push({ le: new Date(this._maintenant()).toISOString(), ...e });
    if (liste.length > MAX_INCIDENTS) liste.shift();
  }

  /** Une étape du moteur (`journalEtape`). */
  surEtape(e) {
    if (!e || typeof e !== "object" || !e.event) return;
    const t = this._trace(e.run);
    const noter = (etape) => t?.etapes.push({ etape, ...(e.dureeMs != null ? { ms: e.dureeMs } : {}) });
    switch (e.event) {
      case "intent_detected":
        this._intentions[e.intention ?? "inconnue"] = (this._intentions[e.intention ?? "inconnue"] ?? 0) + 1;
        if (e.intention === "clarifier") this._totaux.clarificationsDuModele += 1;
        if (e.intention === "mission") this._totaux.missions += 1;
        if (e.rejet) {
          this._rejets[e.rejet] = (this._rejets[e.rejet] ?? 0) + 1;
          this._incident(this._incidents.incomprises, { run: e.run, rejet: e.rejet });
        }
        if (t) Object.assign(t, { intention: e.intention ?? null, outil: e.outil ?? null, comprehensionMs: e.dureeMs ?? null });
        noter("intention:" + (e.intention ?? "?") + (e.outil ? ":" + e.outil : ""));
        break;
      case "entites_resolues":
        if (e.choix) this._totaux.choixProposes += 1;
        if (e.issue === "clarifier") this._incident(this._incidents.resolutions, { run: e.run, outil: e.outil, champs: e.champs ?? null, candidats: e.choix ?? null });
        noter("resolution:" + e.issue);
        break;
      case "choix_evalue":
        if (e.compris) this._totaux.choixCompris += 1;
        noter("choix:" + (e.compris ? "compris" : "non_compris"));
        break;
      case "enchainement":
        this._totaux.enchainements += 1;
        noter("enchainement:" + (e.vers ?? "?"));
        break;
      case "valeur_non_dite_retiree":
        this._totaux.valeursInventeesRetirees += 1;
        noter("valeur_retiree:" + e.champ);
        break;
      case "ecriture_verifiee":
        noter("verification:" + (e.verifiee ? "ok" : "echec"));
        break;
      case "confirmation_evaluee":
        noter("confirmation:" + e.issue);
        break;
      case "handler_failed":
        this._incident(this._incidents.interrompues, { run: e.run, canal: e.canal ?? null, erreur: String(e.erreur ?? "").slice(0, 120) });
        noter("interrompue");
        break;
      case "mission_etape":
        noter("mission_etape:" + e.statut + ":" + e.outil);
        break;
      default:
        break;
    }
  }

  /** Une ligne d'audit : la conclusion d'un tour. */
  surAudit(a) {
    if (!a || typeof a !== "object") return;
    this._totaux.messages += 1;
    const issue = issueDe(a.result);
    const nom = a.intent ?? "(aucun)";
    if (nom === "conversation") this._totaux.conversations += 1;
    const o = this._outil(nom);
    o.appels += 1;
    o[issue] = (o[issue] ?? 0) + 1;
    const ms = Number(a.durationMs) || 0;
    o.dureeCumuleeMs += ms;
    o.dureeMaxMs = Math.max(o.dureeMaxMs, ms);
    o.dernierAppel = a.at ?? new Date(this._maintenant()).toISOString();
    if (ms >= this._lentMs) this._incident(this._incidents.lentes, { run: a.runId, outil: nom, ms });
    if (issue === "echouees" || issue === "nonVerifiees") {
      // Le message d'erreur du backend peut citer un nom : on n'en garde que la nature.
      this._incident(this._incidents.erreursBackend, { run: a.runId, outil: nom, issue: a.result, nature: natureErreur(a.error) });
    }
    const t = this._runs.get(a.runId);
    if (t) {
      Object.assign(t, { outil: t.outil ?? a.intent ?? null, role: a.role ?? null, canal: a.channel ?? null, resultat: a.result, dureeMs: ms });
      this._traces.push(t);
      if (this._traces.length > MAX_TRACES) this._traces.shift();
      this._runs.delete(a.runId);
    }
  }

  /** Une reprise de fil depuis la mémoire durable. */
  surMemoire(e) {
    if (e?.type === "memoire_reprise") this._totaux.reprisesMemoire += 1;
  }

  /**
   * Le rapport de supervision.
   * @param {object} [extra] état lu ailleurs au moment de l'appel (mémoire, moteur)
   */
  rapport(extra = {}) {
    const outils = [...this._outils.entries()].map(([nom, o]) => ({
      outil: nom,
      ...o,
      dureeMoyenneMs: o.appels ? Math.round(o.dureeCumuleeMs / o.appels) : null,
      tauxEchec: o.appels ? Number(((o.echouees + o.nonVerifiees) / o.appels).toFixed(3)) : null,
    }));
    const parAppels = [...outils].sort((a, b) => b.appels - a.appels);
    return {
      depuis: new Date(this._depuis).toISOString(),
      totaux: { ...this._totaux, outilsDistincts: outils.length },
      intentions: this._intentions,
      rejets: this._rejets,
      outilsLesPlusUtilises: parAppels.slice(0, 10).map((o) => ({ outil: o.outil, appels: o.appels, dureeMoyenneMs: o.dureeMoyenneMs })),
      outilsLesMoinsUtilises: parAppels.slice(-10).reverse().map((o) => ({ outil: o.outil, appels: o.appels })),
      outilsQuiEchouent: outils.filter((o) => o.echouees + o.nonVerifiees > 0).sort((a, b) => b.tauxEchec - a.tauxEchec).map((o) => ({ outil: o.outil, appels: o.appels, echouees: o.echouees, nonVerifiees: o.nonVerifiees, tauxEchec: o.tauxEchec })),
      outilsLents: outils.filter((o) => o.dureeMoyenneMs >= this._lentMs).map((o) => ({ outil: o.outil, dureeMoyenneMs: o.dureeMoyenneMs, dureeMaxMs: o.dureeMaxMs })),
      demandesMalComprises: this._incidents.incomprises.slice(-20),
      erreursDeResolution: this._incidents.resolutions.slice(-20),
      operationsLentes: this._incidents.lentes.slice(-20),
      erreursBackend: this._incidents.erreursBackend.slice(-20),
      conversationsInterrompues: this._incidents.interrompues.slice(-20),
      outils,
      dernieresConversations: this._traces.slice(-30),
      ...extra,
    };
  }
}

/** La NATURE d'une erreur, sans son texte : un message de backend peut nommer quelqu'un. */
export function natureErreur(message) {
  const m = String(message ?? "").toLowerCase();
  if (!m) return "inconnue";
  if (/droit|permission|autoris|interdit|403/.test(m)) return "droits";
  if (/introuvable|n'existe|aucun|404/.test(m)) return "introuvable";
  if (/timeout|delai|d[ée]lai|econn|fetch failed|r[ée]seau|502|503|504/.test(m)) return "reseau";
  if (/500|interne/.test(m)) return "erreur_interne_backend";
  if (/requis|invalide|format|doit|obligatoire/.test(m)) return "parametre_refuse";
  if (/[ée]critures? d[ée]sactiv/.test(m)) return "ecritures_desactivees";
  if (/relecture|v[ée]rifi/.test(m)) return "verification";
  return "refus_metier";
}
