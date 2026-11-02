/**
 * File de notifications sortantes.
 *
 * POURQUOI UNE FILE, ET PAS UN ENVOI DIRECT
 * ------------------------------------------
 * L'agent appelait `sendText` au moment d'informer les responsables. Trois
 * défauts en découlaient, et aucun ne se voyait tant que tout allait bien :
 *
 *   1. **Un échec était définitif.** Une coupure d'une seconde au mauvais
 *      moment, et l'alerte de dépassement de seuil n'arrivait jamais. Personne
 *      ne le savait : l'opération, elle, avait réussi.
 *   2. **Un redémarrage perdait tout.** Les avis en vol disparaissaient avec le
 *      processus, sans trace.
 *   3. **Rien n'empêchait le doublon.** Une reprise après incident renvoyait
 *      les mêmes messages, et un directeur recevait trois fois la même alerte —
 *      le plus sûr moyen qu'il cesse de les lire.
 *
 * CHAQUE DESTINATAIRE EST INDÉPENDANT
 * ------------------------------------
 * Une entrée par destinataire, jamais une par message. Si le numéro de la
 * DIRECTION est injoignable, le SUPER_ADMIN reçoit quand même — et l'inverse.
 * Grouper les deux ferait d'un problème sur l'un un silence pour les deux.
 *
 * LA CLÉ DE DÉDUPLICATION EST LE CŒUR DU MÉCANISME
 * -------------------------------------------------
 * Elle porte ce que la notification DIT, pas quand elle est partie : même run,
 * même destinataire, même sujet ⇒ une seule notification, pour toujours. C'est
 * ce qui rend une reprise sûre.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ETAT = {
  EN_ATTENTE: "en_attente",
  ENVOYEE: "envoyee",
  ABANDONNEE: "abandonnee",
};

/** Nombre de tentatives avant abandon. Au-delà, le problème n'est pas passager. */
const TENTATIVES_MAX = 4;
/** Attente avant la n-ième reprise, en millisecondes. */
const RECULS = [0, 5_000, 30_000, 120_000];
/** Entrées conservées : au-delà, le fichier grossirait sans fin. */
const MAX_HISTORIQUE = 500;

function ecrireAtomique(chemin, contenu) {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  writeFileSync(tmp, contenu, "utf8");
  renameSync(tmp, chemin);
}

export class FileNotifications {
  /**
   * @param {object} o
   * @param {string} [o.chemin]   fichier de persistance sur le volume
   * @param {(jid:string, texte:string) => Promise<unknown>} o.envoyer
   * @param {(jid:string, media:object) => Promise<unknown>} [o.envoyerMedia]
   * @param {() => number} [o.horloge]
   * @param {(e:object) => void} [o.journal]
   */
  constructor({ chemin = null, envoyer, envoyerMedia = null, horloge = () => Date.now(), journal = null } = {}) {
    if (typeof envoyer !== "function") throw new Error("FileNotifications : `envoyer` requis");
    this._chemin = chemin;
    this._envoyer = envoyer;
    this._envoyerMedia = envoyerMedia;
    this._horloge = horloge;
    this._journal = journal;
    /** @type {Map<string, object>} clé de déduplication -> entrée */
    this._entrees = new Map();
    this._charger();
  }

  _charger() {
    if (!this._chemin || !existsSync(this._chemin)) return;
    try {
      const d = JSON.parse(readFileSync(this._chemin, "utf8"));
      for (const e of Array.isArray(d) ? d : []) {
        if (e?.cle) this._entrees.set(e.cle, e);
      }
    } catch {
      // Fichier illisible : on repart a vide. Le pire cas est une notification
      // renvoyee, jamais une donnee perdue — et c'est preferable au silence.
    }
  }

  _sauver() {
    if (!this._chemin) return;
    // On garde les plus recentes : un service qui tourne des mois ne doit pas
    // accumuler sans fin.
    const toutes = [...this._entrees.values()].sort((a, b) => (b.creeLe ?? 0) - (a.creeLe ?? 0));
    const gardees = toutes.slice(0, MAX_HISTORIQUE);
    this._entrees = new Map(gardees.map((e) => [e.cle, e]));
    try {
      ecrireAtomique(this._chemin, JSON.stringify(gardees));
    } catch {
      // Ne jamais empecher une notification parce que l'historique n'a pas pu
      // etre ecrit : la file en memoire reste fonctionnelle.
    }
  }

  _tracer(e) {
    this._journal?.({ type: "notification", ...e });
  }

