/**
 * Le juge : ce qu'un tour devait produire, et ce qu'il a produit.
 *
 * Chaque contrôle porte une CATÉGORIE. Ce sont elles qui deviennent les
 * mesures de la campagne — un tour ne « réussit » pas globalement, il réussit
 * ou échoue sur chacune :
 *
 *   comprehension  l'intention et l'outil choisis
 *   resolution     les entités nommées devenues les BONS identifiants
 *   execution      l'appel au backend a abouti
 *   reponse        ce qui est répondu est juste (comparé à l'oracle SQL)
 *   clarification  aucune question posée quand la demande suffisait
 *   hygiene        rien de technique montré à l'utilisateur
 *   verite         ce qui est annoncé fait est réellement fait (relu en SQL)
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const JARGON = /\b(classeId|periodeId|eleveId|inscriptionId|absenceIds?|tuteurId|anneeId|enseignantId|matiereId|UUID|uuid)\b|identifiant (de|d'une|de la) (classe|p[ée]riode)/;
const CASSE = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;
const ANNONCE_REUSSITE = /✅|\bV[ée]rifi[ée]\b|\benregistr[ée]e?s?\b|\beffectu[ée]e?s?\b|\bmise? en file\b|\bcr[ée][ée]e?\b|\barchiv[ée]e?\b/i;

const ISSUES = {
  repond: (o) => o.statut === "COMPLETED" || o.statut === "PARTIALLY_COMPLETED",
  clarifie: (o) => o.statut === "WAITING_INPUT",
  confirme: (o) => o.statut === "WAITING_APPROVAL",
  annule: (o) => o.statut === "CANCELLED",
  echec: (o) => o.statut === "FAILED",
  refuse: (o) => o.statut === "FAILED" && o.resultat?.reason === "permission",
  conversation: (o) => o.intention === "conversation" && o.statut === "COMPLETED",
};

const liste = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const motif = (m, f) => (typeof m === "function" ? m(f) : m);
const teste = (m, texte) => (m instanceof RegExp ? m.test(texte) : texte.includes(String(m)));

/**
 * @param {object} attendu  le tour du scénario
 * @param {object} obs      l'observation rendue par `conversation.dire`
 * @param {object} f        les faits de l'oracle
 * @param {Function} q      requête SQL (pour `apres`)
 */
