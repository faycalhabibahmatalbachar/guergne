/**
 * Politique de mémoire WhatsApp.
 *
 * La mémoire durable ne doit contenir que des préférences opérationnelles
 * explicitement demandées par l'utilisateur. Les échanges scolaires,
 * identifiants et résultats métier ne deviennent jamais du contexte durable.
 */

function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!?]+$/u, "")
    .trim()
    .replace(/\s+/gu, " ");
}

/**
 * Hérite uniquement du périmètre d'une lecture précédente lorsque le message
 * est clairement une suite ("et les retards ?", "pour la même classe").
 * Aucun identifiant d'élève, nom ou contenu de résultat n'est concerné.
 */
export function completerParametresContexte({
  texte = "",
  dernierTravail = null,
  outilLecture = false,
  parametres = {},
} = {}) {
  const resultat = { ...(parametres ?? {}) };
  if (!outilLecture || !(dernierTravail?.params ?? dernierTravail?.parametres)) {
    return { parametres: resultat, champsHerites: [] };
  }

  const n = normaliser(texte);
  const mentionMemeClasse =
    /\b(?:meme classe|cette classe|la classe precedente|classe precedente|comme avant|comme precedemment|comme tout a l'heure)\b/u.test(n);
  const suiteNaturelle = /^(?:et|puis|ensuite|maintenant|aussi)\b/u.test(n);
  const classeNouvelle =
    /\b(?:classe\s+(?:de\s+)?(?:6e|6eme|5e|5eme|4e|4eme|3e|3eme|2nde|seconde|terminale|tle|1ere|premiere)(?:\s+[a-z])?|(?:6e|6eme|5e|5eme|4e|4eme|3e|3eme|2nde|terminale|tle)\s+[a-z])\b/u.test(n);
  const memePeriode =
    /\b(?:meme periode|cette periode|la periode precedente|periode precedente|comme pour la periode precedente)\b/u.test(n);

  const herites = [];
  const source = dernierTravail.params ?? dernierTravail.parametres ?? {};

  if ((mentionMemeClasse || (suiteNaturelle && !classeNouvelle)) && source.classeId) {
    resultat.classeId = source.classeId;
    herites.push("classeId");
  }
  if (memePeriode && source.periodeId) {
    resultat.periodeId = source.periodeId;
    herites.push("periodeId");
  }

  return { parametres: resultat, champsHerites: herites };
}

export function analyserCommandeMemoire(texte) {
  const brut = String(texte ?? "").trim();
  const n = normaliser(brut);

  if (/^(?:memoire|mes preferences|que retiens-tu de moi|qu'as-tu retenu de moi|qu'as-tu memorise|qu'as-tu memorise sur moi)$/u.test(n)) {
    return { type: "show" };
  }

  if (/^(?:oublie|efface|supprime) (?:toute )?(?:ma memoire|mes souvenirs|tout ce que tu as retenu de moi)$/u.test(n)) {
    return { type: "forget" };
  }

  const match = brut.match(/^(?:retiens|retenez|memorise|mémorise)\s+(?:que\s+)?(.+?)\s*[.!?]*$/iu);
  if (!match) return null;

  const phrase = normaliser(match[1]);
  let m = phrase.match(/^(?:je prefere|je veux)\s+(?:recevoir\s+)?(?:(?:les?|des?)\s+)?reponses?\s+(courtes?|detaillees?)$/u);
  if (m) {
    return {
      type: "remember",
      category: "preference",
      key: "response_style",
      value: m[1].startsWith("court") ? "réponses courtes" : "réponses détaillées",
    };
  }

  m = phrase.match(/^(?:je prefere|je veux)\s+(?:que tu me repondes en\s+)?(?:le\s+)?(francais|arabe|anglais)$/u);
  if (m) {
    const langue = { francais: "français", arabe: "arabe", anglais: "anglais" }[m[1]];
    return { type: "remember", category: "preference", key: "language", value: langue };
  }

  m = phrase.match(/^(?:je prefere|je veux)\s+(?:recevoir\s+)?les rapports?\s+(?:au format|en)\s+(pdf|excel|word)$/u);
  if (m) {
    return {
      type: "remember",
      category: "preference",
      key: "report_format",
      value: m[1].toUpperCase(),
    };
  }

  return { type: "unsupported_remember" };
}

/**
 * Filtre de dernier recours avant de replacer un texte dans un futur prompt.
 * Il ne remplace pas les contrôles d'intention : il réduit les risques de
 * conserver des données scolaires, personnelles ou identifiantes.
 */
export function estTexteGeneralMemorisable(texte) {
  if (typeof texte !== "string") return false;
  const value = texte.trim();
  if (!value || value.length > 1_000) return false;

  const sensible =
    /\b(?:eleve|eleves|etudiant|etudiants|classe|classes|note|notes|moyenne|absences?|retards?|sanctions?|bulletin|dossier|matricule|parent|enseignant|professeur|directeur|naissance|maladie|medicament|sante|telephone|adresse|courriel|email|cni|piece d'identite)\b/iu;
  const identifiant =
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{6,}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/iu;

  return !sensible.test(normaliser(value)) && !identifiant.test(value);
}
