/**
 * Contrat entre le modèle et le moteur.
 *
 * CE QUI N'ALLAIT PAS
 * -------------------
 * Le contrat n'offrait que deux issues : appeler un outil, ou demander une
 * précision. Prié de présenter ses capacités, le modèle a répondu — ce qui est
 * la bonne réponse — par un objet décrivant ce qu'il sait faire. Le moteur
 * n'avait aucune case pour cela, est tombé dans `this.tools.get(undefined)`, et
 * a répondu « Action inconnue. ».
 *
 * Le modèle n'avait pas tort. Le contrat était incomplet : il n'admettait pas
 * qu'une conversation puisse être autre chose qu'une commande.
 *
 * TROIS INTENTIONS, ET PAS UNE DE PLUS
 * -------------------------------------
 *   conversation — répondre en langage naturel, sans toucher à aucune donnée ;
 *   outil        — exécuter une capacité réelle, sous permission ;
 *   clarifier    — demander la précision qui manque.
 *
 * Tout le reste est une violation du contrat, traitée comme telle : nommée,
 * journalisée, et jamais transformée en réponse trompeuse.
 *
 * POURQUOI LA CONVERSATION EST BRIDÉE
 * ------------------------------------
 * Une réponse conversationnelle ne lit aucune donnée. Le moindre chiffre
 * scolaire qu'elle contiendrait serait donc inventé — et présenté à un
 * directeur avec l'autorité de l'agent. `citeDesDonneesScolaires` rejette ces
 * réponses-là : mieux vaut une question qu'un chiffre faux.
 */

/** Intentions admises. */
export const INTENTIONS = {
  CONVERSATION: "conversation",
  OUTIL: "outil",
  CLARIFIER: "clarifier",
  /** Plusieurs consultations enchainees, puis une synthese chiffree. */
  MISSION: "mission",
};

/** Raisons de rejet d'un plan, pour le journal. */
export const REJETS = {
  PLAN_ABSENT: "PLAN_ABSENT",
  INTENTION_INCONNUE: "INTENTION_INCONNUE",
  OUTIL_INCONNU: "OUTIL_INCONNU",
  CHAMP_MANQUANT: "CHAMP_MANQUANT",
  MISSION_INVALIDE: "MISSION_INVALIDE",
  DONNEES_INVENTEES: "DONNEES_INVENTEES",
};