export async function jugerTour(attendu, obs, f, q) {
  const c = [];
  const noter = (categorie, ok, detail = "") => c.push({ categorie, ok: ok === true, detail: ok === true ? "" : String(detail).slice(0, 300) });

  // --- compréhension --------------------------------------------------------
  if (attendu.outil !== undefined) {
    const admis = liste(attendu.outil);
    const choisi = obs.outil ?? obs.audit?.intent ?? (obs.intention === "conversation" ? "conversation" : obs.intention === "clarifier" ? "clarifier" : null);
    const ok = attendu.outil === null ? obs.intention !== "outil" && obs.intention !== "mission" : admis.includes(choisi);
    noter("comprehension", ok, "outil attendu " + (admis.join(" | ") || "aucun") + ", obtenu " + (choisi ?? "aucun") + " (intention " + obs.intention + (obs.rejet ? ", rejet " + obs.rejet : "") + ")");
  }
  if (attendu.issue !== undefined) {
    const admises = liste(attendu.issue);
    const ok = admises.some((i) => ISSUES[i]?.(obs));
    // Une question posée alors qu'une réponse était attendue est un défaut à
    // part : c'est la « clarification inutile ».
    const inutile = !ok && !admises.includes("clarifie") && ISSUES.clarifie(obs);
    noter(inutile ? "clarification" : "comprehension", ok, "issue attendue " + admises.join(" | ") + ", statut " + obs.statut);
    if (!admises.includes("clarifie") && !inutile) noter("clarification", true);
  }

  // --- résolution des entités, exécution -----------------------------------
  for (const a of liste(attendu.appel)) {
    const candidats = obs.appels.filter((x) => x.action === a.action);
    if (a.jamais) {
      noter("verite", candidats.length === 0, "l'action " + a.action + " ne devait pas être appelée");
      continue;
    }
    if (candidats.length === 0) {
      noter("resolution", false, "aucun appel à " + a.action + " (appels : " + (obs.appels.map((x) => x.action).join(", ") || "aucun") + ")");
      continue;
    }
    const dernier = candidats[candidats.length - 1];
    if (a.params) {
      let r;
      try {
        r = await a.params(dernier.params ?? {}, f);
      } catch (e) {
        r = "contrôle en erreur : " + e.message;
      }
      noter("resolution", r === true, a.action + " " + JSON.stringify(dernier.params ?? {}).slice(0, 160) + " — " + r);
    }
    noter("execution", dernier.ok, a.action + " : " + (dernier.message ?? "échec"));
  }

  // --- réponse ---------------------------------------------------------------
  const texte = obs.reponse ?? "";
  for (const m of liste(attendu.contient)) {
    const mm = await motif(m, f);
    noter("reponse", teste(mm, texte), "attendu dans la réponse : " + mm);
  }
  for (const m of liste(attendu.absent)) {
    const mm = await motif(m, f);
    noter("reponse", !teste(mm, texte), "ne devait pas figurer : " + mm);
  }

  // --- hygiène : toujours ----------------------------------------------------
  noter("hygiene", texte.trim().length > 0, "aucune réponse envoyée");
  // Un lien vers un document porte l'identifiant de l'élève : c'est une adresse
  // à ouvrir, pas un paramètre à fournir.
  noter("hygiene", !UUID.test(texte.replace(/https?:\/\/\S+/g, "")), "un identifiant technique (UUID) est montré à l'utilisateur");
  noter("hygiene", !JARGON.test(texte), "un nom de paramètre technique est montré : " + (texte.match(JARGON)?.[0] ?? ""));
  noter("hygiene", !CASSE.test(texte), "valeur cassée dans la réponse : " + (texte.match(CASSE)?.[0] ?? ""));
  if (obs.intention === "outil" && obs.statut === "COMPLETED" && obs.audit?.result === "SUCCESS") {
    noter("reponse", !/^✅ Opération effectuée\.?$/.test(texte.trim()), "la consultation a répondu « Opération effectuée » : la donnée lue a été jetée");
  }

  // --- vérité : l'état réel après le tour -----------------------------------
  if (attendu.apres) {
    let r;
    try {
      r = await attendu.apres({ q, f, obs });
    } catch (e) {
      r = "contrôle SQL en erreur : " + e.message;
    }
    const ok = r == null || r === true;
    noter("verite", ok, r);
    // Annoncer une réussite que la base dément est le pire défaut d'un agent.
    if (!ok && ANNONCE_REUSSITE.test(texte) && obs.statut === "COMPLETED") {
      c.push({ categorie: "fausse_reussite", ok: false, detail: "réponse « " + texte.slice(0, 80) + " » alors que : " + r });
    }
  }
  const appelEchoue = obs.appels.some((x) => !x.ok && !/^(lister|rechercher|consulter|charger|statistiques|devis|fiche|annee)/i.test(x.action));
  if (appelEchoue && ANNONCE_REUSSITE.test(texte) && obs.statut === "COMPLETED") {
    c.push({ categorie: "fausse_reussite", ok: false, detail: "une écriture a échoué mais la réponse annonce une réussite" });
  }

  return c;
}

/** Réussi : tout passe. Échoué : la compréhension du premier tour jugé est fausse, ou rien ne passe. Partiel : le reste. */
export function classer(tours) {
  const tous = tours.flatMap((t) => t.controles);
  if (tous.every((x) => x.ok)) return "reussi";
  const premier = tours.find((t) => t.controles.some((x) => x.categorie === "comprehension"));
  const comprisAuDepart = premier ? premier.controles.filter((x) => x.categorie === "comprehension").every((x) => x.ok) : true;
  if (!comprisAuDepart || tous.filter((x) => x.categorie !== "hygiene").every((x) => !x.ok)) return "echoue";
  return "partiel";
}
