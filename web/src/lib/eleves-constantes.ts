/**
 * Constantes du domaine « élève » partagées entre serveur et navigateur.
 *
 * Ce module ne doit importer NI la base de données NI `server-only` : il est
 * chargé par des composants client (filtres, badges). Les requêtes vivent dans
 * `@/server/domain/eleves`, qui reste strictement côté serveur.
 */

export type StatutEleve =
  | "CANDIDAT"
  | "PRE_INSCRIT"
  | "INSCRIT"
  | "SUSPENDU_DISCIPLINE"
  | "SUSPENDU_IMPAYE"
  | "EXCLU"
  | "TRANSFERE"
  | "ABANDON"
  | "DIPLOME"
  | "ARCHIVE";

export const LIBELLES_STATUT: Record<StatutEleve, string> = {
  CANDIDAT: "Candidat",
  PRE_INSCRIT: "Pré-inscrit",
  INSCRIT: "Inscrit",
  SUSPENDU_DISCIPLINE: "Suspendu (discipline)",
  SUSPENDU_IMPAYE: "Suspendu (impayé)",
  EXCLU: "Exclu",
  TRANSFERE: "Transféré",
  ABANDON: "Abandon",
  DIPLOME: "Diplômé",
  ARCHIVE: "Archivé",
};

/**
 * Ton visuel par statut.
 *
 * La couleur porte du sens, jamais de la décoration — et elle n'est jamais
 * le seul véhicule de l'information : le badge affiche toujours son libellé.
 */
export const TONS_STATUT: Record<StatutEleve, "succes" | "alerte" | "danger" | "neutre"> = {
  CANDIDAT: "neutre",
  PRE_INSCRIT: "neutre",
  INSCRIT: "succes",
  SUSPENDU_DISCIPLINE: "alerte",
  SUSPENDU_IMPAYE: "alerte",
  EXCLU: "danger",
  TRANSFERE: "neutre",
  ABANDON: "danger",
  DIPLOME: "neutre",
  ARCHIVE: "neutre",
};

export const LIENS_PARENTE = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur",
  ONCLE: "Oncle",
  TANTE: "Tante",
  GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / Sœur",
  AUTRE: "Autre",
} as const;

export type LienParente = keyof typeof LIENS_PARENTE;

/** Libellé d'un statut, tolérant à une valeur inconnue venue de la base. */
export function libelleStatut(statut: string): string {
  return LIBELLES_STATUT[statut as StatutEleve] ?? statut;
}

/** Ton visuel d'un statut, avec repli neutre. */
export function tonStatut(statut: string): "succes" | "alerte" | "danger" | "neutre" {
  return TONS_STATUT[statut as StatutEleve] ?? "neutre";
}