const texteUtile = (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

/**
 * Noms de choses que l'agent ne connaît QUE par le backend.
 *
 * Un chiffre accolé à l'un d'eux, dans une réponse conversationnelle, ne peut
 * pas venir d'une lecture : il vient du modèle.
 */
const NOMS_SCOLAIRES =
  "absence|absences|retard|retards|incident|incidents|sanction|sanctions|" +
  "eleve|eleves|élève|élèves|classe|classes|alerte|alertes|heure|heures|" +
  "note|notes|moyenne|moyennes|inscrit|inscrits|effectif|effectifs";

/** « 45 absences », « 12 élèves », « 3 incidents »… y compris avec un adjectif entre les deux. */
const CHIFFRE_PUIS_NOM = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s+(?:\\p{L}+\\s+){0,2}(?:${NOMS_SCOLAIRES})\\b`, "iu");

/**
 * Cette réponse conversationnelle avance-t-elle un fait scolaire chiffré ?
 *
 * Volontairement étroit : on ne cherche pas à juger le sens, seulement à
 * repérer la forme qui trompe — un nombre présenté comme une donnée de
 * l'établissement.
 */
export function citeDesDonneesScolaires(texte) {
  return CHIFFRE_PUIS_NOM.test(String(texte ?? ""));
}

/**
 * Normalise ce que rend le modèle en un plan que le moteur sait exécuter.
 *
 * Accepte aussi les formes historiques `{tool, params}` et `{clarify}` : les
 * démonstrations de bout en bout et les tests les emploient, et les casser
 * n'apporterait rien.
 *
 * @param {object|null} brut
 * @param {{get:(nom:string)=>object|undefined}} registre
 * @returns {{type:string, texte?:string, question?:string, tool?:object, nomOutil?:string,
 *            params?:object, rejet?:string, detail?:string}}
 */
export function normaliserPlan(brut, registre) {
  if (!brut || typeof brut !== "object") {
    return { type: "invalide", rejet: REJETS.PLAN_ABSENT, detail: "aucun objet exploitable" };
  }

  const intention = typeof brut.intention === "string" ? brut.intention.toLowerCase().trim() : null;

  // --- Clarification (forme actuelle et forme historique) -------------------
  const question = texteUtile(brut.question) ?? texteUtile(brut.clarify);
  if (intention === INTENTIONS.CLARIFIER || (!intention && question && !brut.tool)) {
    if (!question) return { type: "invalide", rejet: REJETS.CHAMP_MANQUANT, detail: "clarifier sans question" };
    const nomOutilEnAttente =
      texteUtile(brut.outil) ?? texteUtile(brut.tool) ?? texteUtile(brut.pendingTool);
    const outilEnAttente = nomOutilEnAttente ? registre?.get?.(nomOutilEnAttente) : undefined;
    return {
      type: INTENTIONS.CLARIFIER,
      question,
      ...(outilEnAttente ? {
        tool: outilEnAttente,
        nomOutil: nomOutilEnAttente,
        params: brut.params ?? {},
        missingFields: Array.isArray(brut.missingFields) ? brut.missingFields.map(String) : [],
      } : {}),
    };
  }

  // --- Conversation ---------------------------------------------------------
  if (intention === INTENTIONS.CONVERSATION) {
    const texte = texteUtile(brut.reponse) ?? texteUtile(brut.texte);
    if (!texte) return { type: "invalide", rejet: REJETS.CHAMP_MANQUANT, detail: "conversation sans reponse" };
    if (citeDesDonneesScolaires(texte)) {
      // Le modèle n'a lu aucune donnée : ce chiffre est inventé. Le transmettre
      // le ferait passer pour un relevé de l'établissement.
      return { type: "invalide", rejet: REJETS.DONNEES_INVENTEES, detail: "chiffre scolaire sans source" };
    }
    return { type: INTENTIONS.CONVERSATION, texte };
  }

  // --- Mission : plusieurs consultations, puis une synthese ----------------
  if (intention === INTENTIONS.MISSION) {
    const etapes = Array.isArray(brut.etapes) ? brut.etapes : null;
    if (!etapes || etapes.length === 0) {
      return { type: "invalide", rejet: REJETS.CHAMP_MANQUANT, detail: "mission sans etape" };
    }
    return { type: INTENTIONS.MISSION, but: texteUtile(brut.but) ?? "Bilan", etapes };
  }

  // --- Outil (forme actuelle et forme historique) --------------------------
  const nomOutil = texteUtile(brut.outil) ?? texteUtile(brut.tool);
  if (intention === INTENTIONS.OUTIL || (!intention && nomOutil)) {
    if (!nomOutil) return { type: "invalide", rejet: REJETS.CHAMP_MANQUANT, detail: "outil sans nom" };
    const tool = registre?.get?.(nomOutil);
    if (!tool) {
      // Le modèle a nommé une capacité qui n'existe pas. On le dit avec le nom
      // tenté : « Action inconnue » ne permettait aucun diagnostic.
      return { type: "invalide", rejet: REJETS.OUTIL_INCONNU, detail: nomOutil };
    }
    return { type: INTENTIONS.OUTIL, tool, nomOutil, params: brut.params ?? {} };
  }

  return {
    type: "invalide",
    rejet: REJETS.INTENTION_INCONNUE,
    // Les NOMS des champs reçus, jamais leurs valeurs : elles peuvent porter
    // la demande d'un utilisateur.
    detail: Object.keys(brut).slice(0, 8).join(","),
  };
}

/**
 * Bloc d'invite décrivant le contrat.
 *
 * Il vit ici, à côté de la validation, pour que la consigne donnée au modèle et
 * la règle appliquée au code ne puissent pas diverger.
 */
export function inviteContrat() {
  return [
    "Reponds TOUJOURS par un seul objet JSON, de l'une de ces quatre formes :",
    '1. {"intention":"conversation","reponse":"<texte naturel>"}',
    "   pour une salutation, un remerciement, une question sur toi, tes capacites",
    "   ou ton fonctionnement.",
    '2. {"intention":"outil","outil":"<nom exact>","params":{...}}',
    "   pour toute demande portant sur l'etablissement.",
    '3. {"intention":"mission","but":"<ce que tu prepares>","etapes":[{"outil":"<nom>","params":{...},"libelle":"<titre court>"}]}',
    "   pour une demande qui exige PLUSIEURS consultations avant de repondre :",
    "   un bilan, un rapport, une comparaison entre classes ou entre periodes.",
    "   Les etapes sont uniquement des CONSULTATIONS. Tu n'ecris aucun chiffre :",
    "   ils sont calcules a partir des donnees reellement lues.",
    '4. {"intention":"clarifier","question":"<question>"}',
    "   EN DERNIER RECOURS seulement.",
    "",
    'QUAND NE PAS UTILISER "clarifier" :',
    "- si la demande designe clairement une consultation, choisis l'outil, meme",
    "  sans aucun parametre : l'outil a ses propres valeurs par defaut ;",
    "- l'absence d'un parametre FACULTATIF n'est JAMAIS une raison de clarifier ;",
    "- ne demande jamais a l'utilisateur de fournir un identifiant : il ne les",
    "  connait pas. Recopie-le TOI-MEME depuis les listes de classes et de",
    "  periodes fournies plus bas des que la demande en nomme une.",
    'Reserve "clarifier" au cas ou tu ne peux pas choisir entre deux outils, ou',
    "ou la demande nomme une classe ou une periode absente des listes fournies.",
    "",
    "REGLE ABSOLUE : tu n'as acces a AUCUNE donnee scolaire par toi-meme.",
    "Toute question sur les absences, les retards, les incidents, les sanctions,",
    "les eleves, les classes, les notes ou les effectifs exige l'intention",
    '"outil" ou "clarifier". Ne cite JAMAIS un chiffre, un nom d\'eleve ou un',
    'fait de l\'etablissement dans une reponse "conversation" : tu ne peux que',
    "l'inventer, et il serait lu comme un releve officiel.",
  ].join("\n");
}
