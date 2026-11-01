import type { Principal } from "@/server/auth/session";
import { listerClassesCourantes, listerEleves, statistiquesEleves } from "@/server/domain/eleves";
import {
  enregistrerAppelPour,
  enregistrerRetardPour,
  justifierEnLotPour,
  supprimerAbsencePour,
} from "@/server/domain/assiduite-ecritures";
import { calendrierEvaluations, listerEvaluations, releveEleve } from "@/server/domain/evaluations";
import { listerSituations, recouvrementParClasse, statistiquesFinancieres } from "@/server/domain/finances";
import { listerPeriodes } from "@/server/domain/parametres";
import { listerTuteurs, statistiquesParents, tuteursDeLEleve } from "@/server/domain/parents";
import { chargerEmploiDuTemps, listerEnseignants, listerClassesEtMatieres } from "@/server/domain/personnel";
import {
  absencesParMois,
  classementClasses,
  effectifsParNiveau,
  indicateursCles,
  moyennesParClasse,
  resultatsParMatiere,
} from "@/server/domain/pilotage";
import { chargerAnneeCourante, chargerStatistiques } from "@/server/domain/tableau-de-bord";
import {
  chargerConduiteClasse,
  listerAbsences,
  listerAlertes,
  listerElevesClasse,
  listerIncidents,
  listerRetards,
  listerSanctions,
  statistiquesVieScolaire,
} from "@/server/domain/vie-scolaire";
import type { Action } from "@/server/guard/permissions";

import { classerOperation } from "./porte";

/**
 * Opérations exposées à l'agent IA, séparées par RISQUE.
 *
 * POURQUOI CETTE SÉPARATION EXISTE
 * ---------------------------------
 * Les lectures et les écritures n'ont pas le même risque, et elles ne doivent
 * donc pas voyager ensemble. Tant que tout vivait dans un seul objet, mettre
 * l'agent en production signifiait mettre en ligne, d'un même geste, la
 * création et la suppression d'absences — avec le déclencheur qui notifie les
 * tuteurs.
 *
 * La séparation permet de livrer les consultations seules. Les écritures
 * restent dans le même dépôt, testées, prêtes, mais **éteintes par défaut** :
 * il faut poser `AGENT_ECRITURES_ACTIVES=true` pour qu'elles répondent. Un
 * retour arrière est donc un changement de variable, pas un déploiement.
 *
 * CE QUE LA SÉPARATION NE CHANGE PAS
 * -----------------------------------
 * Chaque opération, lecture comprise, passe par le `guard` : rôle réel de
 * l'acteur, périmètre réel de ses données. Le jeton de service n'accorde aucun
 * droit métier.
 */

export type Executeur = (params: Record<string, unknown>, acteur: Principal) => Promise<unknown>;

export interface OutilExpose {
  permission: Action;
  executer: Executeur;
}

const s = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
/** Statuts d'eleve acceptes comme filtre. */
const STATUTS_ELEVE = [
  "CANDIDAT", "PRE_INSCRIT", "INSCRIT", "SUSPENDU_DISCIPLINE", "SUSPENDU_IMPAYE",
  "EXCLU", "TRANSFERE", "ABANDON", "DIPLOME", "ARCHIVE",
] as const;

const n = (v: unknown, defaut: number): number => (typeof v === "number" && Number.isFinite(v) ? v : defaut);

/**
 * Année scolaire de travail.
 *
 * La plupart des lectures de pilotage en exigent une. L'utilisateur ne la
 * nomme jamais : il dit « cette année ». On résout donc l'année courante quand
 * elle n'est pas fournie, plutôt que de réclamer un identifiant que personne
 * ne connaît.
 */
async function anneeDeTravail(params: Record<string, unknown>): Promise<string | null> {
  return s(params.anneeId) ?? (await chargerAnneeCourante())?.id ?? null;
}

