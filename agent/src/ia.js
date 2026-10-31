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

/** Durée de mise à l'écart par défaut quand un fournisseur rend 429 sans `Retry-After`. */
const COOLDOWN_DEFAUT_MS = 60_000;
/** Tentatives maximales sur un même fournisseur pour une erreur transitoire. */
const TENTATIVES_TRANSITOIRES = 3;

/**
 * Classe une erreur de fournisseur. La distinction est décisive :
 * - `fatal` (401/403) : la clé est mauvaise. Réessayer est inutile et ne fait
 *   que perdre du temps à chaque message — le fournisseur est écarté.
 * - `quota` (429) : le fournisseur est joignable mais nous limite. On le met en
 *   cooldown, en respectant `Retry-After` quand il l'indique.
 * - `transitoire` (5xx, réseau, délai) : on réessaie avec un recul croissant.
 */
export function classerErreur(statut) {
  if (statut === 401 || statut === 403) return "fatal";
  if (statut === 429) return "quota";
  return "transitoire";
}

/** Recul exponentiel bruité : le bruit évite que plusieurs messages réessaient en même temps. */
export function reculMs(tentative, base = 300, alea = Math.random) {
  const plafond = base * 2 ** (tentative - 1);
  return Math.round(plafond / 2 + alea() * (plafond / 2));
}

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
  constructor({
    cles = {},
    ordre = ["groq", "mistral"],
    fetch = globalThis.fetch,
    journal = null,
    horloge = () => Date.now(),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    alea = Math.random,
  } = {}) {
    this._cles = cles;
    this._ordre = ordre.filter((n) => FOURNISSEURS[n] && cles[n]);
    this._fetch = fetch;
    this._journal = journal;
    this._horloge = horloge;
    this._pause = pause;
    this._alea = alea;
    /** Disjoncteur par fournisseur : { ecarte: bool, jusqua: ms } */
    this._etat = Object.fromEntries(this._ordre.map((n) => [n, { ecarte: false, jusqua: 0 }]));
    if (this._ordre.length === 0) throw new Error("MoteurIA : aucun fournisseur configuré");
  }

  /** Fournisseurs configurés, dans l'ordre d'essai. */
  get fournisseurs() {
    return [...this._ordre];
  }

  /** Fournisseurs réellement disponibles maintenant (ni écartés, ni en cooldown). */
  get disponibles() {
    const t = this._horloge();
    return this._ordre.filter((n) => !this._etat[n].ecarte && this._etat[n].jusqua <= t);
  }

  /** État du disjoncteur, pour la supervision. */
  get etatFournisseurs() {
    const t = this._horloge();
    return Object.fromEntries(
      this._ordre.map((n) => [
        n,
        { ecarte: this._etat[n].ecarte, cooldownRestantMs: Math.max(0, this._etat[n].jusqua - t) },
      ]),
    );
  }

  /** Applique la conséquence d'une erreur sur le disjoncteur du fournisseur. */
  _sanctionner(nom, categorie, retryApresMs) {
    const e = this._etat[nom];
    if (categorie === "fatal") {
      e.ecarte = true;
      this._trace({ type: "fournisseur_ecarte", fournisseur: nom, raison: "authentification" });
    } else if (categorie === "quota") {
      e.jusqua = this._horloge() + (retryApresMs ?? COOLDOWN_DEFAUT_MS);
      this._trace({ type: "fournisseur_cooldown", fournisseur: nom, dureeMs: retryApresMs ?? COOLDOWN_DEFAUT_MS });
    }
  }

  /** Lit `Retry-After` (secondes ou date HTTP) et le convertit en millisecondes. */
  _retryApres(reponse) {
    const v = reponse?.headers?.get?.("retry-after");
    if (!v) return null;
    const secondes = Number(v);
    if (Number.isFinite(secondes)) return Math.max(0, secondes * 1000);
    const date = Date.parse(v);
    return Number.isNaN(date) ? null : Math.max(0, date - this._horloge());
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
      const e = this._etat[nom];
      if (e.ecarte) {
        erreurs.push(`${nom}: écarté (authentification)`);
        continue;
      }
      if (e.jusqua > this._horloge()) {
        erreurs.push(`${nom}: en cooldown`);
        continue;
      }

      const f = FOURNISSEURS[nom];
      for (let tentative = 1; tentative <= TENTATIVES_TRANSITOIRES; tentative++) {
        const debut = this._horloge();
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
          if (!r.ok) {
            const categorie = classerErreur(r.status);
            this._sanctionner(nom, categorie, categorie === "quota" ? this._retryApres(r) : null);
            const err = new Error(`HTTP ${r.status}`);
            err.categorie = categorie;
            throw err;
          }
          const d = await r.json();
          const texte = d?.choices?.[0]?.message?.content ?? "";
          if (!texte) throw Object.assign(new Error("réponse vide"), { categorie: "transitoire" });

          const resultat = {
            texte,
            fournisseur: nom,
            modele: f.modele,
            tokens: d?.usage?.total_tokens ?? null,
            dureeMs: this._horloge() - debut,
            tentatives: tentative,
          };
          this._trace({ type: "llm", ...resultat, erreursPrecedentes: erreurs });
          return resultat;
        } catch (err) {
          const categorie = err.categorie ?? "transitoire";
          erreurs.push(`${nom}: ${err.message ?? err}`);
          this._trace({ type: "llm_echec", fournisseur: nom, categorie, tentative, erreur: String(err.message ?? err) });

          // Une clé invalide ou un quota atteint ne se résolvent pas en
          // réessayant tout de suite : on passe au fournisseur suivant.
          if (categorie !== "transitoire") break;
          if (tentative < TENTATIVES_TRANSITOIRES) await this._pause(reculMs(tentative, 300, this._alea));
        }
      }
    }
    throw Object.assign(new Error(`Aucun fournisseur IA disponible — ${erreurs.join(" | ")}`), {
      code: "IA_INDISPONIBLE",
      detail: erreurs,
    });
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
