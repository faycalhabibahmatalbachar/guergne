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

/**
 * Lignes portees par une reponse, quelle que soit sa forme.
 *
 * Certaines lectures rendent un tableau, d'autres `{ lignes, total }` parce
 * qu'elles sont bornees et doivent dire combien il y en a vraiment. Les
 * appelants ne doivent pas avoir a connaitre la difference.
 */
export const lignesDe = (d) => (Array.isArray(d) ? d : Array.isArray(d?.lignes) ? d.lignes : null);

/** Total reel d'une reponse bornee, ou `null` si elle n'en annonce pas. */
export const totalDe = (d) => (Array.isArray(d) ? null : typeof d?.total === "number" ? d.total : null);

export function listeRendue(lignes, titre, ligne, { total = null } = {}) {
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
  // Dire « 100 resultats » quand il y en a 211 fait tirer une conclusion
  // fausse, et rien dans la reponse ne le signale. On annonce donc l'ecart.
  const decompte =
    total !== null && total > utilisables.length
      ? `${utilisables.length} affichées sur ${total}`
      : `${utilisables.length} résultat${utilisables.length > 1 ? "s" : ""}`;
  return [
    `${titre} — ${decompte} :`,
    ...montrees.map((l) => `• ${rendue(l)}`),
    reste > 0 ? `… et ${reste} de plus dans cette liste.` : null,
    total !== null && total > utilisables.length
      ? `Precisez une classe, une periode ou des dates pour voir le reste.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}