/** Les consultations. Aucune n'écrit quoi que ce soit. */
export const OPERATIONS_LECTURE: Record<string, OutilExpose> = {
  // --- Vie scolaire ---------------------------------------------------------
  listerAbsences: {
    permission: "assiduite:lire",
    executer: (p) =>
      listerAbsences({
        periodeId: s(p.periodeId),
        classeId: s(p.classeId),
        statut: s(p.statut),
        depuis: s(p.depuis),
        jusqua: s(p.jusqua),
        limite: n(p.limite, 100),
      }),
  },
  listerRetards: {
    permission: "assiduite:lire",
    executer: (p) => listerRetards({ periodeId: s(p.periodeId), classeId: s(p.classeId), limite: n(p.limite, 100) }),
  },
  listerAlertes: { permission: "assiduite:lire", executer: (p) => listerAlertes(s(p.periodeId)) },
  statistiquesVieScolaire: {
    permission: "assiduite:lire",
    executer: (p) => statistiquesVieScolaire(s(p.periodeId) ?? null),
  },
  listerElevesClasse: {
    permission: "eleve:lire",
    executer: (p) => {
      const classeId = s(p.classeId);
      if (!classeId) throw new TypeError("classeId requis");
      return listerElevesClasse(classeId);
    },
  },
  chargerConduiteClasse: {
    permission: "assiduite:lire",
    executer: (p) => {
      const classeId = s(p.classeId);
      const periodeId = s(p.periodeId);
      if (!classeId || !periodeId) throw new TypeError("classeId et periodeId requis");
      return chargerConduiteClasse(classeId, periodeId);
    },
  },
  listerIncidents: {
    permission: "discipline:lire",
    executer: (p) => listerIncidents({ periodeId: s(p.periodeId), classeId: s(p.classeId), limite: n(p.limite, 100) }),
  },
  listerSanctions: {
    permission: "discipline:lire",
    executer: (p) => listerSanctions({ periodeId: s(p.periodeId), classeId: s(p.classeId), limite: n(p.limite, 100) }),
  },

  // --- Référentiel ----------------------------------------------------------
  // Sans ces lectures, l'agent est inutilisable par un humain : le reste du
  // catalogue ne parle qu'en UUID, alors qu'un surveillant dit « la 6ème B ».
  listerClasses: { permission: "classe:lire", executer: () => listerClassesCourantes() },
  listerPeriodes: {
    permission: "assiduite:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? listerPeriodes(anneeId) : [];
    },
  },
  anneeCourante: { permission: "classe:lire", executer: () => chargerAnneeCourante() },

  // --- Élèves ---------------------------------------------------------------
  rechercherEleves: {
    permission: "eleve:lire",
    executer: (p) =>
      listerEleves({
        recherche: s(p.recherche),
        classeId: s(p.classeId),
        // Le statut est une enumeration : on ne laisse pas passer une chaine
        // libre, qui produirait un filtre silencieusement ignore.
        statut: STATUTS_ELEVE.includes(s(p.statut) as never) ? (s(p.statut) as never) : undefined,
        page: n(p.page, 1),
        parPage: Math.min(n(p.parPage, 25), 100),
      }),
  },
  statistiquesEleves: { permission: "eleve:lire", executer: async (p) => statistiquesEleves(await anneeDeTravail(p) ?? undefined) },

  // --- Parents et responsables ---------------------------------------------
  rechercherTuteurs: {
    permission: "tuteur:gerer",
    executer: (p) => listerTuteurs({ recherche: s(p.recherche), page: n(p.page, 1), parPage: Math.min(n(p.parPage, 25), 100) }),
  },
  statistiquesParents: { permission: "tuteur:gerer", executer: () => statistiquesParents() },
  tuteursDeLEleve: {
    permission: "eleve:lire",
    executer: (p) => {
      const eleveId = s(p.eleveId);
      if (!eleveId) throw new TypeError("eleveId requis");
      return tuteursDeLEleve(eleveId);
    },
  },

  // --- Personnel ------------------------------------------------------------
  listerEnseignants: {
    permission: "classe:lire",
    executer: async (p) => listerEnseignants(await anneeDeTravail(p), { recherche: s(p.recherche) }),
  },
  listerClassesEtMatieres: {
    permission: "classe:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? listerClassesEtMatieres(anneeId) : [];
    },
  },

  // --- Emploi du temps ------------------------------------------------------
  chargerEmploiDuTemps: {
    permission: "emploi_du_temps:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      const classeId = s(p.classeId);
      const enseignantId = s(p.enseignantId);
      if (!anneeId) return [];
      if (!classeId && !enseignantId) throw new TypeError("classeId ou enseignantId requis");
      return chargerEmploiDuTemps(anneeId, classeId ? { type: "classe", id: classeId } : { type: "enseignant", id: enseignantId! });
    },
  },

  // --- Pédagogie ------------------------------------------------------------
  listerEvaluations: {
    permission: "evaluation:lire",
    executer: (p) => {
      const periodeId = s(p.periodeId);
      if (!periodeId) throw new TypeError("periodeId requis");
      return listerEvaluations({ periodeId, classeId: s(p.classeId), matiereId: s(p.matiereId) });
    },
  },
  calendrierEvaluations: {
    permission: "evaluation:lire",
    executer: (p) => {
      const periodeId = s(p.periodeId);
      if (!periodeId) throw new TypeError("periodeId requis");
      return calendrierEvaluations(periodeId, { classeId: s(p.classeId), type: s(p.type) });
    },
  },
  releveEleve: {
    permission: "note:lire",
    executer: (p) => {
      const inscriptionId = s(p.inscriptionId);
      const periodeId = s(p.periodeId);
      if (!inscriptionId || !periodeId) throw new TypeError("inscriptionId et periodeId requis");
      return releveEleve(inscriptionId, periodeId);
    },
  },

  // --- Pilotage -------------------------------------------------------------
  indicateursCles: {
    permission: "statistique:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? indicateursCles(anneeId, s(p.periodeId) ?? null) : null;
    },
  },
  effectifsParNiveau: {
    permission: "statistique:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? effectifsParNiveau(anneeId) : [];
    },
  },
  absencesParMois: {
    permission: "statistique:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? absencesParMois(anneeId) : [];
    },
  },
  moyennesParClasse: {
    permission: "note:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? moyennesParClasse(anneeId, s(p.periodeId) ?? null) : [];
    },
  },
  classementClasses: {
    permission: "note:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? classementClasses(anneeId, s(p.periodeId) ?? null) : [];
    },
  },
  resultatsParMatiere: { permission: "note:lire", executer: (p) => resultatsParMatiere(s(p.periodeId) ?? null) },
  statistiquesEtablissement: { permission: "statistique:lire", executer: () => chargerStatistiques() },

  // --- Finances -------------------------------------------------------------
  statistiquesFinancieres: {
    permission: "finance:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? statistiquesFinancieres(anneeId) : null;
    },
  },
  recouvrementParClasse: {
    permission: "finance:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      return anneeId ? recouvrementParClasse(anneeId) : [];
    },
  },
  listerSituationsFinancieres: {
    permission: "finance:lire",
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      if (!anneeId) return { lignes: [], total: 0 };
      return listerSituations({
        anneeId,
        classeId: s(p.classeId),
        seulementImpayes: p.seulementImpayes === true,
        recherche: s(p.recherche),
      });
    },
  },
};

