/**
 * Client HTTP vers le backend guergne — l'implémentation réelle du "client guergne"
 * que le moteur appelle (`guergne[action](params, ctx)`).
 *
 * Chaque appel part vers une API agent dédiée de guergne, authentifiée par un jeton
 * de service ET portant l'identité de l'acteur (`x-acteur-id`), pour que le `guard`
 * de guergne applique AUTH → RÔLE → PÉRIMÈTRE comme pour n'importe quel utilisateur.
 * L'agent n'écrit jamais en base directement ; il passe toujours par ici.
 *
 * Contrat (voir docs/AI_SCHOOL_AGENT/ARCHITECTURE_TECHNIQUE.md) :
 *   POST  {baseUrl}/api/agent/{action}
 *   headers: authorization: Bearer <serviceToken>, x-acteur-id: <uuid>
 *   body:    JSON des paramètres
 *   réponse: { ok: boolean, message?: string, data?: any }  (2xx)
 *            un statut non-2xx => échec, jamais maquillé en réussite (Règle 9).
 *
 * `fetch` est injectable pour les tests (aucun réseau requis).
 */
export class GuergneHttpClient {
  constructor({ baseUrl, serviceToken, fetch = globalThis.fetch }) {
    if (!baseUrl) throw new Error("GuergneHttpClient: baseUrl requis");
    this._baseUrl = baseUrl.replace(/\/$/, "");
    this._token = serviceToken;
    this._fetch = fetch;
  }

