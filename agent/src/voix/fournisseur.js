/**
 * Contrat d'un fournisseur de synthèse vocale, et un double pour les tests.
 *
 * POURQUOI UNE INTERFACE
 * -----------------------
 * Piper est le moteur retenu aujourd'hui, pour des raisons mesurées. Il ne sera
 * pas le dernier : un moteur multilingue plus naturel apparaîtra, ou le quota
 * CPU du conteneur changera. Le reste de l'agent ne doit pas avoir à le savoir.
 *
 * Tout ce qui est au-dessus — préparation du texte, segmentation, transport
 * WhatsApp — ne parle donc qu'à ce contrat. Remplacer le moteur revient à
 * écrire une autre classe, pas à retoucher le moteur conversationnel.
 *
 * POURQUOI UN DOUBLE EST FOURNI ICI
 * ----------------------------------
 * Les tests de l'intégration ne doivent ni charger un modèle de 63 Mo ni
 * dépendre de Python. `FauxFournisseurVoix` répond instantanément, sait
 * échouer sur commande, et compte ce qu'on lui a demandé — ce qui permet
 * d'éprouver le comportement en cas de panne vocale, qui est le cas le plus
 * important à vérifier.
 */

/** Les formats que le transport WhatsApp accepte réellement comme note vocale. */
export const FORMATS = Object.freeze(["ogg", "wav"]);

/** Une synthèse qui échoue. Nommée, pour que l'appelant la distingue d'une panne générale. */
export class EchecSynthese extends Error {
  constructor(message, { langue = null, cause = null } = {}) {
    super(message);
    this.name = "EchecSynthese";
    this.langue = langue;
    this.cause = cause;
  }
}

/**
 * Le contrat.
 *
 * Les méthodes non implémentées lèvent plutôt que de rendre `undefined` : un
 * fournisseur incomplet doit se faire remarquer au branchement, pas produire
 * un silence en production.
 */
export class FournisseurVoix {
  /** Démarre le moteur et charge les modèles. Appelé une seule fois. */
  async initialize() {
    throw new Error("FournisseurVoix.initialize non implémenté");
  }

  /**
   * Synthétise un texte.
   *
   * @param {object} o
   * @param {string} o.text          le texte À DIRE, déjà normalisé pour l'oral
   * @param {string} o.language      "fr" ou "ar"
   * @param {string} [o.voice]       modèle précis, si l'appelant en impose un
   * @param {number} [o.speed]       1 = débit du modèle
   * @param {string} [o.outputFormat]
   * @returns {Promise<{chemin:string, format:string, dureeS:number|null, msGeneration:number}>}
   */
  async synthesize(_o) {
    throw new Error("FournisseurVoix.synthesize non implémenté");
  }

  /** Le moteur répond-il ? Ne doit jamais lever : c'est une question, pas une opération. */
  async healthCheck() {
    return { sain: false, raison: "healthCheck non implémenté" };
  }

  /** Ce que ce fournisseur sait faire, pour que l'appelant n'ait pas à le deviner. */
  getCapabilities() {
    return { langues: [], formats: [], moteur: "inconnu" };
  }

  /** Arrêt propre. Doit être idempotent : un arrêt appelé deux fois n'est pas une erreur. */
  async shutdown() {}

  /** Mesures cumulées. Sans elles, « la voix est lente » reste une impression. */
  getMetrics() {
    return { demandes: 0, succes: 0, echecs: 0 };
  }
}

/**
 * Métriques partagées par les fournisseurs réels.
 *
 * Les percentiles sont calculés sur une fenêtre glissante : garder toutes les
 * durées d'un processus qui tourne des mois finirait par peser plus que les
 * modèles.
 */
export class Metriques {
  constructor({ fenetre = 200 } = {}) {
    this._fenetre = fenetre;
    this._ms = [];
    this.demandes = 0;
    this.succes = 0;
    this.echecs = 0;
    this.caracteres = 0;
    this.audioS = 0;
    this.derniereErreur = null;
  }

  demande(n = 1) {
    this.demandes += n;
  }

  reussi({ ms, caracteres = 0, dureeS = 0 }) {
    this.succes += 1;
    this.caracteres += caracteres;
    this.audioS += dureeS || 0;
    this._ms.push(ms);
    if (this._ms.length > this._fenetre) this._ms.shift();
  }

  echoue(raison) {
    this.echecs += 1;
    this.derniereErreur = String(raison ?? "").slice(0, 200);
  }

  _pct(q) {
    if (this._ms.length === 0) return null;
    const tri = [...this._ms].sort((a, b) => a - b);
    return Math.round(tri[Math.min(tri.length - 1, Math.floor(q * tri.length))]);
  }

  resume() {
    return {
      demandes: this.demandes,
      succes: this.succes,
      echecs: this.echecs,
      p50Ms: this._pct(0.5),
      p95Ms: this._pct(0.95),
      caracteres: this.caracteres,
      audioS: Math.round(this.audioS),
      // Le facteur temps réel se transpose d'une machine à l'autre, alors
      // qu'une latence brute ne dit rien d'un autre processeur.
      rtf: this.audioS > 0 ? Number((this._ms.reduce((a, b) => a + b, 0) / 1000 / this.audioS).toFixed(3)) : null,
      derniereErreur: this.derniereErreur,
    };
  }
}

/**
 * Double de test. Écrit un fichier minuscule mais réel, pour que l'appelant
 * qui vérifie l'existence du fichier ne soit pas trompé par un double.
 */
export class FauxFournisseurVoix extends FournisseurVoix {
  /**
   * @param {object} [o]
   * @param {boolean} [o.echouer]     fait échouer chaque synthèse
   * @param {number}  [o.delaiMs]     simule une génération lente
   * @param {string[]} [o.langues]
   */
  constructor({ echouer = false, delaiMs = 0, langues = ["fr", "ar"], ecrire = null } = {}) {
    super();
    this.echouer = echouer;
    this.delaiMs = delaiMs;
    this.langues = langues;
    this._ecrire = ecrire;
    this.demandesRecues = [];
    this._metriques = new Metriques();
    this.initialise = false;
    this.arrete = false;
  }

  async initialize() {
    this.initialise = true;
    return { pret: true, langues: this.langues };
  }

  async synthesize({ text, language = "fr", voice = null, speed = 1, outputFormat = "wav" } = {}) {
    this._metriques.demande();
    this.demandesRecues.push({ text, language, voice, speed, outputFormat });
    if (this.delaiMs > 0) await new Promise((r) => setTimeout(r, this.delaiMs));
    if (this.echouer) {
      this._metriques.echoue("faux fournisseur : echec demande");
      throw new EchecSynthese("faux fournisseur : echec demande", { langue: language });
    }
    if (!this.langues.includes(language)) {
      this._metriques.echoue(`langue non chargee : ${language}`);
      throw new EchecSynthese(`langue non chargee : ${language}`, { langue: language });
    }
    const chemin = this._ecrire ? await this._ecrire({ text, language }) : `/faux/${language}-${this.demandesRecues.length}.wav`;
    const r = { chemin, format: outputFormat, dureeS: Math.max(0.5, text.length / 15), msGeneration: this.delaiMs };
    this._metriques.reussi({ ms: this.delaiMs, caracteres: text.length, dureeS: r.dureeS });
    return r;
  }

  async healthCheck() {
    return { sain: this.initialise && !this.arrete, langues: this.langues };
  }

  getCapabilities() {
    return { langues: [...this.langues], formats: [...FORMATS], moteur: "faux" };
  }

  async shutdown() {
    this.arrete = true;
  }

  getMetrics() {
    return this._metriques.resume();
  }
}