  /**
   * Met une notification en file.
   *
   * @param {object} o
   * @param {string} o.jid        destinataire — un seul, toujours
   * @param {string} o.texte
   * @param {string} o.cle        identité de la notification (run + sujet + destinataire)
   * @param {object} [o.media]    pièce jointe éventuelle
   * @param {string} [o.run]
   * @returns {{ajoutee:boolean, raison?:string}}
   */
  ajouter({ jid, texte, cle, media = null, run = null }) {
    if (!jid || !texte || !cle) return { ajoutee: false, raison: "entree incomplete" };
    const connue = this._entrees.get(cle);
    if (connue) {
      // Même run, même destinataire, même sujet : déjà vu. C'est ce qui rend
      // une reprise après incident sûre.
      this._tracer({ evenement: "doublon_ignore", cle, etat: connue.etat, run });
      return { ajoutee: false, raison: "doublon" };
    }
    this._entrees.set(cle, {
      cle,
      jid,
      texte,
      media,
      run,
      etat: ETAT.EN_ATTENTE,
      tentatives: 0,
      creeLe: this._horloge(),
      prochainEssai: this._horloge(),
      derniereErreur: null,
    });
    this._sauver();
    this._tracer({ evenement: "mise_en_file", cle, run });
    return { ajoutee: true };
  }

  /** Entrées prêtes à partir maintenant. */
  _dues() {
    const t = this._horloge();
    return [...this._entrees.values()].filter((e) => e.etat === ETAT.EN_ATTENTE && e.prochainEssai <= t);
  }

  /**
   * Tente d'envoyer tout ce qui est dû.
   *
   * Chaque destinataire est traité indépendamment : l'échec de l'un ne doit
   * jamais empêcher l'envoi à l'autre.
   *
   * @returns {Promise<{envoyees:number, echouees:number, abandonnees:number}>}
   */
  async traiter() {
    let envoyees = 0;
    let echouees = 0;
    let abandonnees = 0;

    for (const e of this._dues()) {
      e.tentatives += 1;
      try {
        await this._envoyer(e.jid, e.texte);
        if (e.media && typeof this._envoyerMedia === "function") {
          // Une pièce jointe qui échoue ne doit pas faire renvoyer le texte :
          // le destinataire a déjà l'essentiel.
          try {
            await this._envoyerMedia(e.jid, e.media);
          } catch (err) {
            this._tracer({ evenement: "piece_jointe_echouee", cle: e.cle, run: e.run, erreur: String(err?.message ?? err).slice(0, 120) });
          }
        }
        e.etat = ETAT.ENVOYEE;
        e.envoyeeLe = this._horloge();
        e.derniereErreur = null;
        envoyees += 1;
        this._tracer({ evenement: "envoyee", cle: e.cle, run: e.run, tentatives: e.tentatives });
      } catch (err) {
        e.derniereErreur = String(err?.message ?? err).slice(0, 160);
        if (e.tentatives >= TENTATIVES_MAX) {
          // Au-delà, le problème n'est pas passager : insister encombrerait la
          // file sans jamais aboutir.
          e.etat = ETAT.ABANDONNEE;
          abandonnees += 1;
          this._tracer({ evenement: "abandonnee", cle: e.cle, run: e.run, tentatives: e.tentatives, erreur: e.derniereErreur });
        } else {
          e.prochainEssai = this._horloge() + (RECULS[e.tentatives] ?? RECULS.at(-1));
          echouees += 1;
          this._tracer({ evenement: "reprise_prevue", cle: e.cle, run: e.run, tentatives: e.tentatives, dansMs: e.prochainEssai - this._horloge() });
        }
      }
    }

    if (envoyees || echouees || abandonnees) this._sauver();
    return { envoyees, echouees, abandonnees };
  }

  /**
   * Met en file puis tente immédiatement.
   *
   * L'appelant n'attend pas la reprise : il obtient le résultat du premier
   * essai, et la file se charge du reste.
   */
  async envoyerMaintenant(notification) {
    const r = this.ajouter(notification);
    if (!r.ajoutee) return { ...r, envoyee: false };
    const bilan = await this.traiter();
    return { ...r, envoyee: bilan.envoyees > 0 };
  }

  /** État de la file, pour `/sante` et le compte rendu. */
  get etat() {
    const par = { [ETAT.EN_ATTENTE]: 0, [ETAT.ENVOYEE]: 0, [ETAT.ABANDONNEE]: 0 };
    for (const e of this._entrees.values()) par[e.etat] = (par[e.etat] ?? 0) + 1;
    return { total: this._entrees.size, ...par };
  }

  /** Historique récent, sans numéro complet ni texte de message. */
  historique(limite = 20) {
    return [...this._entrees.values()]
      .sort((a, b) => (b.creeLe ?? 0) - (a.creeLe ?? 0))
      .slice(0, limite)
      .map((e) => ({
        cle: e.cle,
        run: e.run,
        etat: e.etat,
        tentatives: e.tentatives,
        creeLe: new Date(e.creeLe).toISOString(),
        erreur: e.derniereErreur,
      }));
  }
}

/**
 * Clé de déduplication.
 *
 * Elle porte ce que la notification DIT — exécution, sujet, destinataire — et
 * non l'instant de l'envoi. Deux tentatives du même avis partagent donc la
 * même clé, et une seule part.
 */
export function cleNotification({ run, sujet, jid }) {
  const dernier = String(jid ?? "").split("@")[0].slice(-4);
  return `${run ?? "sans-run"}:${sujet ?? "sans-sujet"}:${dernier}`;
}
