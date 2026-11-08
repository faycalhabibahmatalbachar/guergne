/**
 * L'orchestrateur de réponse : le seul endroit par où une réponse sort.
 *
 * LE DÉFAUT QU'IL CORRIGE
 * ------------------------
 * L'assistant répondait deux fois — une réponse écrite, puis une note vocale
 * redisant la même chose. La cause n'était pas un module fautif mais l'absence
 * de décision centrale : le moteur appelait `sendText` depuis une quinzaine
 * d'endroits, et le porte-voix doublait chacun de ces appels. Personne ne
 * décidait du format ; le format était un effet de bord.
 *
 * POURQUOI UN PROXY, ET NON QUINZE MODIFICATIONS
 * -----------------------------------------------
 * `avecOrchestrateur(provider)` rend un transport équivalent qui intercepte
 * `sendText`. Les quinze appels du moteur passent donc tous par ici, sans en
 * modifier un seul — et sans risquer d'en oublier un, ce qui laisserait un
 * chemin d'envoi hors contrôle. Le test de régression vérifie d'ailleurs qu'il
 * n'existe aucun chemin parallèle.
 *
 * CE QU'IL GARANTIT
 * ------------------
 * 1. UNE réponse logique donne UN envoi. Le mode par défaut est le texte seul.
 * 2. Aucune synthèse vocale n'est lancée si le mode ne la demande pas : on ne
 *    jette pas 600 ms de calcul pour un fichier qu'on n'enverra pas.
 * 3. Les réponses d'une même conversation sont sérialisées ; deux conversations
 *    n'attendent pas l'une l'autre.
 * 4. Un doublon est refusé, pas renvoyé.
 * 5. Les indicateurs d'activité sont arrêtés sur TOUS les chemins de sortie,
 *    succès comme erreur.
 * 6. « Accepté » n'est jamais présenté comme « livré ».
 *
 * CE QU'IL NE FAIT PAS
 * ---------------------
 * Il n'ajoute aucun délai décoratif. Un délai n'est justifié que par un travail
 * réel ; faire patienter une réponse prête, ou imiter une vitesse de frappe
 * humaine, dégraderait le service sans rien apprendre à personne.
 */
import { createHash } from "node:crypto";

import { IdempotencyStore } from "../idempotency.js";
import { MODES, MODE_DEFAUT, deciderSortie, normaliserMode, preferencePosee } from "./politique-sortie.js";
import { resumerErreur } from "../erreurs.js";

/** Les états d'une réponse, nommés une fois pour toutes. */
export const ETATS = Object.freeze({
  GENEREE: "reponse_generee",
  FILTREE: "reponse_filtree",
  AUTORISEE: "reponse_autorisee",
  ACCEPTEE: "envoi_accepte",
  REFUSEE: "envoi_refuse",
  IGNOREE: "reponse_ignoree",
});

/** Les décisions que l'orchestrateur peut rendre. */
export const DECISIONS = Object.freeze({
  ENVOYER: "envoyer",
  DOUBLON: "doublon_ignore",
  OBSOLETE: "reponse_obsolete",
  VIDE: "reponse_vide",
  TRANSPORT_INDISPONIBLE: "transport_indisponible",
  DESTINATAIRE_INVALIDE: "destinataire_invalide",
});

/** Une empreinte courte du contenu : deux réponses identiques se reconnaissent. */
const empreinte = (texte) => createHash("sha256").update(String(texte ?? "")).digest("hex").slice(0, 16);

export class OrchestrateurReponse {
  /**
   * @param {object} o
   * @param {object} o.provider  le transport réel
   * @param {object} [o.presence]  ControleurPresence, ou rien
   * @param {{parler:Function}} [o.voix]  production vocale (voir porte-voix.fabriquerVoix)
   * @param {string} [o.modeDefaut]
   * @param {string[]} [o.rolesVoix]  rôles autorisés à recevoir de la voix
   */
  constructor({
    provider,
    presence = null,
    voix = null,
    idempotence = new IdempotencyStore(),
    modeDefaut = process.env.AGENT_REPONSE_VOCALE ?? MODE_DEFAUT,
    rolesVoix = (process.env.AGENT_VOIX_ROLES ?? "SUPER_ADMIN").split(",").map((r) => r.trim()).filter(Boolean),
    /**
     * Seconde source pour le rôle du destinataire.
     *
     * Le moteur dépose le rôle qu'il a résolu (`contexteReponse`), et c'est la
     * source la plus sûre. Mais tous les envois ne passent pas par lui — les
     * notifications aux responsables, par exemple. Sans ce repli, un
     * destinataire parfaitement connu du magasin d'identités serait traité
     * comme inconnu.
     */
    roleDe = null,
    journal = null,
    horloge = () => Date.now(),
  } = {}) {
    this._provider = provider;
    this._presence = presence;
    this._voix = voix;
    this._vus = idempotence;
    this._modeDefaut = normaliserMode(modeDefaut) ?? MODE_DEFAUT;
    this._rolesVoix = rolesVoix;
    this._roleDe = roleDe;
    this._journal = journal;
    this._horloge = horloge;

    /** Contexte par conversation : rôle, langue, préférence, dernier entrant. */
    this._contextes = new Map();
    /** Une réponse à la fois par conversation ; les conversations sont isolées. */
    this._files = new Map();
    /** L'indicateur en cours par conversation, pour l'arrêter d'où qu'on sorte. */
    this._indicateurs = new Map();

    this.metriques = {
      demandes: 0,
      envoyees: 0,
      doublons: 0,
      obsoletes: 0,
      vides: 0,
      echecs: 0,
      parMode: { [MODES.TEXTE]: 0, [MODES.VOIX]: 0, [MODES.TEXTE_ET_VOIX]: 0 },
      msAttenteFile: 0,
      msTraitement: 0,
    };
  }

