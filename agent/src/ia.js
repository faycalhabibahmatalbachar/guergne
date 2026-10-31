/**
 * Couche IA multi-fournisseurs.
 *
 * Un seul fournisseur serait un point de défaillance unique : si Groq est en
 * panne ou en quota, la supervision de l'établissement s'arrête. Le moteur
 * essaie donc les fournisseurs dans l'ordre et bascule au premier échec,
 * exactement comme le fait déjà `moov-ai` (groq → gemini → mistral → openrouter).
 *
 * Fournisseurs retenus après test réel des clés disponibles :
 *   - Groq    : LLM (`openai/gpt-oss-120b`) ET transcription (Whisper) — clé validée.
 *   - Mistral : repli LLM — clé validée (55 modèles).
 *
 * `fetch` est injectable : la logique de repli, de délai et d'analyse se teste
 * sans aucun appel réseau.
 */

const DELAI_MS = 30_000;

/** Extrait le premier objet JSON d'une réponse de modèle (souvent entourée de texte). */
export function extraireJson(texte) {
  const m = String(texte ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Définition d'un fournisseur compatible OpenAI. */
const FOURNISSEURS = {
  groq: {
    nom: "groq",
    base: "https://api.groq.com/openai/v1",
    modele: "openai/gpt-oss-120b",
    transcription: "whisper-large-v3-turbo",
  },
  mistral: {
    nom: "mistral",
    base: "https://api.mistral.ai/v1",
    modele: "mistral-small-latest",
    transcription: null, // pas de Whisper chez Mistral sur ce compte
  },
};

export class MoteurIA {
  /**
   * @param cles   { groq?: string, mistral?: string }
   * @param ordre  priorité des fournisseurs
   * @param fetch  injectable pour les tests
   * @param journal fonction (evenement) => void, pour la traçabilité
   */
  constructor({ cles = {}, ordre = ["groq", "mistral"], fetch = globalThis.fetch, journal = null } = {}) {
    this._cles = cles;
    this._ordre = ordre.filter((n) => FOURNISSEURS[n] && cles[n]);
    this._fetch = fetch;
    this._journal = journal;
    if (this._ordre.length === 0) throw new Error("MoteurIA : aucun fournisseur configuré");
  }

  /** Fournisseurs réellement utilisables, dans l'ordre d'essai. */
  get fournisseurs() {
    return [...this._ordre];
  }

  _trace(e) {
    if (this._journal) this._journal(e);
  }

  /**
   * Complétion de chat. Bascule au fournisseur suivant à la moindre erreur.
   * @returns {{texte:string, fournisseur:string, modele:string, tokens:number|null}}
   */
  async completer(messages, { json = false, temperature = 0 } = {}) {
    const erreurs = [];
    for (const nom of this._ordre) {
      const f = FOURNISSEURS[nom];
      const debut = Date.now();
      try {
        const corps = { model: f.modele, temperature, messages };
        if (json) corps.response_format = { type: "json_object" };

        const r = await this._avecDelai((signal) =>
          this._fetch(`${f.base}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${this._cles[nom]}` },
            body: JSON.stringify(corps),
            signal,
          }),
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const texte = d?.choices?.[0]?.message?.content ?? "";
        if (!texte) throw new Error("réponse vide");

        const resultat = {
          texte,
          fournisseur: nom,
          modele: f.modele,
          tokens: d?.usage?.total_tokens ?? null,
          dureeMs: Date.now() - debut,
        };
        this._trace({ type: "llm", ...resultat, erreursPrecedentes: erreurs });
        return resultat;
      } catch (e) {
        erreurs.push(`${nom}: ${e.message ?? e}`);
        this._trace({ type: "llm_echec", fournisseur: nom, erreur: String(e.message ?? e) });
      }
    }
    throw new Error(`Tous les fournisseurs IA ont échoué — ${erreurs.join(" | ")}`);
  }

  /** Complétion attendue en JSON ; renvoie null si rien d'exploitable. */
  async completerJson(messages, options = {}) {
    const r = await this.completer(messages, { ...options, json: true });
    return { ...r, objet: extraireJson(r.texte) };
  }

  /**
   * Transcription d'un message vocal. Seuls les fournisseurs qui exposent un
   * moteur de transcription sont essayés.
   * @param audio {Buffer|Blob} contenu du média
   */
  async transcrire(audio, { nomFichier = "vocal.ogg", langue = "fr" } = {}) {
    const candidats = this._ordre.filter((n) => FOURNISSEURS[n].transcription);
    if (candidats.length === 0) throw new Error("Aucun fournisseur de transcription configuré");

    const erreurs = [];
    for (const nom of candidats) {
      const f = FOURNISSEURS[nom];
      const debut = Date.now();
      try {
        const form = new FormData();
        form.append("file", audio instanceof Blob ? audio : new Blob([audio]), nomFichier);
        form.append("model", f.transcription);
        form.append("language", langue);
        form.append("response_format", "json");

        const r = await this._avecDelai((signal) =>
          this._fetch(`${f.base}/audio/transcriptions`, {
            method: "POST",
            headers: { authorization: `Bearer ${this._cles[nom]}` },
            body: form,
            signal,
          }),
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const texte = (d?.text ?? "").trim();
        if (!texte) throw new Error("transcription vide");

        const resultat = { texte, fournisseur: nom, modele: f.transcription, dureeMs: Date.now() - debut };
        this._trace({ type: "stt", ...resultat });
        return resultat;
      } catch (e) {
        erreurs.push(`${nom}: ${e.message ?? e}`);
        this._trace({ type: "stt_echec", fournisseur: nom, erreur: String(e.message ?? e) });
      }
    }
    throw new Error(`Transcription impossible — ${erreurs.join(" | ")}`);
  }

  /** Enveloppe un appel dans un délai maximal : un fournisseur muet ne doit pas bloquer l'agent. */
  async _avecDelai(appel) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);
    try {
      return await appel(ctrl.signal);
    } finally {
      clearTimeout(minuteur);
    }
  }
}
