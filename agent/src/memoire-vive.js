/**
 * Mémoire de session EN MÉMOIRE VIVE.
 *
 * POURQUOI ELLE EXISTE
 * --------------------
 * La mémoire Neon (`memory.js`) est facultative, et éteinte par défaut. Sans
 * elle, l'agent n'avait AUCUN contexte : « et les retards ? » après « les
 * absents de 6e A » redemandait la classe, et « préviens ses parents » ne
 * savait plus de qui l'on parlait. Une conversation n'était qu'une suite de
 * demandes sans lien.
 *
 * Cette mémoire donne le fil de la conversation sans rien écrire nulle part :
 * elle vit dans le processus, expire seule, et disparaît au redémarrage. Elle
 * ne remplace pas la mémoire Neon (préférences durables, reprise après
 * redémarrage) : elle est le plancher quand Neon est éteint.
 *
 * CE QU'ELLE RETIENT, ET CE QU'ELLE NE RETIENT PAS
 * -------------------------------------------------
 *   - les derniers messages DE L'UTILISATEUR (ce qu'il a lui-même écrit) ;
 *   - des réponses de l'agent, seulement les questions et la conversation —
 *     jamais le contenu d'une consultation ;
 *   - le FOYER : les entités dont on parle (classe, période, élève, ensemble
 *     d'élèves du dernier résultat), sous forme d'IDENTIFIANTS. Les noms ne
 *     sont pas conservés ici : ils sont relus au backend quand il le faut,
 *     donc toujours sous les droits de l'acteur au moment de la relecture.
 *
 * LA MÉMOIRE N'EST PAS UN DROIT
 * ------------------------------
 * Une conversation appartient à UN acteur sur UN numéro. Un identifiant gardé
 * au foyer n'ouvre rien : il repasse par l'outil, donc par le pré-filtre de
 * permission et par le garde du backend, comme s'il venait d'être dicté.
 */

const TRENTE_MINUTES = 30 * 60 * 1000;
const MAX_TOURS = 10;
const MAX_ELEVES_FOYER = 80;
const MAX_CONVERSATIONS = 500;

export class MemoireVive {
  enabled = true;
  /** Marqueur : le moteur sait que rien n'est persisté. */
  volatile = true;

  constructor({ ttlMs = TRENTE_MINUTES, maintenant = () => Date.now() } = {}) {
    this._ttlMs = ttlMs;
    this._maintenant = maintenant;
    /** @type {Map<string, object>} */
    this._conversations = new Map();
    this._faits = new Map(); // actorId -> Map(key -> fait)
  }

  _cle(actorId, jid) {
    return `${actorId}|${jid}`;
  }

  _conversation(cle) {
    const t = this._maintenant();
    let c = this._conversations.get(cle);
    // Un fil resté muet plus longtemps que le délai est PÉRIMÉ : on repart de
    // zéro plutôt que de rattacher « et les retards ? » à une classe évoquée
    // la veille.
    if (c && t - c.vuLe > this._ttlMs) c = null;
    if (!c) {
      c = { tours: [], pending: null, lastTask: null, foyer: null, vuLe: t };
      if (this._conversations.size >= MAX_CONVERSATIONS) {
        const [ancienne] = this._conversations.keys();
        this._conversations.delete(ancienne);
      }
      this._conversations.set(cle, c);
    }
    c.vuLe = t;
    return c;
  }

  async ping() {
    return true;
  }

  async prepare({ actorId, jid } = {}) {
    if (!actorId || !jid) throw new Error("Identité authentifiée et JID requis pour ouvrir une mémoire.");
    const cle = this._cle(actorId, jid);
    const c = this._conversation(cle);
    return {
      conversationId: cle,
      actorId,
      history: c.tours.map((x) => ({ role: x.role, content: x.content })),
      pending: c.pending,
      summaries: [],
      facts: [...(this._faits.get(actorId)?.values() ?? [])],
      lastTask: c.lastTask,
      foyer: c.foyer,
    };
  }

  _ajouter(session, role, content) {
    const c = this._conversations.get(session?.conversationId);
    if (!c || typeof content !== "string" || !content.trim()) return;
    c.tours.push({ role, content: content.slice(0, 1_500) });
    if (c.tours.length > MAX_TOURS) c.tours.splice(0, c.tours.length - MAX_TOURS);
  }

