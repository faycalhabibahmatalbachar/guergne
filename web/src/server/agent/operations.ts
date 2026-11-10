import { eq } from "drizzle-orm";

import {
  changerClasse,
  changerStatut,
  inscrireEleve,
  modifierEleve,
} from "@/app/(main)/dashboard/eleves/actions";
import { creerClasse, modifierClasse } from "@/app/(main)/dashboard/parametres/actions";
import { executerEnTantQue } from "@/server/auth/acteur-delegue";
import type { Principal } from "@/server/auth/session";
import { db } from "@/server/db";
import { classes, eleves } from "@/server/db/schema";
import { archiverClassePour } from "@/server/domain/classes-ecritures";
import { chargerDossier, listerClassesCourantes, listerEleves, statistiquesEleves } from "@/server/domain/eleves";
import {
  enregistrerAppelPour,
  enregistrerRetardPour,
  justifierEnLotPour,
  supprimerAbsencePour,
} from "@/server/domain/assiduite-ecritures";
import { calendrierEvaluations, listerEvaluations, releveEleve } from "@/server/domain/evaluations";
import { listerSituations, recouvrementParClasse, statistiquesFinancieres } from "@/server/domain/finances";
import { listerNiveaux, listerPeriodes, listerSeries } from "@/server/domain/parametres";
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
  compterAbsences,
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
    // La reponse porte le TOTAL a cote des lignes. Sans lui, 100 lignes sur
    // 211 se lisent comme « 100 absences », et rien ne signale le contraire.
    executer: async (p) => {
      const filtres = {
        periodeId: s(p.periodeId),
        classeId: s(p.classeId),
        statut: s(p.statut),
        depuis: s(p.depuis),
        jusqua: s(p.jusqua),
      };
      const limite = Math.min(n(p.limite, 100), 500);
      const [lignes, total] = await Promise.all([listerAbsences({ ...filtres, limite }), compterAbsences(filtres)]);
      return { lignes, total, limite, tronque: total > lignes.length };
    },
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
  // `anneeId` est désormais transmis. La fonction de domaine l'acceptait déjà,
  // mais l'opération l'ignorait : elle rendait toujours l'année COURANTE. Depuis
  // l'ouverture de 2026-2027 — encore sans classes — il était donc impossible de
  // consulter les classes de 2025-2026, même en nommant l'année.
  listerClasses: { permission: "classe:lire", executer: (p) => listerClassesCourantes(s(p.anneeId)) },
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
  // Le dossier complet d'un élève : identité, inscription, tuteurs. C'est la
  // lecture qui sert aussi de VÉRIFICATION après une écriture — l'agent ne dit
  // « fait » qu'après avoir relu ce que le backend a réellement enregistré.
  consulterEleve: {
    permission: "eleve:lire",
    executer: async (p) => {
      const eleveId = s(p.eleveId);
      if (!eleveId) throw new TypeError("eleveId requis");
      return (await chargerDossier(eleveId)) ?? { ok: false, message: "Élève introuvable." };
    },
  },
  // Niveaux et séries : ce qu'il faut pour créer une classe sans que personne
  // n'ait à dicter un identifiant.
  listerNiveaux: { permission: "classe:lire", executer: () => listerNiveaux() },
  listerSeries: { permission: "classe:lire", executer: () => listerSeries(true) },

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

  // --- Élèves, classes, inscriptions ----------------------------------------
  //
  // CES ÉCRITURES N'ONT PAS ÉTÉ RÉÉCRITES : ELLES SONT EMPRUNTÉES.
  //
  // Elles existaient déjà, éprouvées, dans les actions de l'interface web :
  // détection des homonymes, matricule tiré d'une séquence verrouillée,
  // transaction unique élève + inscription + tuteurs + statut, audit dans la
  // transaction. Les recopier aurait créé une seconde implémentation, et la
  // première divergence aurait été une faille.
  //
  // `executerEnTantQue` les exécute au nom de l'acteur que la route a vérifié
  // (jeton + compte rechargé) : l'action y lit son auteur comme elle lirait une
  // session web, et refait sa propre vérification de droits. Voir
  // `@/server/auth/acteur-delegue`.
  inscrireEleve: {
    permission: "eleve:inscrire",
    executer: (p, acteur) => executerEnTantQue(acteur, () => inscrireEleve(p)),
  },
  modifierEleve: {
    permission: "eleve:modifier",
    executer: async (p, acteur) => {
      const eleveId = s(p.eleveId);
      if (!eleveId) throw new TypeError("eleveId requis");
      const demandees = (p.modifications && typeof p.modifications === "object" ? p.modifications : {}) as Record<string, unknown>;
      const [actuel] = await db.select().from(eleves).where(eq(eleves.id, eleveId)).limit(1);
      if (!actuel) return { ok: false, message: "Élève introuvable." };
      // L'action web attend le dossier ENTIER ; l'agent n'en change qu'une
      // partie. On part donc de l'état relu en base, et l'on n'y superpose que
      // les champs de la liste blanche : le modèle ne peut pas glisser un
      // `statut`, un `matricule` ou un identifiant dans une « modification ».
      const fusion: Record<string, unknown> = {};
      for (const champ of CHAMPS_ELEVE_MODIFIABLES) {
        fusion[champ] = champ in demandees ? demandees[champ] : (actuel as Record<string, unknown>)[champ];
      }
      const ignores = Object.keys(demandees).filter((c) => !CHAMPS_ELEVE_MODIFIABLES.includes(c as never));
      if (ignores.length > 0) {
        return { ok: false, message: `Champ(s) non modifiable(s) par cette opération : ${ignores.join(", ")}.` };
      }
      return executerEnTantQue(acteur, () => modifierEleve(eleveId, nullsEnVide(fusion)));
    },
  },
  changerClasseEleve: {
    // `classeId` désigne la classe de DESTINATION : c'est elle que la route
    // soumet au contrôle de périmètre avant l'exécution.
    permission: "eleve:affecter",
    executer: (p, acteur) => {
      const inscriptionId = s(p.inscriptionId);
      const classeId = s(p.classeId);
      if (!inscriptionId || !classeId) throw new TypeError("inscriptionId et classeId requis");
      return executerEnTantQue(acteur, () => changerClasse(inscriptionId, classeId, s(p.motif) ?? ""));
    },
  },
  archiverEleve: {
    // L'archivage passe par l'historique des statuts : un déclencheur reporte
    // la valeur sur la fiche. Rien n'est supprimé, tout reste consultable.
    permission: "eleve:modifier",
    executer: (p, acteur) => {
      const eleveId = s(p.eleveId);
      if (!eleveId) throw new TypeError("eleveId requis");
      return executerEnTantQue(acteur, () => changerStatut(eleveId, "ARCHIVE", { motif: s(p.motif) ?? "" }));
    },
  },
  creerClasse: {
    permission: "classe:creer",
    executer: async (p, acteur) => {
      // L'année n'est jamais dictée : « crée la 6ème C » vise l'année courante.
      const anneeId = await anneeDeTravail(p);
      if (!anneeId) return { ok: false, message: "Aucune année scolaire en cours." };
      return executerEnTantQue(acteur, () =>
        creerClasse({
          anneeId,
          niveauId: p.niveauId,
          serieId: s(p.serieId) ?? null,
          libelle: p.libelle,
          code: p.code,
          capaciteMax: p.capaciteMax,
        }),
      );
    },
  },
  modifierClasse: {
    permission: "classe:modifier",
    executer: async (p, acteur) => {
      const classeId = s(p.classeId);
      if (!classeId) throw new TypeError("classeId requis");
      const [actuelle] = await db.select().from(classes).where(eq(classes.id, classeId)).limit(1);
      if (!actuelle) return { ok: false, message: "Classe introuvable." };
      const demandees = (p.modifications && typeof p.modifications === "object" ? p.modifications : {}) as Record<string, unknown>;
      const ignores = Object.keys(demandees).filter((c) => !CHAMPS_CLASSE_MODIFIABLES.includes(c as never));
      if (ignores.length > 0) {
        return { ok: false, message: `Champ(s) non modifiable(s) par cette opération : ${ignores.join(", ")}.` };
      }
      // `anneeId` vient de la classe elle-même : une modification ne déplace
      // jamais une classe d'une année à l'autre (l'action web ne l'écrit pas).
      return executerEnTantQue(acteur, () =>
        modifierClasse(classeId, {
          anneeId: actuelle.anneeId,
          niveauId: demandees.niveauId ?? actuelle.niveauId,
          serieId: "serieId" in demandees ? demandees.serieId : actuelle.serieId,
          libelle: demandees.libelle ?? actuelle.libelle,
          code: demandees.code ?? actuelle.code,
          capaciteMax: demandees.capaciteMax ?? actuelle.capaciteMax,
        }),
      );
    },
  },
  archiverClasse: {
    // Jamais `supprimerClasse` : c'est un DELETE, et la grille horaire de la
    // classe part avec elle en cascade. L'agent archive, il ne détruit pas.
    permission: "classe:modifier",
    executer: (p, acteur) => archiverClassePour(acteur, p),
  },
};

/**
 * Les champs du dossier élève qu'une modification par l'agent peut toucher.
 *
 * Exactement ceux que `modifierEleve` écrit. Ni `statut` (il passe par
 * l'historique des statuts), ni `matricule` (il est attribué par séquence), ni
 * aucun identifiant.
 */
const CHAMPS_ELEVE_MODIFIABLES = [
  "nom", "prenom", "sexe", "dateNaissance", "lieuNaissance", "nationalite", "acteNaissanceNumero",
  "adresse", "quartier", "telephone", "email", "groupeSanguin", "allergies", "observationsMedicales",
  "situationParticuliere", "urgenceNom", "urgenceTelephone", "urgenceLien", "ecoleOrigine",
] as const;

const CHAMPS_CLASSE_MODIFIABLES = ["niveauId", "serieId", "libelle", "code", "capaciteMax"] as const;

/**
 * Le schéma web attend des chaînes pour les champs facultatifs : un `null` relu
 * en base le ferait échouer sur un champ que l'agent n'a même pas touché.
 */
function nullsEnVide(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? ""]));
}

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