  _tracer(champs) {
    try {
      this._journal?.({ type: "orchestrateur", ...champs });
    } catch {
      /* un journal qui échoue ne doit pas emporter la réponse */
    }
  }

  _contexte(jid) {
    if (!this._contextes.has(jid)) {
      this._contextes.set(jid, { role: null, langue: null, preference: null, dernierEntrant: null });
    }
    return this._contextes.get(jid);
  }

  /**
   * Ce que seul le moteur sait : le rôle derrière le JID, la langue entendue,
   * et l'identifiant du dernier message reçu.
   *
   * Le rôle est indispensable depuis la migration LID : le JID qui écrit n'est
   * plus un numéro, et chercher le rôle depuis le seul JID conclurait
   * « inconnu » pour tout le monde.
   */
  contexte(jid, { role = null, langue = null, preference = null, dernierEntrant = null } = {}) {
    const c = this._contexte(jid);
    if (role) c.role = role;
    if (langue === "fr" || langue === "ar") c.langue = langue;
    if (preference !== null) {
      const m = normaliserMode(preference);
      if (m) c.preference = m;
    }
    if (dernierEntrant) c.dernierEntrant = dernierEntrant;
    // La langue sert aussi à la synthèse, qui la lit dans sa propre table.
    if ((langue === "fr" || langue === "ar") && this._voix?.langues) this._voix.langues.set(jid, langue);
    return { ...c };
  }

  /**
   * Enregistre une préférence que l'utilisateur a POSÉE lui-même.
   *
   * « Réponds-moi toujours par une note vocale » règle la conversation. Une
   * demande ponctuelle, elle, ne règle rien : la déduire en préférence ferait
   * parler l'assistant pour toujours après une seule phrase.
   */
  apprendrePreference(jid, texteUtilisateur) {
    const posee = preferencePosee(texteUtilisateur);
    if (!posee) return null;
    this._contexte(jid).preference = posee.mode;
    this._tracer({ evenement: "preference_posee", mode: posee.mode, raison: posee.raison });
    return posee;
  }

  /**
   * Le traitement commence RÉELLEMENT : on peut montrer une activité.
   *
   * À appeler quand le travail démarre — pas à la réception du message, sinon
   * l'indicateur mentirait pendant la file d'attente.
   */
  async commencerTraitement(jid, { run = null } = {}) {
    if (!this._presence || !jid) return () => {};
    try {
      const arreter = await this._presence.frappe(jid, { run });
      this._indicateurs.set(jid, arreter);
      return arreter;
    } catch {
      return () => {};
    }
  }

  /** Arrête l'indicateur de cette conversation, d'où qu'on sorte. Idempotent. */
  async _arreterIndicateur(jid) {
    const arreter = this._indicateurs.get(jid);
    this._indicateurs.delete(jid);
    if (arreter) await Promise.resolve(arreter()).catch(() => {});
  }

  /**
   * Le destinataire est-il dans le périmètre de la voix ?
   *
   * Le rôle déposé par le moteur d'abord, le magasin d'identités ensuite. Un
   * rôle introuvable vaut « non » : dans le doute, c'est un parent ou un numéro
   * non lié, et lui envoyer une note vocale serait une décision de direction,
   * pas un effet de bord.
   */
  _roleDuDestinataire(jid, contexte) {
    let role = contexte.role;
    if (!role && this._roleDe) {
      try {
        role = this._roleDe(jid) ?? null;
      } catch {
        role = null;
      }
    }
    return Boolean(role && this._rolesVoix.includes(role));
  }