  /** Le message de l'utilisateur : ce qu'il a écrit lui-même, gardé le temps du fil. */
  async annotateInbound({ session, text = "" } = {}) {
    this._ajouter(session, "user", text);
  }

  /**
   * Une réponse de l'agent. Seules celles marquées `retainContent` entrent
   * dans le fil : conversation et questions de clarification. Le rendu d'une
   * consultation — des noms, des notes, des soldes — n'y entre jamais.
   */
  async appendMessage({ session, text = "", direction = "outbound", retainContent = false, fil = false, tool = null } = {}) {
    if (direction !== "outbound") return;
    if (retainContent || fil) this._ajouter(session, "assistant", text);
    else if (tool) this._ajouter(session, "assistant", `(consultation effectuee : ${tool})`);
  }

  async saveLastTask(session, { tool, params = {} } = {}) {
    const c = this._conversations.get(session?.conversationId);
    if (!c) return;
    c.lastTask = { tool, params: { ...params }, updatedAt: new Date(this._maintenant()).toISOString() };
  }

  /**
   * Le foyer : de quoi l'on parle. Fusionné, pas remplacé — consulter les
   * retards d'une classe ne fait pas oublier l'élève dont on regardait la fiche.
   */
  async saveFocus(session, foyer = {}) {
    const c = this._conversations.get(session?.conversationId);
    if (!c || !foyer || typeof foyer !== "object") return;
    const suivant = { ...(c.foyer ?? {}) };
    for (const cle of ["classeId", "periodeId", "eleveId", "tuteurId", "depuis", "jusqua", "outil"]) {
      if (foyer[cle] !== undefined) suivant[cle] = foyer[cle];
    }
    if (Array.isArray(foyer.eleveIds)) {
      suivant.eleveIds = [...new Set(foyer.eleveIds)].slice(0, MAX_ELEVES_FOYER);
      suivant.eleveIdsTronques = foyer.eleveIds.length > MAX_ELEVES_FOYER || foyer.eleveIdsTronques === true;
      suivant.origineEleves = foyer.origineEleves ?? foyer.outil ?? null;
    }
    suivant.majLe = this._maintenant();
    c.foyer = suivant;
  }

  async saveState(session, etat = {}) {
    const c = this._conversations.get(session?.conversationId);
    if (c) c.pending = { ...etat };
  }

  async clearState(session) {
    const c = this._conversations.get(session?.conversationId);
    if (c) c.pending = null;
  }

  /** Ferme le fil : tours, dernière consultation, foyer, attente. Les préférences restent. */
  async resetFil(session) {
    const c = this._conversations.get(session?.conversationId ?? session?.viveId);
    if (!c) return;
    c.tours = [];
    c.pending = null;
    c.lastTask = null;
    c.foyer = null;
  }

  async saveFact({ actorId, category, key, value } = {}) {
    if (!this._faits.has(actorId)) this._faits.set(actorId, new Map());
    this._faits.get(actorId).set(key, { category, key, value, actorId });
  }

  async listFacts(actorId) {
    return [...(this._faits.get(actorId)?.values() ?? [])];
  }

  async forgetActor(actorId) {
    const facts = this._faits.get(actorId)?.size ?? 0;
    this._faits.delete(actorId);
    let conversations = 0;
    for (const cle of [...this._conversations.keys()]) {
      if (cle.startsWith(`${actorId}|`)) {
        this._conversations.delete(cle);
        conversations += 1;
      }
    }
    return { summaries: 0, facts, conversations };
  }

  /** Supervision : combien de fils ouverts, combien de confirmations en attente. */
  etat() {
    const t = this._maintenant();
    let actives = 0;
    let enAttente = 0;
    for (const c of this._conversations.values()) {
      if (t - c.vuLe > this._ttlMs) continue;
      actives += 1;
      if (c.pending) enAttente += 1;
    }
    return { conversationsActives: actives, etatsEnAttente: enAttente };
  }

  async close() {
    this._conversations.clear();
  }
}
