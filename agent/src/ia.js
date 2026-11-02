/**
 * Couche IA multi-fournisseurs.
 *
 * Un seul fournisseur serait un point de défaillance unique : si Groq est en
 * panne ou en quota, la supervision de l'établissement s'arrête. Le moteur
 * essaie donc les fournisseurs dans l'ordre et bascule au premier échec.
 *
 * QUATRE FOURNISSEURS, ET UN PIÈGE DE NOMMAGE
 * --------------------------------------------
 * `Groq` (api.groq.com, inférence rapide de modèles ouverts) et `Grok`
 * (api.x.ai, le modèle de xAI) sont deux produits différents, d'entreprises
 * différentes, qui ne diffèrent que par une lettre. Le fichier de clés local
 * nomme d'ailleurs `grok_api` une clé qui est en réalité une clé **Groq**.
 * Le moteur sépare donc strictement `groq` et `xai`, et `configurerDepuisEnv`
 * refuse de prendre une même valeur pour les deux.
 *
 * CE QUI EST VÉRIFIÉ, ET CE QUI NE L'EST PAS
 * -------------------------------------------
 * Une clé présente ne prouve rien. Le moteur distingue donc :
 *   configuré    — une clé existe ;
 *   authentifié  — un appel réel a été accepté (ou refusé en 401/403) ;
 *   disponible   — ni écarté, ni en cooldown ;
 *   limité       — 429, cooldown en cours ;
 *   en erreur    — dernier appel en échec transitoire ;
 *   désactivé    — exclu par la configuration.
 * `etatFournisseurs` expose ces états, et `/sante` les publie.
 *
 * TRANSCRIPTION : UN MÉCANISME DE SÉLECTION À PART
 * -------------------------------------------------
 * La transcription ne suit pas l'ordre des LLM. Seuls les fournisseurs qui
 * exposent réellement un point de transcription compatible OpenAI sont essayés.
 * À ce jour, un seul le fait : Groq (Whisper). xAI propose bien de la
 * reconnaissance vocale, mais sur `POST /v1/stt`, qui n'a ni la même forme de
 * requête ni la même réponse — le prétendre compatible produirait un échec au
 * premier message vocal. OpenRouter n'en documente aucune.
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

/**
 * Catalogue des fournisseurs, tous compatibles OpenAI sur `/chat/completions`.
 *
 * Les modèles par défaut ont été retenus après interrogation de `GET /models`
 * avec les comptes réels — pas d'après une documentation, qui peut décrire des
 * modèles auxquels le compte n'a pas droit. Chacun est surchargeable par
 * variable d'environnement (`GROQ_MODEL`, `MISTRAL_MODEL`, `XAI_MODEL`,
 * `OPENROUTER_MODEL`), sans retoucher le code.
 */
export const FOURNISSEURS = {
  groq: {
    nom: "groq",
    base: "https://api.groq.com/openai/v1",
    modele: "openai/gpt-oss-120b", // présent dans GET /models du compte
    transcription: "whisper-large-v3-turbo", // présent dans GET /models du compte
    jsonNatif: true,
    champMaxTokens: "max_tokens",
  },
  xai: {
    nom: "xai",
    base: "https://api.x.ai/v1",
    // `grok-4.3` : le moins cher des modèles généralistes encore listés au
    // tarif xAI. Les anciens identifiants (`grok-4`, `grok-3-mini`) ont
    // disparu du tableau et ne doivent pas être utilisés.
    modele: "grok-4.3",
    // La reconnaissance vocale de xAI vit sur `POST /v1/stt`, de forme
    // différente : non branchée ici, et surtout pas annoncée comme compatible.
    transcription: null,
    // La documentation de xAI ne confirme pas `response_format:json_object` :
    // on ne l'envoie donc pas, et on s'appuie sur `extraireJson`.
    jsonNatif: false,
    // `max_tokens` est marqué obsolète côté xAI.
    champMaxTokens: "max_completion_tokens",
  },
  openrouter: {
    nom: "openrouter",
    base: "https://openrouter.ai/api/v1",
    modele: "openai/gpt-oss-120b", // même modèle que Groq : un repli sans surprise de comportement
    transcription: null, // aucun point de transcription documenté
    jsonNatif: true,
    champMaxTokens: "max_tokens",
    // En-têtes d'attribution, facultatifs côté OpenRouter mais recommandés.
    entetes: {
      "HTTP-Referer": "https://lycee-guergne.local/agent",
      "X-Title": "Agent Lycee Guergne",
    },
  },
  mistral: {
    nom: "mistral",
    base: "https://api.mistral.ai/v1",
    modele: "mistral-small-latest", // présent dans GET /models du compte
    transcription: null, // pas de Whisper chez Mistral sur ce compte
    jsonNatif: true,
    champMaxTokens: "max_tokens",
  },
};