  /**
   * La décision, avant tout envoi. Pure : elle ne parle à personne.
   *
   * Séparée de l'exécution pour être testable seule, et pour que le journal
   * puisse dire POURQUOI une réponse n'est pas partie.
   */
  filtrer({ jid, texte, idMessage = null, mode = null, demande = "" }) {
    if (!jid || typeof jid !== "string") {
      return { decision: DECISIONS.DESTINATAIRE_INVALIDE, etat: ETATS.REFUSEE };
    }
    const t = String(texte ?? "").trim();
    if (!t) return { decision: DECISIONS.VIDE, etat: ETATS.IGNOREE };

    const contexte = this._contexte(jid);

    // OBSOLESCENCE : une réponse à une demande dépassée ne doit pas partir.
    //
    // Si un message plus récent est arrivé dans cette conversation pendant que
    // celle-ci se préparait, répondre à l'ancienne sèmerait la confusion.
    if (idMessage && contexte.dernierEntrant && idMessage !== contexte.dernierEntrant) {
      return { decision: DECISIONS.OBSOLETE, etat: ETATS.IGNOREE, dernierEntrant: contexte.dernierEntrant };
    }

    // DOUBLON : même message entrant, même contenu de réponse.
    const clef = `rep:${idMessage ?? "sans-id"}:${empreinte(t)}`;
    if (this._vus.seen(clef)) {
      return { decision: DECISIONS.DOUBLON, etat: ETATS.IGNOREE, clef };
    }

    // LE FORMAT, décidé une seule fois, ici.
    const voixDisponible = Boolean(this._voix?.parler);
    const demandee = normaliserMode(mode);
    const sortie = demandee
      ? { mode: demandee, raison: "mode_impose_par_l_appelant" }
      : deciderSortie({
          texteUtilisateur: demande,
          preference: contexte.preference,
          defaut: this._modeDefaut,
          voixDisponible,
        });

    // PÉRIMÈTRE : la voix ne part pas vers n'importe qui. Un destinataire dont
    // le rôle est inconnu est, dans le doute, un parent ou un numéro non lié.
    let modeFinal = sortie.mode;
    let raison = sortie.raison;
    if (modeFinal !== MODES.TEXTE) {
      if (!voixDisponible) {
        modeFinal = MODES.TEXTE;
        raison = "repli_voix_indisponible";
      } else if (!this._roleDuDestinataire(jid, contexte)) {
        modeFinal = MODES.TEXTE;
        raison = "repli_hors_perimetre_voix";
      }
    }

    return { decision: DECISIONS.ENVOYER, etat: ETATS.AUTORISEE, mode: modeFinal, raison, clef, texte: t };
  }

  /**
   * Envoie UNE réponse logique, et rend ce qui a réellement été fait.
   *
   * Sérialisé par conversation : deux réponses concurrentes dans la même
   * conversation arriveraient dans un ordre arbitraire.
   */
  async repondre({ jid, texte, idMessage = null, run = null, mode = null, demande = "" } = {}) {
    this.metriques.demandes += 1;
    const entreeFile = this._horloge();

    const precedent = this._files.get(jid) ?? Promise.resolve();
    const courant = precedent.then(() => this._executer({ jid, texte, idMessage, run, mode, demande, entreeFile }));
    // La file ne doit jamais se rompre sur un échec : on la poursuit toujours.
    this._files.set(jid, courant.then(() => {}, () => {}));
    return courant;
  }

