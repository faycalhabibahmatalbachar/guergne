/**
 * La politique de sortie : UNE seule décision, au même endroit pour tous.
 *
 * LE DÉFAUT QUE CE MODULE CORRIGE À LA SOURCE
 * --------------------------------------------
 * L'assistant répondait deux fois : une réponse écrite, puis une note vocale
 * disant la même chose. Ce n'était pas un bogue isolé mais un réglage par
 * défaut — `AGENT_REPONSE_VOCALE` valait `texte_et_voix`, et le porte-voix
 * doublait donc chaque réponse. Le corriger en coupant la voix la supprimerait
 * aussi quand elle est voulue. La vraie correction est de DÉCIDER, une fois,
 * d'après ce que l'utilisateur a demandé.
 *
 * POURQUOI LE TEXTE EST PRIORITAIRE
 * ----------------------------------
 * Parler ne veut pas dire vouloir être écouté. Une réponse écrite se relit, se
 * cherche, se cite, et ne demande pas de trouver un moment pour l'entendre. Le
 * mode par défaut est donc `texte_seul`, y compris pour une note vocale
 * entrante.
 *
 * CE QUE CE MODULE N'EST PAS
 * ---------------------------
 * Il ne devine pas l'humeur de l'utilisateur et n'infère aucune préférence
 * d'un signal faible. Une réponse vocale demande une demande EXPLICITE, ou une
 * préférence que l'utilisateur a posée lui-même. Dans le doute : du texte.
 */

/** Les trois modes, nommés une seule fois. */
export const MODES = Object.freeze({
  TEXTE: "texte_seul",
  VOIX: "voix_seule",
  TEXTE_ET_VOIX: "texte_et_voix",
});

/** Le défaut, et il n'est pas négociable par un module isolé. */
export const MODE_DEFAUT = MODES.TEXTE;

export const TOUS_LES_MODES = Object.freeze(Object.values(MODES));

/**
 * Les anciens noms, pour ne pas casser ce qui existe.
 *
 * `porte-voix.js` et la variable `AGENT_REPONSE_VOCALE` parlent de « texte »,
 * « voix », « texte_et_voix ». On les accepte au lieu de renommer dans quinze
 * endroits — et on rend toujours le nom canonique.
 */
const ALIAS = Object.freeze({
  texte: MODES.TEXTE,
  texte_seul: MODES.TEXTE,
  text_only: MODES.TEXTE,
  TEXT_ONLY: MODES.TEXTE,
  voix: MODES.VOIX,
  voix_seule: MODES.VOIX,
  voice_only: MODES.VOIX,
  VOICE_ONLY: MODES.VOIX,
  texte_et_voix: MODES.TEXTE_ET_VOIX,
  text_and_voice: MODES.TEXTE_ET_VOIX,
  TEXT_AND_VOICE: MODES.TEXTE_ET_VOIX,
});

/** Rend le nom canonique d'un mode, ou `null` si ce n'en est pas un. */
export function normaliserMode(mode) {
  if (mode == null) return null;
  const brut = String(mode).trim();
  return ALIAS[brut] ?? ALIAS[brut.toLowerCase()] ?? null;
}

/**
 * Les demandes explicites, en français et en arabe.
 *
 * Volontairement étroites. Un motif large — « audio », « voix » seuls —
 * attraperait « j'ai un problème de voix » ou « le cours d'audiovisuel », et
 * enverrait une note vocale à quelqu'un qui n'en demandait pas. Chaque motif
 * exige donc un VERBE de demande, ou une formule sans ambiguïté.
 */