  async _call(action, params, ctx = {}) {
    let res;
    try {
      res = await this._fetch(`${this._baseUrl}/api/agent/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this._token}`,
          "x-acteur-id": ctx.actorId ?? "",
        },
        body: JSON.stringify(params ?? {}),
      });
    } catch (e) {
      // Panne réseau : échec explicite, jamais une fausse réussite.
      return { ok: false, message: `Backend injoignable : ${e.message ?? e}` };
    }

    if (!res.ok) {
      let corps = null;
      try { corps = await res.json(); } catch { /* corps non-JSON */ }
      const code = typeof corps?.code === "string" ? corps.code : null;
      const erreurs = corps?.erreurs && typeof corps.erreurs === "object" ? corps.erreurs : null;

      // DEUX REFUS 403 QUI N'ONT RIEN À VOIR.
      //
      // Tout 403 devenait « Droits insuffisants ». Or le backend répond aussi
      // 403 avec `code: ECRITURES_DESACTIVEES` quand les écritures sont éteintes
      // sur le déploiement. Le directeur s'entendait donc dire qu'il n'avait pas
      // les droits, alors qu'il les avait — et cherchait au mauvais endroit.
      if (res.status === 403) {
        const message =
          code === "ECRITURES_DESACTIVEES"
            ? "Les écritures de l'assistant ne sont pas activées sur ce déploiement : la consultation fonctionne, la modification non."
            : "Droits insuffisants côté plateforme.";
        return { ok: false, status: 403, code, message };
      }

      // Un refus de validation (422) porte ses raisons CHAMP PAR CHAMP. Ne
      // garder que `message` les perdait — souvent absent quand seul `erreurs`
      // est rempli —, et l'utilisateur recevait « Erreur backend (422) » sans
      // savoir quoi corriger.
      const detailChamps = erreurs ? Object.values(erreurs).filter((v) => typeof v === "string").join(" ") : "";
      const message = [corps?.message, detailChamps].filter(Boolean).join(" ") || `Erreur backend (${res.status}).`;
      return { ok: false, status: res.status, code, erreurs, message };
    }
    try {
      return await res.json();
    } catch {
      return { ok: false, message: "Réponse backend illisible." };
    }
  }

  // --- Référentiel : libellés que l'utilisateur emploie réellement ---
  // Personne ne dicte un UUID sur WhatsApp. Ces deux lectures donnent la liste
  // réelle de l'établissement, dans le périmètre de l'acteur.
  listerClasses(p, c) { return this._call("listerClasses", p, c); }
  listerPeriodes(p, c) { return this._call("listerPeriodes", p, c); }
  // L'effectif d'une classe porte `inscriptionId` — la cle que les ecritures
  // d'assiduite exigent, et que personne ne dicte de memoire.
  listerElevesClasse(p, c) { return this._call("listerElevesClasse", p, c); }

  // --- Outils Assiduité (mêmes noms d'action que le registre d'outils) ---
  listerAbsences(p, c) { return this._call("listerAbsences", p, c); }
  listerAlertes(p, c) { return this._call("listerAlertes", p, c); }
  listerRetards(p, c) { return this._call("listerRetards", p, c); }
  statistiquesVieScolaire(p, c) { return this._call("statistiquesVieScolaire", p, c); }
  chargerConduiteClasse(p, c) { return this._call("chargerConduiteClasse", p, c); }
  listerIncidents(p, c) { return this._call("listerIncidents", p, c); }
  listerSanctions(p, c) { return this._call("listerSanctions", p, c); }

  // --- Pilotage, pedagogie, finances, annuaire ---
  anneeCourante(p, c) { return this._call("anneeCourante", p, c); }
  rechercherEleves(p, c) { return this._call("rechercherEleves", p, c); }
  statistiquesEleves(p, c) { return this._call("statistiquesEleves", p, c); }
  rechercherTuteurs(p, c) { return this._call("rechercherTuteurs", p, c); }
  statistiquesParents(p, c) { return this._call("statistiquesParents", p, c); }
  tuteursDeLEleve(p, c) { return this._call("tuteursDeLEleve", p, c); }
  listerEnseignants(p, c) { return this._call("listerEnseignants", p, c); }
  listerClassesEtMatieres(p, c) { return this._call("listerClassesEtMatieres", p, c); }
  chargerEmploiDuTemps(p, c) { return this._call("chargerEmploiDuTemps", p, c); }
  listerEvaluations(p, c) { return this._call("listerEvaluations", p, c); }
  calendrierEvaluations(p, c) { return this._call("calendrierEvaluations", p, c); }
  releveEleve(p, c) { return this._call("releveEleve", p, c); }
  indicateursCles(p, c) { return this._call("indicateursCles", p, c); }
  effectifsParNiveau(p, c) { return this._call("effectifsParNiveau", p, c); }
  absencesParMois(p, c) { return this._call("absencesParMois", p, c); }
  moyennesParClasse(p, c) { return this._call("moyennesParClasse", p, c); }
  classementClasses(p, c) { return this._call("classementClasses", p, c); }
  resultatsParMatiere(p, c) { return this._call("resultatsParMatiere", p, c); }
  statistiquesEtablissement(p, c) { return this._call("statistiquesEtablissement", p, c); }
  statistiquesFinancieres(p, c) { return this._call("statistiquesFinancieres", p, c); }
  recouvrementParClasse(p, c) { return this._call("recouvrementParClasse", p, c); }
  listerSituationsFinancieres(p, c) { return this._call("listerSituationsFinancieres", p, c); }
  enregistrerAppel(p, c) { return this._call("enregistrerAppel", p, c); }
  enregistrerRetard(p, c) { return this._call("enregistrerRetard", p, c); }
  justifierEnLot(p, c) { return this._call("justifierEnLot", p, c); }
  supprimerAbsence(p, c) { return this._call("supprimerAbsence", p, c); }

  // --- Élèves, classes : lectures nécessaires aux écritures ---
  consulterEleve(p, c) { return this._call("consulterEleve", p, c); }
  ficheEleve(p, c) { return this._call("ficheEleve", p, c); }
  listerNiveaux(p, c) { return this._call("listerNiveaux", p, c); }
  listerSeries(p, c) { return this._call("listerSeries", p, c); }

  // --- Élèves, classes : écritures (éteintes tant que le backend ne les active pas) ---
  inscrireEleve(p, c) { return this._call("inscrireEleve", p, c); }
  modifierEleve(p, c) { return this._call("modifierEleve", p, c); }
  changerClasseEleve(p, c) { return this._call("changerClasseEleve", p, c); }
  archiverEleve(p, c) { return this._call("archiverEleve", p, c); }
  creerClasse(p, c) { return this._call("creerClasse", p, c); }
  modifierClasse(p, c) { return this._call("modifierClasse", p, c); }
  archiverClasse(p, c) { return this._call("archiverClasse", p, c); }
  rattacherTuteur(p, c) { return this._call("rattacherTuteur", p, c); }
  detacherTuteur(p, c) { return this._call("detacherTuteur", p, c); }
  modifierResponsabilitesTuteur(p, c) { return this._call("modifierResponsabilitesTuteur", p, c); }
  devisNotificationParents(p, c) { return this._call("devisNotificationParents", p, c); }
  envoyerNotificationParents(p, c) { return this._call("envoyerNotificationParents", p, c); }
  changerStatutEleve(p, c) { return this._call("changerStatutEleve", p, c); }
}
