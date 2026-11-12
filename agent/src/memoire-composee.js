/**
 * La mémoire d'une conversation, en deux étages.
 *
 *   VIVE     (`memoire-vive.js`)  le fil immédiat : les derniers messages de
 *            l'utilisateur, les questions de l'agent. En mémoire vive
 *            uniquement, une demi-heure. Ce qui a été ÉCRIT par une personne
 *            ne va jamais en base.
 *
 *   DURABLE  (`memory.js`, Neon)  ce qui doit survivre à un redémarrage : la
 *            question ou la confirmation en attente (avec son empreinte et son
 *            expiration), la dernière consultation et le foyer — des
 *            RÉFÉRENCES chiffrées, jamais une donnée scolaire —, et les
 *            préférences que l'utilisateur a demandé de retenir.
 *
 * Tant que le processus vit, l'étage vif répond. Après un redémarrage il est
 * vide : l'étage durable rend alors l'attente, la dernière consultation et le
 * foyer, et la conversation reprend — sans l'historique des phrases, qui
 * n'existe plus nulle part, mais avec tout ce qu'il faut pour comprendre « et
 * les retards ? » ou un « oui ».
 *
 * L'ISOLEMENT est celui de l'étage durable : une conversation est la paire
 * (acteur authentifié, numéro), et `prepare` refuse de rendre une conversation
 * dont l'acteur a changé. La clé n'est jamais choisie par le modèle : elle
 * vient de l'identité que le moteur a vérifiée.
 */
export class MemoireComposee {
  enabled = true;

  /**
   * @param {object} o
   * @param {object} o.vive     MemoireVive
   * @param {object} o.durable  NeonConversationMemory
   * @param {(e:object)=>void} [o.journal]
   */
  constructor({ vive, durable, journal = null }) {
    if (!vive || !durable) throw new Error("MemoireComposee : les deux étages sont requis");
    this._vive = vive;
    this._durable = durable;
    this._journal = journal;
  }

  async ping() {
    return this._durable.ping();
  }

  async prepare(args = {}) {
    const v = await this._vive.prepare(args);
    let d = null;
    try {
      d = await this._durable.prepare(args);
    } catch (e) {
      // L'étage durable en panne ne coupe pas la conversation : on continue sur
      // l'étage vif, et on le dit au journal.
      this._journal?.({ type: "memoire_durable_indisponible", code: e?.code ?? "inconnu" });
    }
    const repriseApresRedemarrage = Boolean(d) && !v.history.length && !v.lastTask && !v.foyer && Boolean(d.lastTask || d.foyer || d.pending);
    if (repriseApresRedemarrage) {
      // L'étage vif retrouve ce que le durable a gardé : la suite de la
      // conversation n'aura plus besoin de le relire.
      const sv = { conversationId: v.conversationId };
      if (d.lastTask) await this._vive.saveLastTask(sv, d.lastTask);
      if (d.foyer) await this._vive.saveFocus(sv, d.foyer);
      if (d.pending) await this._vive.saveState(sv, d.pending);
      this._journal?.({ type: "memoire_reprise", tache: Boolean(d.lastTask), foyer: Boolean(d.foyer), attente: d.pending?.intention ?? null });
    }
    return {
      conversationId: d?.conversationId ?? v.conversationId,
      viveId: v.conversationId,
      durable: d,
      actorId: args.actorId,
      history: v.history.length ? v.history : (d?.history ?? []),
      // Une attente lue sur l'étage vif est la plus récente ; à défaut, celle
      // que le durable a conservée.
      pending: v.pending ?? d?.pending ?? null,
      summaries: d?.summaries ?? [],
      facts: d?.facts ?? v.facts ?? [],
      lastTask: v.lastTask ?? d?.lastTask ?? null,
      foyer: v.foyer ?? d?.foyer ?? null,
      reprise: repriseApresRedemarrage,
    };
  }

  _v(session) {
    return { conversationId: session?.viveId };
  }

  async _d(nom, session, ...args) {
    if (!session?.durable) return;
    try {
      // La session du durable porte son propre état (foyer, dernière tâche).
      await this._durable[nom](session.durable, ...args);
    } catch (e) {
      this._journal?.({ type: "memoire_durable_echec", operation: nom, code: e?.code ?? "inconnu" });
    }
  }

  async annotateInbound(a = {}) {
    await this._vive.annotateInbound({ ...a, session: this._v(a.session) });
    if (a.session?.durable) {
      try {
        await this._durable.annotateInbound({ ...a, session: a.session.durable });
      } catch (e) {
        this._journal?.({ type: "memoire_durable_echec", operation: "annotateInbound", code: e?.code ?? "inconnu" });
      }
    }
  }

  async appendMessage(a = {}) {
    await this._vive.appendMessage({ ...a, session: this._v(a.session) });
    if (a.session?.durable) {
      try {
        await this._durable.appendMessage({ ...a, session: a.session.durable });
      } catch (e) {
        this._journal?.({ type: "memoire_durable_echec", operation: "appendMessage", code: e?.code ?? "inconnu" });
      }
    }
  }

  async saveLastTask(session, tache) {
    await this._vive.saveLastTask(this._v(session), tache);
    await this._d("saveLastTask", session, tache);
  }

  async saveFocus(session, foyer) {
    await this._vive.saveFocus(this._v(session), foyer);
    await this._d("saveFocus", session, foyer);
  }

  async saveState(session, etat) {
    await this._vive.saveState(this._v(session), etat);
    await this._d("saveState", session, etat);
  }

  async clearState(session) {
    await this._vive.clearState(this._v(session));
    await this._d("clearState", session);
  }

  async resetFil(session) {
    await this._vive.resetFil(this._v(session));
    await this._d("resetFil", session);
  }

  saveFact(f) {
    return this._durable.saveFact(f);
  }

  listFacts(actorId) {
    return this._durable.listFacts(actorId);
  }

  async forgetActor(actorId) {
    await this._vive.forgetActor(actorId);
    return this._durable.forgetActor(actorId);
  }

  saveSummary(a) {
    return this._durable.saveSummary(a);
  }

  etat() {
    return { ...this._vive.etat(), durable: true };
  }

  async close() {
    await this._vive.close();
    await this._durable.close?.();
  }
}