/**
 * Les écritures.
 *
 * Elles passent par le MÊME noyau que l'écran Assiduité
 * (`@/server/domain/assiduite-ecritures`) : une seule implémentation, donc
 * aucune divergence possible entre le chemin web et le chemin WhatsApp.
 *
 * Elles ne répondent que si `AGENT_ECRITURES_ACTIVES=true`. Ce n'est pas une
 * précaution décorative : insérer une absence déclenche la file de
 * notification des tuteurs. Mettre les consultations en ligne ne doit pas
 * mettre cela en ligne du même geste.
 */
export const OPERATIONS_ECRITURE: Record<string, OutilExpose> = {
  enregistrerAppel: { permission: "assiduite:saisir", executer: (p, acteur) => enregistrerAppelPour(acteur, p) },
  enregistrerRetard: { permission: "retard:saisir", executer: (p, acteur) => enregistrerRetardPour(acteur, p) },
  justifierEnLot: {
    permission: "assiduite:justifier",
    executer: (p, acteur) => {
      const ids = Array.isArray(p.absenceIds) ? (p.absenceIds as string[]) : [];
      const statut = p.statut === "NON_JUSTIFIEE" ? "NON_JUSTIFIEE" : "JUSTIFIEE";
      return justifierEnLotPour(acteur, ids, statut, s(p.motif) ?? "");
    },
  },
  supprimerAbsence: {
    permission: "assiduite:saisir",
    executer: (p, acteur) => {
      const id = s(p.absenceId);
      if (!id) throw new TypeError("absenceId requis");
      return supprimerAbsencePour(acteur, id, s(p.motif) ?? "");
    },
  },
};

/**
 * Opération demandée, et pourquoi elle n'est pas disponible le cas échéant.
 *
 * La décision elle-même vit dans `porte.ts`, sans dépendance au domaine : elle
 * est la seule chose qui rende une mise en production acceptable, et elle doit
 * pouvoir être éprouvée sans ouvrir une base.
 */
export function trouverOperation(
  action: string,
  env: NodeJS.ProcessEnv = process.env,
): { outil: OutilExpose } | { erreur: "inconnue" | "desactivee" } {
  const c = classerOperation(action, Object.keys(OPERATIONS_LECTURE), Object.keys(OPERATIONS_ECRITURE), env);
  if (c.genre === "lecture") return { outil: OPERATIONS_LECTURE[action] };
  if (c.genre === "ecriture") return { outil: OPERATIONS_ECRITURE[action] };
  return { erreur: c.genre };
}

export { ecrituresActives } from "./porte";
