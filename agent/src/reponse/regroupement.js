/**
 * Regrouper les fragments d'une même demande, sans faire attendre les autres.
 *
 * LE CAS RÉEL
 * ------------
 *   « Affiche-moi les absences »
 *   puis, deux secondes après : « de la 6e A »
 *
 * Traités séparément, le premier déclenche une question de clarification que le
 * second a déjà résolue — et l'utilisateur reçoit deux réponses pour une seule
 * intention. Regroupés, l'agent reçoit « Affiche-moi les absences de la 6e A »
 * et consulte une fois.
 *
 * POURQUOI UNE FENÊTRE COURTE, ET MESURÉE
 * ----------------------------------------
 * Toute fenêtre est un délai ajouté à CHAQUE message, y compris aux demandes
 * complètes qui n'ont rien à attendre. 1,2 s suffit à rattraper un fragment
 * tapé dans la foulée ; au-delà, on fait patienter tout le monde pour le
 * bénéfice de quelques-uns. Et une demande qui se termine par un point
 * d'interrogation, ou qui est manifestement complète, ne patiente pas du tout.
 *
 * CE QUE CE MODULE GARANTIT
 * --------------------------
 * 1. Aucun message n'est perdu : chaque fragment entre dans le lot.
 * 2. L'ordre est conservé.
 * 3. Jamais deux personnes dans le même lot, jamais deux conversations.
 * 4. Un fragment qui arrive pendant la fenêtre la prolonge, jusqu'à un plafond
 *    — sinon quelqu'un qui écrit sans fin ne recevrait jamais de réponse.
 * 5. Le lot est rendu une seule fois.
 */

/** Assez pour rattraper un fragment tapé dans la foulée, pas assez pour gêner. */
export const FENETRE_MS = Number(process.env.REGROUPEMENT_FENETRE_MS ?? 1200);

/** Au-delà, on répond à ce qu'on a : une conversation ne doit pas rester muette. */
export const PLAFOND_MS = Number(process.env.REGROUPEMENT_PLAFOND_MS ?? 5000);

/**
 * Un message qui n'attend manifestement rien.
 *
 * Une question posée en entier, une salutation, un message long : les faire
 * patienter n'apporterait rien. On ne cherche pas à être malin — seulement à
 * ne pas retarder ce qui est clairement complet.
 */
export function paraitComplet(texte) {
  const t = String(texte ?? "").trim();
  if (!t) return false;
  if (/[?؟]\s*$/.test(t)) return true;
  if (t.length >= 120) return true;
  return false;
}

/**
 * Un fragment qui continue visiblement la phrase précédente.
 *
 * « de la 6e A », « en arabe », « et aussi les retards » : commence par une
 * préposition ou une conjonction, et ne commence pas par une majuscule de
 * début de phrase. C'est un indice, pas une certitude — il ne sert qu'à
 * PROLONGER une fenêtre déjà ouverte, jamais à en ouvrir une.
 */
