/**
 * Machine d'états du transport WhatsApp, et ce qu'elle permet de dire.
 *
 * POURQUOI ELLE EXISTE
 * ---------------------
 * Le 2 novembre 2026, le service est resté muet 7 h 27. Le diagnostic a pris
 * des heures parce que l'état disponible se résumait à une chaîne :
 * « connecting ». Cette chaîne ne disait ni depuis quand, ni ce qui avait été
 * tenté, ni ce qui avait échoué, ni si un message était jamais arrivé.
 *
 * La cause s'est révélée être un effondrement de Chromium — prouvé par un
 * fichier `core` de 1,16 Go nommant
 * `.cache/puppeteer/chrome/linux-146.0.7680.31/chrome-linux64/chrome`, écrit à
 * la seconde même du démarrage. Puppeteer n'a pas rejeté : `initialize()` est
 * resté suspendu, et un `await` au niveau du module a gelé le reste.
 *
 * Un état vivant du processus Node ne dit RIEN de WhatsApp. C'est la confusion
 * que ce module rend impossible.
 *
 * CE QU'ELLE N'EST PAS
 * --------------------
 * Elle ne décide pas de reconnecter — c'est le rôle de
 * `surveillance-connexion.js`. Elle ne parle pas au réseau. Elle enregistre et
 * elle raconte, pour qu'une panne soit lisible sans accès au serveur.
 */

/** Les états, du démarrage à l'échec. */
export const ETATS = Object.freeze({
  APPLICATION_READY: "APPLICATION_READY",
  WHATSAPP_INITIALIZING: "WHATSAPP_INITIALIZING",
  WHATSAPP_CONNECTING: "WHATSAPP_CONNECTING",
  WHATSAPP_AUTHENTICATED: "WHATSAPP_AUTHENTICATED",
  WHATSAPP_READY: "WHATSAPP_READY",
  WHATSAPP_DISCONNECTED: "WHATSAPP_DISCONNECTED",
  WHATSAPP_AUTH_FAILURE: "WHATSAPP_AUTH_FAILURE",
  WHATSAPP_ERROR: "WHATSAPP_ERROR",
});

const TOUS = Object.freeze(Object.values(ETATS));

/**
 * Correspondance vers les quatre états historiques.
 *
 * `getConnectionStatus()` rend `ready|connecting|qr|disconnected` depuis
 * l'origine, et `/sante`, le surveillant et leurs tests s'appuient dessus.
 * Enrichir l'observation ne doit pas casser ce qui marche : la machine est
 * donc ajoutée À CÔTÉ, et traduite.
 */
export function versEtatHistorique(etat, attenteQr) {
  if (attenteQr) return "qr";
  switch (etat) {
    case ETATS.WHATSAPP_READY:
      return "ready";
    case ETATS.WHATSAPP_INITIALIZING:
    case ETATS.WHATSAPP_CONNECTING:
    case ETATS.WHATSAPP_AUTHENTICATED:
      return "connecting";
    default:
      return "disconnected";
  }
}

/**
 * Un écran de chargement doit-il changer l'état ?
 *
 * Non quand la session est déjà prête. WhatsApp Web émet encore des
 * `loading_screen` lors de ses re-synchronisations, bien après `ready` : les
 * suivre ferait régresser l'état vers CONNECTING alors que le client sert
 * normalement. C'est exactement ce qui est arrivé en production — l'état
 * détaillé a annoncé CONNECTING pendant 5 h 42 en contredisant `ready`.
 *
 * Une vraie déconnexion, elle, passe par l'événement `disconnected`, qui n'est
 * pas concerné par ce garde.
 */
export function doitSuivreChargement(etatCourant) {
  return etatCourant !== ETATS.WHATSAPP_READY;
}

/** Un message tronqué, sans contenu de conversation ni numéro. */
const extrait = (v, n = 200) => String(v ?? "").slice(0, n);