  async _executer({ jid, texte, idMessage, run, mode, demande, entreeFile }) {
    const debut = this._horloge();
    this.metriques.msAttenteFile += debut - entreeFile;

    const filtre = this.filtrer({ jid, texte, idMessage, mode, demande });
    this._tracer({
      evenement: "filtre",
      run,
      decision: filtre.decision,
      etat: filtre.etat,
      mode: filtre.mode ?? null,
      raison: filtre.raison ?? null,
      msAttenteFile: debut - entreeFile,
    });

    if (filtre.decision !== DECISIONS.ENVOYER) {
      if (filtre.decision === DECISIONS.DOUBLON) this.metriques.doublons += 1;
      if (filtre.decision === DECISIONS.OBSOLETE) this.metriques.obsoletes += 1;
      if (filtre.decision === DECISIONS.VIDE) this.metriques.vides += 1;
      // Un refus doit aussi nettoyer l'indicateur : sinon la conversation
      // resterait « en train d'écrire… » pour toujours.
      await this._arreterIndicateur(jid);
      return { envoye: false, ...filtre };
    }

    // Le contenu est accepté : on le retient AVANT d'envoyer. Si l'envoi est
    // ambigu, une reprise ne doit pas le repousser une seconde fois.
    this._vus.remember(filtre.clef);

    const { mode: modeFinal, texte: contenu } = filtre;
    const resultat = { envoye: false, mode: modeFinal, raison: filtre.raison, etats: [ETATS.AUTORISEE] };

    try {
      if (modeFinal === MODES.TEXTE || modeFinal === MODES.TEXTE_ET_VOIX) {
        // L'indicateur de frappe s'arrête juste avant l'envoi : le texte part,
        // il n'est plus « en préparation ».
        await this._arreterIndicateur(jid);
        resultat.ecrit = await this._provider.sendText(jid, contenu);
        resultat.etats.push(ETATS.ACCEPTEE);
        resultat.envoye = true;
      }

      if (modeFinal === MODES.VOIX || modeFinal === MODES.TEXTE_ET_VOIX) {
        // « enregistre un audio… » : une vraie synthèse est en cours, et c'est
        // la seule situation où cet indicateur dit la vérité.
        let arreterAudio = () => {};
        if (this._presence) {
          arreterAudio = await this._presence.enregistrement(jid, { run }).catch(() => () => {});
        }
        try {
          const vocal = await this._voix.parler(jid, contenu, { run });
          resultat.vocal = vocal;
          if (vocal?.ok) {
            resultat.envoye = true;
            resultat.etats.push(ETATS.ACCEPTEE);
          } else if (modeFinal === MODES.VOIX) {
            // REPLI : une voix en panne ne doit pas produire du silence.
            resultat.ecrit = await this._provider.sendText(jid, contenu);
            resultat.repli = "texte_apres_echec_vocal";
            resultat.etats.push(ETATS.ACCEPTEE);
            resultat.envoye = true;
          }
        } finally {
          await Promise.resolve(arreterAudio()).catch(() => {});
        }
      }

      if (resultat.envoye) {
        this.metriques.envoyees += 1;
        this.metriques.parMode[modeFinal] = (this.metriques.parMode[modeFinal] ?? 0) + 1;
      }
      return resultat;
    } catch (e) {
      this.metriques.echecs += 1;
      this._tracer({ evenement: "envoi_echec", run, mode: modeFinal, raison: resumerErreur(e, { max: 200 }) });
      // L'envoi est INCERTAIN, pas raté : on ne le rejoue pas à l'aveugle. La
      // clef d'idempotence est déjà posée, et c'est volontaire.
      return { ...resultat, envoye: false, decision: DECISIONS.TRANSPORT_INDISPONIBLE, erreur: resumerErreur(e, { max: 200 }) };
    } finally {
      this.metriques.msTraitement += this._horloge() - debut;
      await this._arreterIndicateur(jid);
    }
  }

  /** Arrête tout indicateur en cours : erreur, déconnexion, arrêt du processus. */
  async nettoyer() {
    for (const jid of [...this._indicateurs.keys()]) await this._arreterIndicateur(jid);
    await this._presence?.toutArreter?.().catch(() => {});
  }

  rapport() {
    const m = this.metriques;
    return {
      ...m,
      modeDefaut: this._modeDefaut,
      msAttenteFileMoyen: m.demandes ? Math.round(m.msAttenteFile / m.demandes) : 0,
      msTraitementMoyen: m.demandes ? Math.round(m.msTraitement / m.demandes) : 0,
      tauxDoublons: m.demandes ? Number((m.doublons / m.demandes).toFixed(3)) : 0,
    };
  }
}

/**
 * Enveloppe le transport pour qu'AUCUN envoi ne puisse contourner la décision.
 *
 * Le moteur continue d'appeler `sendText` ; c'est l'orchestrateur qui décide ce
 * que cela signifie. `sendAudio` et `sendMedia` restent accessibles — la
 * production vocale en a besoin — mais ne sont plus un chemin de réponse
 * conversationnelle.
 */
export function avecOrchestrateur(provider, options = {}) {
  const orchestrateur = options.orchestrateur ?? new OrchestrateurReponse({ ...options, provider });

  return new Proxy(provider, {
    get(cible, propriete, recepteur) {
      if (propriete === "sendText") {
        return (jid, texte, extra = {}) => orchestrateur.repondre({ jid, texte, ...extra });
      }
      // Les deux noms par lesquels le moteur dépose son contexte. On garde
      // `contexteReponse` et `langueSouhaitee` pour ne rien casser.
      if (propriete === "contexteReponse") {
        return (jid, infos = {}) => orchestrateur.contexte(jid, infos);
      }
      if (propriete === "langueSouhaitee") {
        return (jid, langue) => orchestrateur.contexte(jid, { langue });
      }
      if (propriete === "orchestrateur") return orchestrateur;
      if (propriete === "metriquesReponse") return () => orchestrateur.rapport();
      // `metriquesVoix` existait avant l'orchestrateur : on continue de la
      // rendre, pour que les diagnostics en place ne se cassent pas.
      if (propriete === "metriquesVoix") {
        return () => ({ ...(options.voix?.metriques ?? {}), mode: orchestrateur.rapport().modeDefaut });
      }

      const v = Reflect.get(cible, propriete, recepteur);
      return typeof v === "function" ? v.bind(cible) : v;
    },
  });
}