export function paraitFragment(texte) {
  const t = String(texte ?? "").trim();
  if (!t || t.length > 60) return false;
  // `\b` est une frontière ASCII : après une lettre arabe elle ne correspond
  // jamais, et « من الصف السادس » n'était donc pas reconnu. On exige une
  // espace ou la fin de chaîne, ce qui vaut pour les deux écritures.
  return /^(?:de|du|des|d['’]|en|et|pour|avec|dans|sur|[àa]|le|la|les|aussi|plut[ôo]t|mais|ou)(?:\s|$)/i.test(t) ||
    /^(?:من|في|و|على|إلى|مع)(?:\s|$)/u.test(t);
}

/**
 * Regroupe les messages successifs d'une même conversation.
 *
 * @param {object} o
 * @param {(lot:{jid:string, messages:object[], texte:string}) => any} o.traiter
 *   appelé une fois par lot, avec le texte joint
 * @param {number} [o.fenetreMs]
 * @param {number} [o.plafondMs]
 * @param {(ms:number)=>any} [o.minuteur]  pour les tests : remplace setTimeout
 */
export class Regroupeur {
  constructor({
    traiter,
    fenetreMs = FENETRE_MS,
    plafondMs = PLAFOND_MS,
    journal = null,
    horloge = () => Date.now(),
    programmer = (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    },
    annuler = (t) => clearTimeout(t),
  } = {}) {
    this._traiter = traiter;
    this._fenetreMs = fenetreMs;
    this._plafondMs = plafondMs;
    this._journal = journal;
    this._horloge = horloge;
    this._programmer = programmer;
    this._annuler = annuler;
    /** Un lot en formation par conversation. Jamais partagé entre deux JID. */
    this._lots = new Map();
    this.metriques = { messages: 0, lots: 0, regroupes: 0, immediats: 0, plafonds: 0 };
  }

  _tracer(champs) {
    try {
      this._journal?.({ type: "regroupement", ...champs });
    } catch {
      /* un journal qui échoue ne doit pas emporter le message */
    }
  }

  /**
   * Prend un message. Rend la promesse du lot qui le contiendra.
   *
   * Le même lot est rendu à tous les fragments qu'il contient : l'appelant peut
   * donc attendre sans savoir s'il a déclenché le traitement ou rejoint un lot.
   */
  ajouter(jid, message, texte) {
    this.metriques.messages += 1;
    const t = String(texte ?? "");

    const existant = this._lots.get(jid);
    if (existant) {
      existant.messages.push(message);
      existant.textes.push(t);
      this.metriques.regroupes += 1;
      this._annuler(existant.minuteur);

      const ecoule = this._horloge() - existant.ouvertA;
      const reste = Math.max(0, this._plafondMs - ecoule);
      if (reste === 0) {
        this.metriques.plafonds += 1;
        this._tracer({ evenement: "plafond_atteint", fragments: existant.messages.length });
        this._vider(jid);
        return existant.promesse;
      }
      // Un fragment qui continue la phrase prolonge la fenêtre ; un message qui
      // paraît complet la ferme tout de suite.
      const attente = paraitComplet(t) ? 0 : Math.min(this._fenetreMs, reste);
      // Le plafond a mordu : la fenêtre a été raccourcie pour qu'une
      // conversation alimentée sans fin reçoive quand même une réponse. C'est
      // la mesure qui le prouve.
      if (attente > 0 && attente < this._fenetreMs) {
        this.metriques.plafonds += 1;
        this._tracer({ evenement: "plafond_mord", attente, fragments: existant.messages.length });
      }
      existant.minuteur = this._programmer(() => this._vider(jid), attente);
      this._tracer({ evenement: "fragment_ajoute", fragments: existant.messages.length, attente });
      return existant.promesse;
    }

    // UN MESSAGE COMPLET N'ATTEND PAS.
    //
    // Ouvrir une fenêtre pour une question entière ne ferait que retarder sa
    // réponse de 1,2 s, pour rien.
    if (paraitComplet(t)) {
      this.metriques.immediats += 1;
      this.metriques.lots += 1;
      this._tracer({ evenement: "immediat", raison: "message_complet" });
      return Promise.resolve(this._traiter({ jid, messages: [message], texte: t }));
    }

    let resoudre;
    let rejeter;
    const promesse = new Promise((ok, ko) => {
      resoudre = ok;
      rejeter = ko;
    });
    const lot = {
      messages: [message],
      textes: [t],
      ouvertA: this._horloge(),
      promesse,
      resoudre,
      rejeter,
      minuteur: this._programmer(() => this._vider(jid), this._fenetreMs),
    };
    this._lots.set(jid, lot);
    this._tracer({ evenement: "fenetre_ouverte", fenetreMs: this._fenetreMs });
    return promesse;
  }

  /** Ferme le lot et le traite. Rendu une seule fois, même si appelé deux fois. */
  _vider(jid) {
    const lot = this._lots.get(jid);
    if (!lot) return;
    this._lots.delete(jid);
    this._annuler(lot.minuteur);
    this.metriques.lots += 1;

    const texte = lot.textes.map((t) => t.trim()).filter(Boolean).join(" ");
    this._tracer({ evenement: "lot_traite", fragments: lot.messages.length, caracteres: texte.length });
    try {
      Promise.resolve(this._traiter({ jid, messages: lot.messages, texte })).then(lot.resoudre, lot.rejeter);
    } catch (e) {
      lot.rejeter(e);
    }
  }

  /** Vide tous les lots en attente : arrêt du processus, déconnexion. */
  vidangeComplete() {
    for (const jid of [...this._lots.keys()]) this._vider(jid);
  }
}
