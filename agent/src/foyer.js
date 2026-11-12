/**
 * Le foyer : ce dont une consultation vient de parler.
 *
 * Extrait des paramètres FINAUX de l'outil (donc d'identifiants que le backend
 * a acceptés) et des lignes rendues. Il ne contient que des identifiants et
 * des filtres : pas un nom, pas une note, pas un montant.
 *
 * C'est lui qui donne un sens à « et les retards ? » (la classe), « ses
 * parents » (l'élève) et « préviens leurs parents » (les élèves du résultat).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (v) => (typeof v === "string" && UUID.test(v) ? v : null);

/** Outils dont les lignes SONT des élèves (leur `id` est un identifiant d'élève). */
const LIGNES_ELEVES = new Set(["eleves.rechercher", "classes.eleves"]);

export function extraireFoyer(outil, params = {}, donnees = null) {
  const foyer = { outil: outil?.name ?? null };
  const classeId = uuid(params.classeId) ?? uuid(params.classe);
  if (classeId) foyer.classeId = classeId;
  if (uuid(params.periodeId)) foyer.periodeId = params.periodeId;
  if (uuid(params.eleveId)) foyer.eleveId = params.eleveId;

  const lignes = Array.isArray(donnees) ? donnees : Array.isArray(donnees?.lignes) ? donnees.lignes : null;
  if (lignes) {
    const ids = [];
    for (const l of lignes) {
      const id = uuid(l?.eleveId) ?? (LIGNES_ELEVES.has(outil?.name) ? uuid(l?.id) : null);
      if (id && !ids.includes(id)) ids.push(id);
    }
    // Une liste d'élèves REMPLACE la précédente, même vide : « leurs parents »
    // après un résultat vide ne doit désigner personne.
    if (ids.length || lignes.length === 0 || lignes.some((l) => "eleveId" in (l ?? {}))) {
      foyer.eleveIds = ids;
      foyer.eleveIdsTronques = typeof donnees?.total === "number" && donnees.total > lignes.length;
      foyer.origineEleves = outil?.name ?? null;
    }
    // Un seul élève dans le résultat d'une recherche : c'est de lui qu'on parle.
    if (ids.length === 1 && !foyer.eleveId) foyer.eleveId = ids[0];
  }
  return foyer;
}

/**
 * Les paramètres d'une consultation, tels qu'on peut les montrer au modèle :
 * des libellés et des jetons, jamais d'identifiant.
 */
export function parametresLisibles(params = {}, { classes = [], periodes = [] } = {}) {
  const out = {};
  for (const [cle, v] of Object.entries(params ?? {})) {
    if (v === null || v === undefined || v === "") continue;
    if (cle === "classeId" || (cle === "classe" && uuid(v))) {
      const c = classes.find((x) => x.id === v);
      if (c) out.classe = c.libelle ?? c.code;
    } else if (cle === "periodeId") {
      const p = periodes.find((x) => x.id === v);
      if (p) out.periode = p.libelle;
    } else if (cle === "periodeNumero") {
      out.periode = `trimestre ${v}`;
    } else if (cle === "eleveId") {
      out.eleve = "@eleve_courant";
    } else if (cle === "eleveIds") {
      out.eleves = "@eleves_du_resultat";
    } else if (typeof v === "boolean" || typeof v === "number" || (typeof v === "string" && !uuid(v) && v.length <= 60)) {
      // Filtres simples : statut, dates, drapeaux. Tout identifiant est écarté.
      if (!/Id$|Ids$|^cle/.test(cle)) out[cle] = v;
    }
  }
  return out;
}
