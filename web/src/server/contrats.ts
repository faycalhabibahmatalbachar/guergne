/**
 * Contrats partagés entre les domaines.
 *
 * Volontairement SANS `server-only` : ce module ne contient que des types et
 * des fonctions pures, aucun accès aux données. Le réserver au serveur
 * empêcherait un composant client de typer un résultat qu'il reçoit, et
 * surtout le rendrait intestable avec `node --test`, qui ne résout pas cet
 * alias de Next.
 *
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------
 * Un relevé du dépôt a trouvé **28 types `Resultat*` distincts**, déclarés
 * chacun à côté de son `actions.ts`, et redéclarant tous la même forme
 * `{ ok, message?, erreurs? }`. Aucun n'est faux ; ensemble, ils rendent
 * impossible d'écrire une fonction qui traite un résultat sans savoir d'où il
 * vient. Chaque nouveau domaine en ajoutait un vingt-neuvième.
 *
 * Ce module ne remplace pas les 28 d'un seul geste : une migration de cette
 * taille, menée en même temps que du travail fonctionnel, casserait des écrans
 * sans que personne sache lequel. Il fixe la forme que tout NOUVEAU code
 * adopte, et vers laquelle les anciens convergent quand on les touche de toute
 * façon.
 *
 * CE QUI N'EST PAS NÉGOCIABLE
 * ----------------------------
 * `ok: false` porte TOUJOURS un message destiné à un humain. Un échec muet
 * oblige l'appelant à inventer une explication, et c'est ainsi qu'un refus de
 * droits devient « une erreur est survenue ».
 */

/**
 * Issue d'une opération d'écriture.
 *
 * Le type est une union discriminée, et non un objet à champs optionnels :
 * `if (r.ok)` suffit alors au compilateur pour savoir que `donnees` existe, et
 * `message` est exigé dans la branche d'échec au lieu d'être espéré.
 */
export type Resultat<T = void> =
  | { ok: true; donnees?: T; message?: string }
  | { ok: false; message: string; erreurs?: Record<string, string> };

/** Succès. */
export const reussi = <T>(donnees?: T, message?: string): Resultat<T> => ({ ok: true, donnees, message });

/** Échec. Le message est obligatoire — c'est tout l'intérêt. */
export const echoue = <T = void>(message: string, erreurs?: Record<string, string>): Resultat<T> => ({
  ok: false,
  message,
  erreurs,
});

/**
 * Page de résultats d'une lecture de liste.
 *
 * POURQUOI `total` EST OBLIGATOIRE
 * ---------------------------------
 * Parce que son absence a déjà menti. L'agent annonçait « Absences — 100
 * résultats » pour une classe qui en comptait 211 : la limite de pagination
 * était rendue comme si elle était la réalité, et rien dans la réponse ne
 * signalait la troncature. Un chef d'établissement décidait sur un chiffre
 * faux.
 *
 * `tronque` n'est pas déductible de `lignes.length === limite` : une liste de
 * 100 lignes pour exactement 100 résultats n'est pas tronquée, et la confusion
 * entre les deux est précisément le défaut d'origine.
 */
export interface Page<L> {
  lignes: L[];
  /** Nombre réel, compté séparément des lignes rendues. */
  total: number;
  limite: number;
  tronque: boolean;
}

/**
 * Assemble une page.
 *
 * Le `total` vient d'un comptage distinct, dont les conditions doivent être
 * les MÊMES que celles de la liste. Les dupliquer à la main — ce que font
 * aujourd'hui `listerAbsences` et `compterAbsences` — produit tôt ou tard un
 * total incohérent avec les lignes, ce qui est pire qu'une absence de total.
 */
export function enPage<L>(lignes: L[], total: number, limite: number): Page<L> {
  return { lignes, total, limite, tronque: total > lignes.length };
}

/**
 * Bornes d'une lecture de liste.
 *
 * Le plafond existe parce qu'une limite fournie par l'appelant est une limite
 * fournie par un inconnu : sans plafond, `limite=10000000` est une attaque par
 * épuisement, et le modèle d'IA qui compose la requête n'a aucune raison de se
 * retenir.
 */
export const LIMITE_DEFAUT = 100;
export const LIMITE_PLAFOND = 500;

export function bornerLimite(demandee: unknown, plafond = LIMITE_PLAFOND): number {
  const n = Number(demandee);
  if (!Number.isFinite(n) || n <= 0) return LIMITE_DEFAUT;
  return Math.min(Math.floor(n), plafond);
}