/** Ordre par défaut : le plus rapide d'abord, le plus large en repli. */
export const ORDRE_DEFAUT = ["groq", "xai", "openrouter", "mistral"];

/** Nom d'environnement de la clé de chaque fournisseur, et ses alias tolérés. */
const CLES_ENV = {
  groq: ["GROQ_API_KEY"],
  xai: ["XAI_API_KEY", "GROK_API_KEY"], // `GROK_API_KEY` : alias de compatibilité
  openrouter: ["OPENROUTER_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
};

const MODELES_ENV = {
  groq: "GROQ_MODEL",
  xai: "XAI_MODEL",
  openrouter: "OPENROUTER_MODEL",
  mistral: "MISTRAL_MODEL",
};

/**
 * Normalise une configuration d'environnement vers les paramètres du moteur.
 *
 * Fonction pure, qui prend l'environnement en argument : elle se teste sans
 * toucher à `process.env`, et ne révèle jamais une valeur de clé — seulement
 * des noms de variables.
 *
 * @param {Record<string,string|undefined>} env
 * @returns {{cles:object, modeles:object, ordre:string[], desactives:string[], presents:string[], avertissements:string[]}}
 */
export function configurerDepuisEnv(env = {}) {
  const cles = {};
  const avertissements = [];

  for (const [nom, noms] of Object.entries(CLES_ENV)) {
    for (const variable of noms) {
      const v = env[variable];
      if (v && String(v).trim()) {
        if (cles[nom]) {
          avertissements.push(`${nom} : plusieurs variables de cle fournies (${noms.join(", ")}) — la premiere est retenue`);
          break;
        }
        cles[nom] = String(v).trim();
      }
    }
  }

  // Le piège Groq / Grok : une même valeur dans les deux cases signifie que la
  // clé Groq a été recopiée dans la case xAI. Deux fournisseurs porteraient
  // alors la même clé, et xAI répondrait 401 à chaque message.
  if (cles.groq && cles.xai && cles.groq === cles.xai) {
    delete cles.xai;
    avertissements.push(
      "xai : la cle fournie est identique a la cle GROQ_API_KEY — Groq et Grok (xAI) sont deux services distincts ; xai est ignore",
    );
  }

  const modeles = {};
  for (const [nom, variable] of Object.entries(MODELES_ENV)) {
    const v = env[variable];
    if (v && String(v).trim()) modeles[nom] = String(v).trim();
  }

  const liste = (v) =>
    String(v ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  const demande = liste(env.IA_ORDRE);
  const inconnus = demande.filter((n) => !FOURNISSEURS[n]);
  if (inconnus.length) avertissements.push(`IA_ORDRE : fournisseur(s) inconnu(s) ignore(s) : ${inconnus.join(", ")}`);
  // Un ordre partiel reste valable : les fournisseurs non cités passent après.
  const ordre = demande.length
    ? [...demande.filter((n) => FOURNISSEURS[n]), ...ORDRE_DEFAUT.filter((n) => !demande.includes(n))]
    : [...ORDRE_DEFAUT];

  const desactives = liste(env.IA_DESACTIVES).filter((n) => FOURNISSEURS[n]);

  return {
    cles,
    modeles,
    ordre,
    desactives,
    presents: Object.keys(cles),
    avertissements,
  };
}

export class MoteurIA {
  /**
   * @param cles       { groq?, xai?, openrouter?, mistral? }
   * @param modeles    surcharge de modèle par fournisseur
   * @param ordre      priorité des fournisseurs
   * @param desactives fournisseurs exclus malgré leur clé
   * @param fetch      injectable pour les tests
   * @param journal    fonction (evenement) => void, pour la traçabilité
   */
  constructor({
    cles = {},
    modeles = {},
    ordre = ORDRE_DEFAUT,
    desactives = [],
    fetch = globalThis.fetch,
    journal = null,
    horloge = () => Date.now(),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    alea = Math.random,
  } = {}) {
    this._cles = cles;
    this._desactives = new Set(desactives);
    this._ordre = ordre.filter((n) => FOURNISSEURS[n] && cles[n] && !this._desactives.has(n));
    this._fetch = fetch;
    this._journal = journal;
    this._horloge = horloge;
    this._pause = pause;
    this._alea = alea;

    // Catalogue effectif : le modèle configuré remplace le modèle par défaut.
    this._defs = Object.fromEntries(
      Object.entries(FOURNISSEURS).map(([n, f]) => [n, { ...f, modele: modeles[n] ?? f.modele }]),
    );

    /** Disjoncteur et métriques par fournisseur. */
    this._etat = Object.fromEntries(
      this._ordre.map((n) => [
        n,
        {
          ecarte: false,
          jusqua: 0,
          // `null` = aucun appel réel encore effectué. Une clé présente ne
          // prouve pas qu'elle est valide : on ne l'affirme qu'après un appel.
          authentifie: null,
          appels: 0,
          succes: 0,
          echecs: 0,
          tokens: 0,
          dureeCumuleeMs: 0,
          dernierCode: null,
          derniereErreur: null,
        },
      ]),
    );
    if (this._ordre.length === 0) throw new Error("MoteurIA : aucun fournisseur configuré");
  }

  /** Fournisseurs configurés, dans l'ordre d'essai. */
  get fournisseurs() {
    return [...this._ordre];
  }

  /** Modèle effectivement utilisé par un fournisseur. */
  modele(nom) {
    return this._defs[nom]?.modele ?? null;
  }

  /** Fournisseurs réellement disponibles maintenant (ni écartés, ni en cooldown). */
  get disponibles() {
    const t = this._horloge();
    return this._ordre.filter((n) => !this._etat[n].ecarte && this._etat[n].jusqua <= t);
  }

  /** Fournisseurs capables de transcription — liste volontairement distincte. */
  get transcripteurs() {
    return this._ordre.filter((n) => this._defs[n].transcription);
  }

  /**
   * Statut d'un fournisseur, selon la taxonomie de la recette.
   *
   * L'ordre des tests compte. En particulier « authentifié » l'emporte sur la
   * dernière erreur : un fournisseur qui nous a déjà répondu puis a connu un
   * 429 est de nouveau DISPONIBLE à la fin du cooldown, pas « en erreur ».
   * `erreur` est réservé au cas où l'on n'a jamais réussi à se faire
   * identifier — une panne qu'il faut distinguer d'une clé refusée.
   */
  _statut(nom) {
    const e = this._etat[nom];
    if (this._desactives.has(nom)) return "desactive";
    if (e.ecarte) return "ecarte";
    if (e.jusqua > this._horloge()) return "limite";
    if (e.authentifie === true) return "disponible";
    if (e.derniereErreur) return "erreur";
    return "configure";
  }

  /** État détaillé, pour `/sante` et pour le rapport de recette. */
  get etatFournisseurs() {
    const t = this._horloge();
    const out = {};
    for (const n of this._ordre) {
      const e = this._etat[n];
      out[n] = {
        statut: this._statut(n),
        modele: this._defs[n].modele,
        authentifie: e.authentifie,
        // Conservés pour la supervision existante.
        ecarte: e.ecarte,
        cooldownRestantMs: Math.max(0, e.jusqua - t),
        appels: e.appels,
        succes: e.succes,
        echecs: e.echecs,
        tokens: e.tokens,
        latenceMoyenneMs: e.succes ? Math.round(e.dureeCumuleeMs / e.succes) : null,
        dernierCode: e.dernierCode,
      };
    }
    // Les fournisseurs connus mais sans clé méritent d'apparaître : « absent »
    // et « en panne » ne se diagnostiquent pas de la même façon.
    for (const n of Object.keys(FOURNISSEURS)) {
      if (out[n]) continue;
      out[n] = {
        statut: this._desactives.has(n) ? "desactive" : "non_configure",
        modele: this._defs[n].modele,
        authentifie: null,
      };
    }
    return out;
  }

  /** Applique la conséquence d'une erreur sur le disjoncteur du fournisseur. */
  _sanctionner(nom, categorie, retryApresMs) {
    const e = this._etat[nom];
    if (categorie === "fatal") {
      e.ecarte = true;
      e.authentifie = false;
      this._trace({ type: "fournisseur_ecarte", fournisseur: nom, raison: "authentification" });
    } else if (categorie === "quota") {
      // Un 429 prouve que la clé est acceptée : le service répond, il limite.
      if (e.authentifie === null) e.authentifie = true;
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

  /** Corps de requête, adapté aux particularités du fournisseur. */
  _corps(f, messages, { json, temperature, maxTokens }) {
    const corps = { model: f.modele, temperature, messages };
    if (json) {
      // La consigne est ajoutée dans TOUS les cas, et pour deux raisons.
      // 1. Les fournisseurs sans mode JSON natif n'ont que l'invite pour le
      //    savoir. `extraireJson` reste la dernière ligne de défense.
      // 2. Les API compatibles OpenAI refusent `response_format:json_object`
      //    (HTTP 400) quand le mot « json » n'apparaît nulle part dans les
      //    messages. L'invite du registre le contient aujourd'hui, mais une
      //    reformulation future le perdrait et casserait toute compréhension.
      //    La consigne garantit la présence du mot.
      corps.messages = [
        ...messages,
        { role: "system", content: "Reponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour." },
      ];
      if (f.jsonNatif) corps.response_format = { type: "json_object" };
    }
    if (maxTokens != null) corps[f.champMaxTokens ?? "max_tokens"] = maxTokens;
    return corps;
  }

  /**
   * Complétion de chat. Bascule au fournisseur suivant à la moindre erreur.
   * @returns {{texte:string, fournisseur:string, modele:string, tokens:number|null}}
   */
  async completer(messages, { json = false, temperature = 0, maxTokens = null } = {}) {
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

      const f = this._defs[nom];
      for (let tentative = 1; tentative <= TENTATIVES_TRANSITOIRES; tentative++) {
        const debut = this._horloge();
        e.appels += 1;
        try {
          const r = await this._avecDelai((signal) =>
            this._fetch(`${f.base}/chat/completions`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${this._cles[nom]}`,
                ...(f.entetes ?? {}),
              },
              body: JSON.stringify(this._corps(f, messages, { json, temperature, maxTokens })),
              signal,
            }),
          );
          e.dernierCode = r.status ?? null;
          if (!r.ok) {
            const categorie = classerErreur(r.status);
            this._sanctionner(nom, categorie, categorie === "quota" ? this._retryApres(r) : null);
            const err = new Error(`HTTP ${r.status}`);
            err.categorie = categorie;
            throw err;
          }
          const d = await r.json();
          const choix = d?.choices?.[0];
          const texte = choix?.message?.content ?? "";
          if (!texte) {
            // Un modèle de raisonnement consomme son budget de jetons AVANT
            // d'écrire sa réponse : avec un plafond trop bas, il rend un 200
            // dont le contenu est vide et `finish_reason: "length"`. Réessayer
            // à l'identique ne peut pas aboutir — c'est le plafond qu'il faut
            // changer. On le dit, et on passe au fournisseur suivant.
            if (choix?.finish_reason === "length") {
              throw Object.assign(
                new Error(`contenu vide, budget de jetons epuise (finish_reason=length, modele=${f.modele})`),
                { categorie: "configuration" },
              );
            }
            throw Object.assign(new Error("réponse vide"), { categorie: "transitoire" });
          }

          const dureeMs = this._horloge() - debut;
          e.authentifie = true;
          e.succes += 1;
          e.dureeCumuleeMs += dureeMs;
          e.tokens += d?.usage?.total_tokens ?? 0;
          e.derniereErreur = null;

          const resultat = {
            texte,
            fournisseur: nom,
            modele: f.modele,
            tokens: d?.usage?.total_tokens ?? null,
            dureeMs,
            tentatives: tentative,
          };
          this._trace({ type: "llm", ...resultat, erreursPrecedentes: erreurs });
          return resultat;
        } catch (err) {
          const categorie = err.categorie ?? "transitoire";
          e.echecs += 1;
          e.derniereErreur = String(err.message ?? err);
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
   * Transcription d'un message vocal.
   *
   * Sélection indépendante de l'ordre des LLM : seuls les fournisseurs qui
   * exposent réellement `POST /audio/transcriptions` sont essayés. Prétendre
   * qu'un fournisseur sait transcrire parce qu'il sait discuter ferait échouer
   * tous les messages vocaux.
   *
   * @param audio {Buffer|Blob} contenu du média
   */
  async transcrire(audio, { nomFichier = "vocal.ogg", langue = "fr" } = {}) {
    const candidats = this.transcripteurs;
    if (candidats.length === 0) throw new Error("Aucun fournisseur de transcription configuré");

    const erreurs = [];
    for (const nom of candidats) {
      const f = this._defs[nom];
      const debut = this._horloge();
      try {
        const form = new FormData();
        form.append("file", audio instanceof Blob ? audio : new Blob([audio]), nomFichier);
        form.append("model", f.transcription);
        form.append("language", langue);
        form.append("response_format", "json");

        const r = await this._avecDelai((signal) =>
          this._fetch(`${f.base}/audio/transcriptions`, {
            method: "POST",
            headers: { authorization: `Bearer ${this._cles[nom]}`, ...(f.entetes ?? {}) },
            body: form,
            signal,
          }),
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const texte = (d?.text ?? "").trim();
        if (!texte) throw new Error("transcription vide");

        const resultat = { texte, fournisseur: nom, modele: f.transcription, dureeMs: this._horloge() - debut };
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
