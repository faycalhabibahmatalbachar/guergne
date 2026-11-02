/**
 * Chien de garde de la connexion WhatsApp.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Le 2 novembre 2026, l'agent est resté 6 h 36 dans l'état « connecting ».
 * Le processus était vivant, il tenait le verrou d'instance, son horloge de
 * surveillance battait — et il n'a ni reçu ni envoyé un seul message. Zéro
 * tentative de reconnexion, parce que rien dans le code ne regardait cet
 * état. `reconnect()` existait déjà ; il manquait seulement quelqu'un pour
 * l'appeler.
 *
 * Pire : `/sante` répondait `processus: "ok"` et un code 200 pendant toute la
 * panne. Un faux vert est plus coûteux qu'un rouge franc, parce qu'il empêche
 * de chercher.
 *
 * POURQUOI « qr » N'EST PAS UN BLOCAGE
 * -------------------------------------
 * L'état `qr` attend un être humain devant un téléphone. Il peut durer des
 * heures légitimement, et le forcer effacerait le code que quelqu'un est en
 * train de scanner. On le signale comme une attente, jamais comme une panne.
 *
 * POURQUOI LES TENTATIVES SONT PLAFONNÉES
 * ----------------------------------------
 * Relancer un client WhatsApp en boucle fait bannir le numéro de
 * l'établissement, ce qui est bien plus grave que l'indisponibilité qu'on
 * cherche à réparer. Au-delà du plafond, le surveillant s'arrête et dit que
 * l'intervention est humaine. Il vaut mieux un service arrêté qu'un numéro
 * perdu.
 */

/** Au-delà, un « connecting » n'est plus une restauration : c'est un blocage. */
export const SEUIL_CONNEXION_MS = 8 * 60 * 1000;

/** Un « disconnected » qui dure malgré l'événement de reconnexion. */
export const SEUIL_DECONNEXION_MS = 2 * 60 * 1000;

/**
 * Nombre maximal de reconnexions forcées par le surveillant.
 *
 * Trois, parce qu'un blocage qui survit à trois relances n'est pas un
 * incident passager : c'est le disque, la mémoire ou la session. Insister
 * ferait bannir le numéro sans rien réparer.
 */
export const TENTATIVES_MAX = 3;

/** Délais entre deux reconnexions forcées, croissants. */
export const RECULS_MS = Object.freeze([0, 60_000, 300_000]);

/** Les états que le transport peut rendre. */
const ETATS_CONNUS = Object.freeze(["ready", "connecting", "qr", "disconnected"]);

export class SurveillantConnexion {
  /**
   * @param {object} [o]
   * @param {() => number} [o.horloge]
   * @param {(e:object) => void} [o.journal]
   */
  constructor({ horloge = () => Date.now(), journal = null } = {}) {
    this._horloge = horloge;
    this._journal = journal;
    this._etat = null;
    this._depuis = null;
    this._tentatives = 0;
    this._derniereTentative = null;
    this._abandonne = false;
  }

  /**
   * Décide quoi faire de l'état courant.
   *
   * @param {object} o
   * @param {string} o.etat  l'état rendu par le transport
   * @returns {{action: "rien"|"forcer"|"abandonner", raison?: string, attendreMs?: number}}
   */
  evaluer({ etat } = {}) {
    const maintenant = this._horloge();

    // Un etat inconnu n'est pas un etat sain : le signaler plutot que de le
    // traiter comme « rien a faire », qui le rendrait invisible.
    const connu = ETATS_CONNUS.includes(etat);

    if (etat !== this._etat) {
      this._etat = etat;
      this._depuis = maintenant;
      // Revenir en « ready » signifie que la connexion marche : on repart de
      // zero, sinon le plafond de la panne precedente interdirait de reparer
      // la suivante.
      if (etat === "ready") {
        this._tentatives = 0;
        this._derniereTentative = null;
        this._abandonne = false;
      }
    }

    if (etat === "ready") return { action: "rien" };

    // L'attente d'un scan n'est pas une panne : quelqu'un doit venir.
    if (etat === "qr") return { action: "rien", raison: "attente du scan d'un QR" };

    if (!connu) {
      return { action: "rien", raison: `etat inconnu du transport : ${String(etat).slice(0, 30)}` };
    }

    const depuisMs = maintenant - (this._depuis ?? maintenant);
    const seuil = etat === "connecting" ? SEUIL_CONNEXION_MS : SEUIL_DECONNEXION_MS;
    if (depuisMs < seuil) return { action: "rien" };

    if (this._abandonne || this._tentatives >= TENTATIVES_MAX) {
      this._abandonne = true;
      return {
        action: "abandonner",
        raison:
          `bloque en « ${etat} » depuis ${Math.round(depuisMs / 60000)} min apres ` +
          `${this._tentatives} reconnexion(s) forcee(s) : intervention humaine requise`,
      };
    }

    // Le recul s'applique entre deux tentatives, pas avant la premiere.
    const recul = RECULS_MS[Math.min(this._tentatives, RECULS_MS.length - 1)];
    if (this._derniereTentative !== null && maintenant - this._derniereTentative < recul) {
      return { action: "rien", attendreMs: recul - (maintenant - this._derniereTentative) };
    }

    this._tentatives += 1;
    this._derniereTentative = maintenant;
    const raison =
      `bloque en « ${etat} » depuis ${Math.round(depuisMs / 60000)} min — ` +
      `reconnexion forcee ${this._tentatives}/${TENTATIVES_MAX}`;
    this._journal?.({ type: "surveillance", evenement: "reconnexion_forcee", etat, tentative: this._tentatives });
    return { action: "forcer", raison };
  }

  /**
   * Ce que `/sante` doit dire.
   *
   * `degrade` existe pour qu'un service indisponible ne reponde plus jamais un
   * vert franc. `qr` n'est pas degrade : c'est une attente connue.
   */
  sante({ etat } = {}) {
    const maintenant = this._horloge();
    const depuisMs = this._etat === etat && this._depuis !== null ? maintenant - this._depuis : 0;

    if (etat === "ready") return { degrade: false, etat, depuisMs, tentatives: this._tentatives };
    if (etat === "qr") {
      return { degrade: false, etat, depuisMs, tentatives: this._tentatives, raison: "attente du scan d'un QR" };
    }

    const seuil = etat === "connecting" ? SEUIL_CONNEXION_MS : SEUIL_DECONNEXION_MS;
    const degrade = depuisMs >= seuil;
    return {
      degrade,
      etat,
      depuisMs,
      tentatives: this._tentatives,
      abandonne: this._abandonne,
      raison: degrade
        ? `aucun message ne peut etre recu ni envoye depuis ${Math.round(depuisMs / 60000)} min`
        : `transport en cours d'etablissement (${Math.round(depuisMs / 1000)} s)`,
    };
  }
}
