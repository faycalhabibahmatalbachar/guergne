/**
 * Mise en forme des lectures pour WhatsApp.
 *
 * POURQUOI UN MODULE A PART
 * --------------------------
 * Ces aides sont partagees par tous les catalogues d'outils. Les laisser dans
 * l'un d'eux obligerait les autres a l'importer, et deux fichiers d'outils qui
 * s'importent mutuellement forment un cycle que les modules ES resolvent mal.
 *
 * CONTRAINTE DU CANAL
 * -------------------
 * Un message WhatsApp se lit sur un telephone. Deverser les cent lignes que
 * `listerAbsences` renvoie par defaut le rendrait illisible : on borne
 * l'affichage et on annonce le reste, sans jamais pretendre que le reste
 * n'existe pas.
 */
export const MAX_LIGNES = 10;

export const STATUT_LISIBLE = { JUSTIFIEE: "justifiée", NON_JUSTIFIEE: "non justifiée" };

export const nomComplet = (l) => `${l.prenom ?? ""} ${l.nom ?? ""}`.trim() || "élève inconnu";
/** Les dates arrivent en ISO ; seule la partie calendaire intéresse le lecteur. */
export const jour = (d) => String(d ?? "").slice(0, 10) || "date inconnue";

/**
 * Valeur affichable, ou une mention franche quand elle manque.
 *
 * Laisser passer `undefined` est pire qu'un trou : le mot a l'air d'un
 * resultat, et un lecteur presse le prend pour une donnee.
 */
export const val = (v, defaut = "?") => (v === null || v === undefined || v === "" ? defaut : String(v));

export function listeRendue(lignes, titre, ligne) {
  if (!Array.isArray(lignes)) return null;
  // Une ligne vide ou mal formee ne doit pas emporter la reponse entiere : le
  // backend peut rendre une colonne absente, et l'utilisateur merite les
  // autres lignes.
  const utilisables = lignes.filter((l) => l !== null && l !== undefined);
  if (utilisables.length === 0) return `${titre} : aucun résultat.`;
  const montrees = utilisables.slice(0, MAX_LIGNES);
  const reste = utilisables.length - montrees.length;
  const rendue = (l) => {
    try {
      const t = ligne(l);
      return typeof t === "string" && t.trim() ? t : "ligne illisible";
    } catch {
      return "ligne illisible";
    }
  };
  return [
    `${titre} — ${utilisables.length} résultat${utilisables.length > 1 ? "s" : ""} :`,
    ...montrees.map((l) => `• ${rendue(l)}`),
    reste > 0 ? `… et ${reste} de plus.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
