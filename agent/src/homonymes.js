/**
 * Détection d'homonymes dans un résultat de recherche d'élèves.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * « Recherche l'élève Djimet ABAKAR et affiche sa fiche synthétique » rendait
 * zéro résultat, parce que le nom complet était cherché comme un seul motif
 * alors que le nom et le prénom vivent dans deux colonnes. Une fois ce défaut
 * corrigé, la demande rend **deux** dossiers : LGR-2025-1050 en 2nde B et
 * LGR-2025-1219 en 4ème A. Deux enfants réels, même nom, même prénom.
 *
 * C'est le vrai danger, et il est pire que le zéro résultat. Un zéro résultat
 * se voit ; une fiche montrée pour le mauvais enfant ne se voit pas. Si le
 * modèle choisit le premier de la liste, l'administration lit le dossier d'un
 * autre élève en croyant lire celui qu'elle a demandé.
 *
 * Ce module ne choisit donc JAMAIS. Il constate l'ambiguïté et rend de quoi la
 * lever.
 *
 * POURQUOI UNE NORMALISATION LOCALE
 * ----------------------------------
 * `web/src/server/domain/identite-eleve.ts` fait déjà ce travail côté
 * plateforme, mais l'agent est un paquet Node distinct : il ne peut pas
 * importer le code de `web/`. La règle est donc redite ici, volontairement
 * réduite à ce dont le rendu a besoin — comparer deux identités déjà
 * rendues — et jamais à la décision métier, qui reste côté serveur.
 */

/** Sans accents, sans casse, sans ponctuation : les variantes d'écriture d'un même nom. */
export function cleIdentite(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/** La clé d'un élève : nom et prénom réunis, l'ordre des colonnes n'important pas. */
const cleEleve = (e) => `${cleIdentite(e?.nom)}|${cleIdentite(e?.prenom)}`;

/**
 * Regroupe les lignes qui désignent des personnes homonymes.
 *
 * Une date de naissance différente ne les sépare PAS ici : deux enfants de même
 * nom et même prénom restent deux dossiers à distinguer pour l'utilisateur, que
 * leurs dates diffèrent ou non. C'est au serveur de dire s'il s'agit d'un
 * doublon ; ici, il s'agit seulement de ne pas trancher à la place d'un humain.
 *
 * @param {Array<object>} lignes
 * @returns {Array<{cle: string, lignes: Array<object>}>} groupes de 2 ou plus
 */
export function groupesHomonymes(lignes) {
  if (!Array.isArray(lignes)) return [];
  const par = new Map();
  for (const l of lignes) {
    if (l === null || l === undefined) continue;
    const c = cleEleve(l);
    if (c === "|") continue; // ni nom ni prénom : rien à comparer
    if (!par.has(c)) par.set(c, []);
    par.get(c).push(l);
  }
  return [...par.entries()].filter(([, g]) => g.length > 1).map(([cle, g]) => ({ cle, lignes: g }));
}

/** Ce qui distingue deux homonymes, dans l'ordre d'utilité pour un humain. */
function distinctif(e) {
  const bouts = [];
  const classe = e?.classeLibelle ?? e?.classe;
  if (classe) bouts.push(String(classe));
  if (e?.dateNaissance) bouts.push(`né(e) le ${String(e.dateNaissance).slice(0, 10)}`);
  if (e?.statut) bouts.push(String(e.statut).toLowerCase());
  return bouts.join(", ");
}

/**
 * Avertissement à joindre au rendu, ou `null` s'il n'y a aucune ambiguïté.
 *
 * Le matricule est l'élément qui lève l'ambiguïté : c'est le seul identifiant
 * qu'un humain peut relire et redonner, contrairement à un UUID.
 */
export function avertissementHomonymes(lignes) {
  const groupes = groupesHomonymes(lignes);
  if (groupes.length === 0) return null;

  const morceaux = groupes.map(({ lignes: g }) => {
    const nom = `${g[0]?.prenom ?? ""} ${g[0]?.nom ?? ""}`.trim() || "élève sans nom";
    const details = g.map((e) => {
      const m = e?.matricule ? String(e.matricule) : "sans matricule";
      const d = distinctif(e);
      return `   • ${m}${d ? ` — ${d}` : ""}`;
    });
    return [`${g.length} élèves portent le nom « ${nom} » :`, ...details].join("\n");
  });

  return [
    "ATTENTION — plusieurs dossiers correspondent.",
    ...morceaux,
    "",
    "Precisez le matricule pour que j'ouvre le bon dossier. Je ne choisis pas a votre place :",
    "afficher la fiche d'un autre enfant ne se verrait pas.",
  ].join("\n");
}
