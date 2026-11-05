/**
 * Décrire une erreur pour le journal, sans jamais la réduire à une lettre.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Un incident de production a coûté une soirée entière de diagnostic parce que
 * le journal ne contenait que `erreur: "r"`. L'ancienne écriture était
 * `String(e?.message ?? e).slice(0, 200)` : correcte pour une `Error` du
 * projet, muette pour tout le reste. Quand WhatsApp Web lève une erreur
 * minifiée, `message` vaut une seule lettre, et la trace ne dit alors ni
 * d'où elle vient, ni ce qui l'a produite.
 *
 * CE QUE L'ON CONSIGNE, ET CE QUE L'ON REFUSE DE CONSIGNER
 * --------------------------------------------------------
 * Le nom, le message, le constructeur réel, la pile et la chaîne des causes :
 * tout ce qui permet de retrouver le point de départ. Jamais le contenu des
 * messages scolaires, et jamais une valeur dont le nom ressemble à un secret —
 * une erreur de bibliothèque HTTP transporte volontiers l'en-tête
 * d'autorisation dans ses propriétés.
 */

/** Noms de propriétés qu'on ne recopie pas, même tronqués. */
const SENSIBLES = /(cle|key|token|jeton|secret|password|motdepasse|authorization|auth|cookie|bearer|signature|credential)/i;

const texte = (v, max) => String(v).replace(/\s+/g, " ").trim().slice(0, max);

/** Le nom de la classe réelle, qui survit à la minification mieux que `name`. */
function constructeur(e) {
  const n = e?.constructor?.name;
  return typeof n === "string" && n && n !== "Object" ? n : null;
}

/**
 * Décrit n'importe quelle valeur levée.
 *
 * Accepte tout : `Error`, `TypeError`, `DOMException`, `AggregateError`,
 * chaîne, nombre, `null`, objet nu, promesse rejetée avec un objet du
 * navigateur. Ne lève jamais : une fonction de journalisation qui échoue
 * remplace l'incident à diagnostiquer par le sien.
 *
 * @param {unknown} e
 * @param {{profondeur?:number, maxPile?:number}} [o]
 * @returns {object} description aplatie, sérialisable en JSON
 */
export function decrireErreur(e, { profondeur = 3, maxPile = 1200 } = {}) {
  try {
    if (e === null) return { type: "null", message: "null" };
    if (e === undefined) return { type: "undefined", message: "undefined" };

    const t = typeof e;
    if (t === "string") return { type: "string", message: texte(e, 600) };
    if (t === "number" || t === "boolean" || t === "bigint" || t === "symbol") {
      return { type: t, message: texte(e, 120) };
    }
    if (t === "function") return { type: "function", message: texte(e.name || "fonction anonyme", 120) };

    const d = { type: t };
    const nom = typeof e.name === "string" ? e.name : null;
    const classe = constructeur(e);
    if (nom) d.nom = nom;
    // `classe` n'est consignée que si elle apprend quelque chose : sur une
    // erreur minifiee, c'est parfois la seule indication d'origine.
    if (classe && classe !== nom) d.classe = classe;

    const msg = typeof e.message === "string" ? e.message : null;
    d.message = msg ? texte(msg, 600) : texte(String(e), 600);
    // Un message d'une ou deux lettres est le signe meme du defaut qui a
    // motive ce module : on le signale au lieu de le laisser passer.
    if (d.message.length <= 2) d.messageSuspect = true;

    if (typeof e.code === "string" || typeof e.code === "number") d.code = texte(e.code, 60);
    if (typeof e.status === "number") d.statut = e.status;
    if (typeof e.statusCode === "number") d.statut = e.statusCode;
    if (typeof e.stack === "string" && e.stack) d.pile = texte(e.stack, maxPile);

    // Les erreurs agrégées (`Promise.any`, par exemple) cachent la vraie cause
    // dans un tableau que personne ne lit sans cela.
    if (Array.isArray(e.errors) && profondeur > 0) {
      d.erreurs = e.errors.slice(0, 5).map((x) => decrireErreur(x, { profondeur: profondeur - 1, maxPile: 300 }));
    }
    if (e.cause !== undefined && e.cause !== null && profondeur > 0) {
      d.cause = decrireErreur(e.cause, { profondeur: profondeur - 1, maxPile: 300 });
    }

    // Propriétés supplémentaires : souvent l'essentiel (un `response`, un
    // `detail`), parfois un secret. On filtre sur le nom, on tronque, et on ne
    // descend pas dans les objets.
    const extras = {};
    for (const cle of Object.keys(e)) {
      if (["name", "message", "stack", "cause", "errors", "code", "status", "statusCode"].includes(cle)) continue;
      if (SENSIBLES.test(cle)) {
        extras[cle] = "[masque]";
        continue;
      }
      const v = e[cle];
      if (v === null || ["string", "number", "boolean"].includes(typeof v)) extras[cle] = texte(v, 160);
    }
    if (Object.keys(extras).length > 0) d.details = extras;

    return d;
  } catch (interne) {
    return { type: "indescriptible", message: `description impossible : ${String(interne?.message ?? interne).slice(0, 120)}` };
  }
}

/**
 * Une ligne courte, pour les champs qui n'acceptent qu'un texte.
 *
 * Elle reste informative même quand le message est minifié, parce qu'elle
 * porte toujours le nom de la classe.
 */
export function resumerErreur(e, { max = 200 } = {}) {
  const d = decrireErreur(e, { profondeur: 1, maxPile: 0 });
  const etiquette = d.nom ?? d.classe ?? d.type;
  const base = d.message && d.message !== etiquette ? `${etiquette}: ${d.message}` : String(etiquette);
  const avecCause = d.cause?.message ? `${base} <- ${d.cause.nom ?? d.cause.type}: ${d.cause.message}` : base;
  return avecCause.slice(0, max);
}