export class EtatWhatsApp {
  /**
   * @param {object} [o]
   * @param {() => number} [o.horloge]
   * @param {(e:object) => void} [o.journal]
   */
  constructor({ horloge = () => Date.now(), journal = null } = {}) {
    this._horloge = horloge;
    this._journal = journal;
    const t = this._horloge();
    this._etat = ETATS.APPLICATION_READY;
    this._depuis = t;
    this._demarreLe = t;
    this._attenteQr = false;
    this._reconnexions = 0;
    /** Historique court : les dix dernières transitions suffisent à raconter une panne. */
    this._transitions = [{ etat: this._etat, le: t }];
    this._dernierMessageRecu = null;
    this._dernierMessageTraite = null;
    this._dernierEnvoi = null;
    this._derniereErreur = null;
    /** Cumul passé en CONNECTING, pour qu'un aller-retour ne remette pas le compteur à zéro. */
    this._cumulConnexionMs = 0;
  }

  get etat() {
    return this._etat;
  }

  get reconnexions() {
    return this._reconnexions;
  }

  get attenteQr() {
    return this._attenteQr;
  }

  /** L'état historique, pour `getConnectionStatus()`. */
  get etatHistorique() {
    return versEtatHistorique(this._etat, this._attenteQr);
  }

  /**
   * Change d'état.
   *
   * Un état inconnu n'est pas ignoré : il devient une erreur nommée, parce
   * qu'une transition qu'on avale est une panne qu'on ne verra pas.
   */
  transiter(etat, { raison = null, compterReconnexion = false } = {}) {
    const t = this._horloge();
    if (!TOUS.includes(etat)) {
      this._derniereErreur = { le: t, message: `etat inconnu : ${extrait(etat, 40)}` };
      etat = ETATS.WHATSAPP_ERROR;
    }

    // Le temps passé à se connecter se cumule : deux tentatives de quatre
    // minutes sont un problème, même si aucune n'a dépassé le seuil.
    if (this._etat === ETATS.WHATSAPP_CONNECTING || this._etat === ETATS.WHATSAPP_INITIALIZING) {
      this._cumulConnexionMs += t - this._depuis;
    }

    if (etat !== this._etat) {
      this._etat = etat;
      this._depuis = t;
      this._transitions.push({ etat, le: t, raison: raison ? extrait(raison) : undefined });
      if (this._transitions.length > 10) this._transitions.shift();
      this._journal?.({ type: "whatsapp_etat", etat, raison: raison ? extrait(raison) : undefined });
    }

    if (compterReconnexion) this._reconnexions += 1;
    if (etat === ETATS.WHATSAPP_READY) {
      this._attenteQr = false;
      this._cumulConnexionMs = 0;
    }
    if (raison && (etat === ETATS.WHATSAPP_ERROR || etat === ETATS.WHATSAPP_AUTH_FAILURE)) {
      this._derniereErreur = { le: t, message: extrait(raison) };
    }
    return this._etat;
  }

  /** Un QR est proposé : on attend un humain, ce n'est pas une panne. */
  qrPropose() {
    this._attenteQr = true;
    this._journal?.({ type: "whatsapp_etat", etat: "qr_propose" });
  }

  /** Un message est arrivé. Jamais son contenu, jamais le numéro. */
  messageRecu() {
    this._dernierMessageRecu = this._horloge();
  }

  /** Un message a été traité jusqu'au bout. */
  messageTraite({ statut = null } = {}) {
    this._dernierMessageTraite = this._horloge();
    if (statut) this._dernierEnvoi = { le: this._dernierMessageTraite, statut: extrait(statut, 40) };
  }

  /** Résultat du dernier envoi sortant : accepté par la passerelle, ou refusé. */
  envoiTente({ ok, raison = null } = {}) {
    this._dernierEnvoi = { le: this._horloge(), statut: ok ? "accepte" : "echec", raison: raison ? extrait(raison) : undefined };
  }

  /** Une erreur exploitable, qu'elle change l'état ou non. */
  erreur(message) {
    this._derniereErreur = { le: this._horloge(), message: extrait(message) };
  }

