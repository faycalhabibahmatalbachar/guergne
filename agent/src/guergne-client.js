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

    if (res.status === 403) {
      return { ok: false, status: 403, message: "Droits insuffisants côté plateforme." };
    }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.message ?? ""; } catch { /* corps non-JSON */ }
      return { ok: false, status: res.status, message: detail || `Erreur backend (${res.status}).` };
    }
    try {
      return await res.json();
    } catch {
      return { ok: false, message: "Réponse backend illisible." };
    }
  }

  // --- Outils Assiduité (mêmes noms d'action que le registre d'outils) ---
  listerAbsences(p, c) { return this._call("listerAbsences", p, c); }
  listerAlertes(p, c) { return this._call("listerAlertes", p, c); }
  controleSaisies(p, c) { return this._call("controleSaisies", p, c); }
  enregistrerAppel(p, c) { return this._call("enregistrerAppel", p, c); }
  enregistrerRetard(p, c) { return this._call("enregistrerRetard", p, c); }
  justifierEnLot(p, c) { return this._call("justifierEnLot", p, c); }
  supprimerAbsence(p, c) { return this._call("supprimerAbsence", p, c); }
}