const DEMANDE_VOIX = [
  // « réponds / répondez / répond(s)-moi … par (une) note vocale / en vocal / par audio / à l'oral / vocalement »
  /\br[ée]ponds?(?:[- ]moi)?\b[^.!?]{0,40}\b(?:vocal(?:e|ement)?|note vocale|audio|oral)\b/i,
  /\br[ée]pondez\b[^.!?]{0,40}\b(?:vocal(?:e|ement)?|note vocale|audio|oral)\b/i,
  // « envoie / envoyez (moi) une note vocale / un (message) audio / un vocal »
  /\benvoie?z?\b(?:[- ]moi)?\b[^.!?]{0,30}\b(?:note vocale|message vocale?|vocal|audio)\b/i,
  // « parle-moi », « dis-le moi à l'oral / de vive voix »
  /\bparle[- ]moi\b/i,
  // `\b` est une frontière ASCII : devant « à » elle ne correspond jamais.
  // On vérifie donc explicitement qu'aucune lettre ne précède.
  /(?:(?<![\p{L}])[àa] l['’]oral|\bde vive voix\b)/iu,
  // « en vocal », « par vocal », « en note vocale », « en audio »
  // « les absences en audio-visuel » n'est pas une demande de note vocale : le
  // mot ne doit pas être suivi d'un trait d'union ni d'une autre lettre.
  /\b(?:en|par)\s+(?:vocal|note vocale|audio)(?![-\p{L}])/iu,
  // Arabe : « بالصوت » (par la voix), « رسالة صوتية » (message vocal),
  // « صوتيا » (vocalement), « بصوتك » (de ta voix).
  /بالصوت|رسالة\s*صوتية|صوتيا|بصوتك/,
];

const DEMANDE_TEXTE = [
  /\br[ée]ponds?(?:[- ]moi)?\b[^.!?]{0,40}\b(?:par [ée]crit|en texte|textuellement)\b/i,
  /\br[ée]pondez\b[^.!?]{0,40}\b(?:par [ée]crit|en texte|textuellement)\b/i,
  /\b(?:en|par)\s+(?:[ée]crit|texte)\b/i,
  /\b(?:pas|plus) de (?:vocal|note vocale|audio)\b/i,
  /\b(?:[ée]cris|[ée]crivez)[- ]moi\b/i,
  // Arabe : « بالكتابة » (par écrit), « مكتوب » (écrit), « نص » (texte).
  /بالكتابة|اكتب\s*لي|مكتوبا?/,
];

/**
 * Les deux formats, et seulement quand c'est dit.
 *
 * Testé AVANT la voix seule : « réponds par écrit et en vocal » contient les
 * deux demandes, et l'ordre des motifs ne doit pas décider à la place de
 * l'utilisateur.
 */
const DEMANDE_LES_DEUX = [
  /\b(?:les deux|tous les deux)\b/i,
  // Même raison : « écrit » commence par une lettre accentuée, que `\b` ne voit
  // pas. Sans ce correctif, « réponds en vocal et par écrit » était lu comme
  // une demande de texte SEUL — l'inverse d'une demande des deux formats.
  /(?<![\p{L}])(?:texte|[ée]crit)(?![\p{L}])[^.!?]{0,20}\bet\b[^.!?]{0,20}(?<![\p{L}])(?:vocal|note vocale|audio|voix)(?![\p{L}])/iu,
  /(?<![\p{L}])(?:vocal|note vocale|audio|voix)(?![\p{L}])[^.!?]{0,20}\bet\b[^.!?]{0,20}(?<![\p{L}])(?:texte|[ée]crit)(?![\p{L}])/iu,
  /نص\s*و\s*صوت|صوت\s*و\s*نص/,
];

const correspond = (motifs, texte) => motifs.some((m) => m.test(texte));

/**
 * Ce que l'utilisateur a demandé EXPLICITEMENT, ou `null`.
 *
 * Rend aussi le motif reconnu : une décision qu'on ne peut pas expliquer n'est
 * pas vérifiable, et ce champ est ce que le journal consignera.
 */
export function demandeExplicite(texte) {
  const t = String(texte ?? "");
  if (!t.trim()) return null;
  if (correspond(DEMANDE_LES_DEUX, t)) return { mode: MODES.TEXTE_ET_VOIX, raison: "demande_explicite_les_deux" };
  if (correspond(DEMANDE_TEXTE, t)) return { mode: MODES.TEXTE, raison: "demande_explicite_texte" };
  if (correspond(DEMANDE_VOIX, t)) return { mode: MODES.VOIX, raison: "demande_explicite_voix" };
  return null;
}

/**
 * La décision, et elle est déterministe.
 *
 * Ordre, du plus fort au plus faible :
 *   1. une demande explicite dans le message même ;
 *   2. la préférence que l'utilisateur a posée pour sa conversation ;
 *   3. le défaut — du texte.
 *
 * Aucun hasard, aucune heuristique sur le canal d'entrée : le fait que la
 * demande soit arrivée en vocal ne la fait PAS basculer en vocal.
 *
 * @param {object} o
 * @param {string} [o.texteUtilisateur]  le message reçu (transcrit, pour un vocal)
 * @param {string|null} [o.preference]  mode posé par l'utilisateur pour cette conversation
 * @param {string|null} [o.defaut]  le défaut du déploiement, si différent
 * @param {boolean} [o.voixDisponible]  faux si Piper est en panne
 * @returns {{mode:string, raison:string, replis?:string}}
 */
export function deciderSortie({
  texteUtilisateur = "",
  preference = null,
  defaut = MODE_DEFAUT,
  voixDisponible = true,
} = {}) {
  const parDefaut = normaliserMode(defaut) ?? MODE_DEFAUT;

  const explicite = demandeExplicite(texteUtilisateur);
  const prefere = normaliserMode(preference);

  let decision = explicite
    ? { mode: explicite.mode, raison: explicite.raison }
    : prefere
      ? { mode: prefere, raison: "preference_de_la_conversation" }
      : { mode: parDefaut, raison: "defaut" };

  // UN MOTEUR EN PANNE NE DOIT PAS PRODUIRE DU SILENCE.
  //
  // Si la voix est indisponible, une demande vocale devient du texte — et le
  // dit. Le contraire laisserait l'utilisateur sans réponse du tout.
  if (!voixDisponible && decision.mode !== MODES.TEXTE) {
    return {
      mode: MODES.TEXTE,
      raison: "repli_voix_indisponible",
      replis: decision.mode,
    };
  }
  return decision;
}

/**
 * La préférence qu'un message POSE, quand il en pose une.
 *
 * « Réponds-moi toujours par une note vocale » règle la conversation ; « dis-le
 * moi à l'oral » ne vaut que pour cette réponse. Sans le mot de durée, on ne
 * retient rien : une préférence persistante déduite d'une demande ponctuelle
 * ferait parler l'assistant pour toujours après une seule phrase.
 */
const DUREE = /\b(?:toujours|d[ée]sormais|[àa] partir de maintenant|dor[ée]navant|par d[ée]faut)\b|دائما|من الآن/i;

export function preferencePosee(texte) {
  const t = String(texte ?? "");
  if (!DUREE.test(t)) return null;
  const explicite = demandeExplicite(t);
  return explicite ? { mode: explicite.mode, raison: `${explicite.raison}_persistante` } : null;
}
