/**
 * Les indicateurs d'activité WhatsApp, branchés sur le travail RÉEL.
 *
 * LE CONTRAT, LU ET NON DEVINÉ
 * -----------------------------
 * Dans whatsapp-web.js 1.34.7, `Chat.sendStateTyping()` et ses voisines
 * appellent, dans la page :
 *
 *   window.WWebJS.sendChatstate('typing' | 'recording' | 'stop', chatId)
 *
 * et cette fonction (Utils.js) fabrique un WID depuis la chaîne puis appelle
 * `WAWebChatStateBridge.sendChatStateComposing / Recording / Paused`. La
 * documentation de la bibliothèque précise que l'état « dure 25 secondes ».
 *
 * POURQUOI ON N'APPELLE PAS `Chat.sendStateTyping()`
 * --------------------------------------------------
 * Elle commence par retrouver le `Chat`, et ce détour est précisément ce qui
 * casse dans cet environnement : `getChats()` y échoue sur une erreur minifiée
 * d'une lettre, les modèles de la page ne traversant pas la passerelle
 * Puppeteer avec leurs accesseurs. Or nous tenons déjà le JID. On appelle donc
 * la même fonction de page, directement, avec la chaîne qu'elle attend — c'est
 * le même contrat, sans le détour fragile.
 *
 * CE QUE CE MODULE REFUSE DE FAIRE
 * ---------------------------------
 * La référence dont nous nous inspirons (`moov-ai/src/services/presence.js`)
 * attend `45 ms par caractère` avant d'envoyer, pour imiter une vitesse de
 * frappe humaine. Nous ne reprenons PAS cela : l'assistant est un automate, le
 * faire passer pour une personne n'est pas une amélioration, et un délai qui
 * ne correspond à aucun calcul ne fait que retarder une réponse déjà prête.
 * Ici l'indicateur dure exactement le temps du travail réel — pas une
 * milliseconde de plus, pas une de moins.
 *
 * Tout échec d'indicateur est avalé : un ornement ne doit jamais empêcher une
 * réponse de partir.
 */
import { resumerErreur } from "../erreurs.js";

/** Les trois états, tels que la page les nomme. */
export const ETATS = Object.freeze({ FRAPPE: "typing", ENREGISTREMENT: "recording", ARRET: "stop" });

/**
 * WhatsApp oublie l'état au bout d'environ 25 s. On rafraîchit bien avant,
 * sinon l'indicateur disparaît au milieu d'un traitement qui, lui, continue.
 */
export const RAFRAICHISSEMENT_MS = Number(process.env.PRESENCE_RAFRAICHIR_MS ?? 8000);

/**
 * Pilote les indicateurs d'une session WhatsApp.
 *
 * @param {object} o
 * @param {object} o.client  le client whatsapp-web.js (pour `pupPage`)
 * @param {(e:object)=>void} [o.journal]
 * @param {(etat:string, jid:string)=>Promise<any>} [o.envoyer]  pour les tests
 */
export class ControleurPresence {
  constructor({ client = null, journal = null, envoyer = null, rafraichirMs = RAFRAICHISSEMENT_MS } = {}) {
    this._client = client;
    this._journal = journal;
    this._envoyerCustom = envoyer;
    this._rafraichirMs = rafraichirMs;
    /** Un seul indicateur actif par destinataire : deux états concurrents se contrediraient. */
    this._actifs = new Map();
    this.metriques = { poses: 0, rafraichis: 0, arretes: 0, echecs: 0 };
  }

  _tracer(champs) {
    try {
      this._journal?.({ type: "presence", ...champs });
    } catch {
      /* un journal qui échoue ne doit pas emporter la réponse */
    }
  }

  /** L'appel de page, ou l'injection de test. Ne lève jamais. */
  async _envoyer(etat, jid) {
    try {
      if (this._envoyerCustom) {
        await this._envoyerCustom(etat, jid);
        return true;
      }
      const page = this._client?.pupPage;
      if (!page?.evaluate) return false;
      await page.evaluate(
        (e, j) => window.WWebJS?.sendChatstate?.(e, j),
        etat,
        jid,
      );
      return true;
    } catch (e) {
      this.metriques.echecs += 1;
      this._tracer({ evenement: "presence_echec", etat, raison: resumerErreur(e, { max: 160 }) });
      return false;
    }
  }

  /**
   * Pose un état et le maintient, puis rend la fonction qui l'arrête.
   *
   * L'arrêt est IDEMPOTENT : l'appeler deux fois n'envoie qu'un « stop ». Les
   * chemins d'erreur l'appellent souvent plus d'une fois, et chacun a raison de
   * le faire.
   */
  async _maintenir(etat, jid, { run = null } = {}) {
    // Un état déjà actif sur ce destinataire est arrêté : « en train d'écrire »
    // et « enregistre un audio » simultanés n'ont aucun sens.
    const precedent = this._actifs.get(jid);
    if (precedent) await precedent.arreter();

    let vivant = true;
    const pose = await this._envoyer(etat, jid);
    if (pose) {
      this.metriques.poses += 1;
      this._tracer({ evenement: "presence_posee", etat, run });
    }

    const minuteur = setInterval(() => {
      if (!vivant) return;
      this.metriques.rafraichis += 1;
      this._envoyer(etat, jid).catch(() => {});
    }, this._rafraichirMs);
    // Sans cela, un indicateur oublié empêcherait le processus de s'arrêter.
    minuteur.unref?.();

    const poignee = {
      etat,
      arreter: async () => {
        if (!vivant) return;
        vivant = false;
        clearInterval(minuteur);
        if (this._actifs.get(jid) === poignee) this._actifs.delete(jid);
        await this._envoyer(ETATS.ARRET, jid);
        this.metriques.arretes += 1;
        this._tracer({ evenement: "presence_arretee", etat, run });
      },
    };
    this._actifs.set(jid, poignee);
    return poignee.arreter;
  }

  /** « en train d'écrire… », pendant la préparation réelle d'une réponse écrite. */
  frappe(jid, options) {
    return this._maintenir(ETATS.FRAPPE, jid, options);
  }

  /**
   * « enregistre un audio… », et UNIQUEMENT pendant une vraie opération audio.
   *
   * Ce n'est pas une animation d'attente : l'appeler sans synthèse en cours
   * ferait croire à l'utilisateur que l'assistant enregistre quelque chose.
   */
  enregistrement(jid, options) {
    return this._maintenir(ETATS.ENREGISTREMENT, jid, options);
  }

  /** Arrête tout : fin de traitement, erreur, déconnexion, arrêt du processus. */
  async toutArreter() {
    const poignees = [...this._actifs.values()];
    for (const p of poignees) await p.arreter().catch(() => {});
  }

  /** L'état actif pour un destinataire, ou `null`. Pour les tests et le diagnostic. */
  etatActif(jid) {
    return this._actifs.get(jid)?.etat ?? null;
  }
}