  /**
   * Effondrement du navigateur : la seule erreur qui change l'état.
   *
   * LE DÉFAUT QU'ELLE CORRIGE, OBSERVÉ EN PRODUCTION
   * -------------------------------------------------
   * Le 5 novembre 2026 à 17 h 24, Chromium a levé « Page crashed! ».
   * `erreur()` l'a consigné — et n'a rien changé d'autre. Dix-sept heures plus
   * tard, `/sante` répondait encore `200` avec `etat: "WHATSAPP_READY"`,
   * `depuisS: 61390` et `reconnexions: 0`, alors que la page du navigateur
   * était morte depuis plus d'une heure.
   *
   * C'est précisément le « faux vert » que ce module existe pour empêcher :
   * un relevé rassurant sur un transport hors service. Pire qu'une panne, car
   * personne ne vient.
   *
   * POURQUOI UNE MÉTHODE DISTINCTE D'`erreur()`
   * --------------------------------------------
   * Toutes les erreurs de page ne sont pas fatales : une exception JavaScript
   * dans WhatsApp Web se consigne et se tolère. Un effondrement, lui, tue le
   * contexte : plus un seul message n'arrivera jamais. Les confondre
   * conduirait soit à ignorer les effondrements, soit à reconnecter sur le
   * moindre avertissement — et une reconnexion inutile coûte quarante
   * secondes de Chromium.
   *
   * L'état devient `WHATSAPP_ERROR`, donc « disconnected » pour le
   * surveillant, qui force alors une reconnexion au bout de deux minutes.
   * Consigner sans transiter, c'était écrire le diagnostic sans appeler
   * personne.
   */
  effondrement(message) {
    this.erreur(message);
    this.transiter(ETATS.WHATSAPP_ERROR, { raison: extrait(message) });
  }

  /**
   * Ce que `/sante` publie.
   *
   * Les instants sont rendus en ISO ET en ancienneté : un horodatage seul
   * oblige celui qui lit à faire la soustraction, et c'est l'ancienneté qui
   * dit s'il faut intervenir.
   */
  resume() {
    const t = this._horloge();
    const age = (q) => (q === null ? null : Math.round((t - q) / 1000));
    const iso = (q) => (q === null ? null : new Date(q).toISOString());
    const enConnexion = this._etat === ETATS.WHATSAPP_CONNECTING || this._etat === ETATS.WHATSAPP_INITIALIZING;
    return {
      etat: this._etat,
      etatHistorique: this.etatHistorique,
      depuis: iso(this._depuis),
      depuisS: age(this._depuis),
      attenteQr: this._attenteQr,
      // Cumul, tentative en cours comprise : c'est le chiffre qui compte quand
      // la connexion echoue et repart en boucle.
      connexionCumuleeS: Math.round((this._cumulConnexionMs + (enConnexion ? t - this._depuis : 0)) / 1000),
      reconnexions: this._reconnexions,
      dernierMessageRecu: iso(this._dernierMessageRecu),
      dernierMessageRecuIlYaS: age(this._dernierMessageRecu),
      dernierMessageTraite: iso(this._dernierMessageTraite),
      dernierEnvoi: this._dernierEnvoi
        ? { ...this._dernierEnvoi, le: iso(this._dernierEnvoi.le), ilYaS: age(this._dernierEnvoi.le) }
        : null,
      derniereErreur: this._derniereErreur
        ? { ...this._derniereErreur, le: iso(this._derniereErreur.le), ilYaS: age(this._derniereErreur.le) }
        : null,
      transitions: this._transitions.map((x) => ({ ...x, le: iso(x.le) })),
      // Un service qui n'a JAMAIS atteint « ready » depuis le demarrage est un
      // service qui n'a jamais servi : c'est different d'une coupure.
      jamaisConnecte: !this._transitions.some((x) => x.etat === ETATS.WHATSAPP_READY),
      // UN ETAT « PRET » PLUS VIEUX QUE SA DERNIERE ERREUR EST SUSPECT.
      //
      // C'est le relevé qui a trompé pendant dix-sept heures : « READY depuis
      // 61 390 s » et, dans le même objet, « Page crashed! il y a 4 188 s ».
      // Les deux ne peuvent pas être vrais en même temps. Le drapeau le dit,
      // pour que la contradiction n'ait plus besoin d'un lecteur attentif.
      // Il couvre aussi les erreurs futures qui ne transiteraient pas.
      etatSuspect:
        this._etat === ETATS.WHATSAPP_READY &&
        this._derniereErreur !== null &&
        this._derniereErreur.le > this._depuis,
      marcheS: age(this._demarreLe),
    };
  }
}
