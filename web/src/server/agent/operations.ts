import { eq, sql } from "drizzle-orm";

import {
  changerClasse,
  changerStatut,
  detacherTuteur,
  inscrireEleve,
  modifierEleve,
  modifierResponsabilitesTuteur,
  rattacherTuteur,
} from "@/app/(main)/dashboard/eleves/actions";
import { creerClasse, modifierClasse } from "@/app/(main)/dashboard/parametres/actions";
import { apercuNotificationsGroupe, envoyerNotificationsGroupe } from "@/app/(main)/dashboard/parents/actions-groupe";
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
import { calendrierEvaluations, listerEvaluations } from "@/server/domain/evaluations";
import { listerSituations, recouvrementParClasse, statistiquesFinancieres } from "@/server/domain/finances";
import { listerAnnees, listerNiveaux, listerPeriodes, listerSeries } from "@/server/domain/parametres";
import { listerTuteurs, statistiquesParents, tuteursDeLEleve } from "@/server/domain/parents";
import { releveDetailleEleve } from "@/server/domain/releve-eleve";
import { chargerFicheEleve } from "@/server/domain/fiche-eleve";
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
  compterRetards,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | undefined => (typeof v === "string" && UUID_RE.test(v) ? v : undefined);

/**
 * Les statuts qu'un agent peut faire prononcer. Ni DIPLOME ni ARCHIVE (ce
 * dernier a son opération dédiée, `archiverEleve`).
 */
const STATUTS_AGENT = ["TRANSFERE", "ABANDON", "EXCLU", "SUSPENDU_DISCIPLINE", "SUSPENDU_IMPAYE", "INSCRIT"] as const;

/** Les états d'accès d'un parent que `construireFiltreTuteurs` sait filtrer. */
const ETATS_TUTEUR = ["sans_compte", "invite", "actif", "revoque", "doublon"] as const;

/**
 * La période désignée, dans l'année de travail.
 *
 * Personne ne dicte l'UUID d'un trimestre. On accepte donc, dans l'ordre :
 * un `periodeId`, un `periodeNumero` (1, 2, 3), ou rien — auquel cas c'est la
 * période qui contient aujourd'hui, et à défaut la dernière commencée. Une
 * période d'une autre année que celle demandée n'est jamais retenue.
 */
async function periodeDeTravail(p: Record<string, unknown>, anneeId: string): Promise<string | null> {
  const id = uuid(p.periodeId);
  const numero = typeof p.periodeNumero === "number" && Number.isInteger(p.periodeNumero) ? p.periodeNumero : null;
  const r = await db.execute<{ id: string }>(sql`
    SELECT id FROM periodes
     WHERE annee_id = ${anneeId}::uuid
       AND (${id ?? null}::uuid IS NULL OR id = ${id ?? null}::uuid)
       AND (${numero}::int IS NULL OR numero = ${numero}::int)
     ORDER BY (CURRENT_DATE BETWEEN date_debut AND date_fin) DESC,
              (date_debut <= CURRENT_DATE) DESC,
              CASE WHEN date_debut <= CURRENT_DATE THEN date_debut END DESC NULLS LAST,
              numero
     LIMIT 1
  `);
  return r.rows[0]?.id ?? null;
}

/**
 * L'inscription d'un élève pour l'année de travail.
 *
 * Une inscription d'une AUTRE année n'est jamais rendue à la place : confondre
 * l'historique et l'année courante est exactement l'erreur à éviter.
 */
async function inscriptionDeTravail(p: Record<string, unknown>): Promise<{ inscriptionId: string; anneeId: string } | null> {
  const inscriptionId = uuid(p.inscriptionId);
  if (inscriptionId) {
    const r = await db.execute<{ annee_id: string }>(sql`SELECT annee_id FROM inscriptions WHERE id = ${inscriptionId}::uuid`);
    return r.rows[0] ? { inscriptionId, anneeId: r.rows[0].annee_id } : null;
  }
  const eleveId = uuid(p.eleveId);
  const anneeId = await anneeDeTravail(p);
  if (!eleveId || !anneeId) return null;
  const r = await db.execute<{ id: string }>(sql`
    SELECT id FROM inscriptions
     WHERE eleve_id = ${eleveId}::uuid AND annee_id = ${anneeId}::uuid
     ORDER BY active DESC, date_inscription DESC
     LIMIT 1
  `);
  return r.rows[0] ? { inscriptionId: r.rows[0].id, anneeId } : null;
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
        eleveId: uuid(p.eleveId),
      };
      const limite = Math.min(n(p.limite, 100), 500);
      const [lignes, total] = await Promise.all([listerAbsences({ ...filtres, limite }), compterAbsences(filtres)]);
      return { lignes, total, limite, tronque: total > lignes.length };
    },
  },
  listerRetards: {
    permission: "assiduite:lire",
    // Même contrat que les absences : les lignes ET le total, avec les filtres
    // par élève et par dates que « les retards de la semaine » exige.
    executer: async (p) => {
      const filtres = { periodeId: s(p.periodeId), classeId: s(p.classeId), eleveId: uuid(p.eleveId), depuis: s(p.depuis), jusqua: s(p.jusqua) };
      const limite = Math.min(n(p.limite, 100), 500);
      const [lignes, total] = await Promise.all([listerRetards({ ...filtres, limite }), compterRetards(filtres)]);
      return { lignes, total, limite, tronque: total > lignes.length };
    },
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
    executer: (p) =>
      listerIncidents({ periodeId: s(p.periodeId), classeId: s(p.classeId), eleveId: uuid(p.eleveId), depuis: s(p.depuis), jusqua: s(p.jusqua), limite: n(p.limite, 100) }),
  },
  listerSanctions: {
    permission: "discipline:lire",
    executer: (p) => listerSanctions({ periodeId: s(p.periodeId), classeId: s(p.classeId), eleveId: uuid(p.eleveId), limite: n(p.limite, 100) }),
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
  // Le DEVIS d'une notification aux parents, avant tout envoi : destinataires
  // joignables, canal réel de chacun (push, SMS, boîte interne), SMS
  // dédoublonnés, consentement respecté, coût en FCFA et empreinte de
  // l'audience. C'est l'action de l'écran « Notifier un groupe », telle quelle.
  devisNotificationParents: {
    permission: "message:envoyer",
    executer: (p, acteur) => executerEnTantQue(acteur, () => apercuNotificationsGroupe(p)),
  },
  // La fiche complète : les mêmes chargeurs et les mêmes droits, section par
  // section, que la page /dashboard/eleves/[id]. Le droit d'entrée est
  // `eleve:lire` ; notes, finances, assiduité, discipline, santé et journal
  // sont filtrés à l'intérieur selon l'acteur, et nommés quand ils sont masqués.
  ficheEleve: {
    permission: "eleve:lire",
    executer: async (p, acteur) => {
      const eleveId = uuid(p.eleveId);
      if (!eleveId) throw new TypeError("eleveId requis");
      return (await chargerFicheEleve(eleveId, acteur)) ?? { ok: false, message: "Élève introuvable." };
    },
  },
  // Niveaux et séries : ce qu'il faut pour créer une classe sans que personne
  // n'ait à dicter un identifiant.
  // Les années enregistrées : pour dire « je n'ai rien sur 2019-2020 » plutôt
  // que de servir l'année en cours sous un autre nom.
  listerAnnees: { permission: "classe:lire", executer: () => listerAnnees() },
  listerNiveaux: { permission: "classe:lire", executer: () => listerNiveaux() },
  listerSeries: { permission: "classe:lire", executer: () => listerSeries(true) },

  // --- Parents et responsables ---------------------------------------------
  rechercherTuteurs: {
    permission: "tuteur:gerer",
    // `etat` et `classeId` sont honorés par le domaine depuis toujours ; ne pas
    // les transmettre rendait « quels parents n'ont pas activé leur compte ? »
    // impossible à poser. Un état inconnu est ignoré, jamais interprété.
    executer: (p) =>
      listerTuteurs({
        recherche: s(p.recherche),
        etat: (ETATS_TUTEUR as readonly string[]).includes(String(p.etat)) ? String(p.etat) : undefined,
        classeId: uuid(p.classeId),
        page: n(p.page, 1),
        parPage: Math.min(n(p.parPage, 25), 100),
      }),
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
    executer: async (p) => {
      const anneeId = await anneeDeTravail(p);
      const periodeId = anneeId ? await periodeDeTravail(p, anneeId) : null;
      if (!periodeId) return { ok: false, message: "Aucune période correspondante pour cette année scolaire." };
      return calendrierEvaluations(periodeId, { classeId: uuid(p.classeId), type: s(p.type) });
    },
  },
  releveEleve: {
    permission: "note:lire",
    executer: async (p) => {
      if (!uuid(p.inscriptionId) && !uuid(p.eleveId)) throw new TypeError("eleveId ou inscriptionId requis");
      const ins = await inscriptionDeTravail(p);
      if (!ins) return { ok: false, message: "Aucune inscription de cet élève pour l'année demandée." };
      const periodeId = await periodeDeTravail(p, ins.anneeId);
      if (!periodeId) return { ok: false, message: "Aucune période correspondante pour cette année scolaire." };
      return (await releveDetailleEleve(ins.inscriptionId, periodeId)) ?? { ok: false, message: "Relevé introuvable." };
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
        enRetard: p.enRetard === true,
        boursier: typeof p.boursier === "boolean" ? p.boursier : undefined,
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

  // L'envoi, par la même action que l'écran : elle refuse si l'audience a
  // changé depuis le devis (empreinte), si le coût dépasse le plafond accepté,
  // ou si une diffusion large n'est pas explicitement confirmée ; la clé
  // d'envoi rend un second appel inoffensif. Les SMS ne partent qu'aux
  // numéros qui y ont consenti.
  envoyerNotificationParents: {
    permission: "message:envoyer",
    executer: (p, acteur) => executerEnTantQue(acteur, () => envoyerNotificationsGroupe(p)),
  },

  // --- Situation scolaire : transfert, abandon, exclusion, suspension --------
  // `changerStatut` est le parcours de l'écran : historique des statuts (jamais
  // `eleves.statut` en direct), clôture de l'inscription de l'année pour un
  // départ, refus de toute décision sur un élève déjà parti, audit, file des
  // notifications. Le DROIT réel dépend du statut (eleve:exclure,
  // eleve:transferer, eleve:suspendre…) et c'est l'action qui l'exige :
  // l'entrée ne demande que de pouvoir lire l'élève.
  changerStatutEleve: {
    permission: "eleve:lire",
    executer: (p, acteur) => {
      const eleveId = uuid(p.eleveId);
      const statut = String(p.statut ?? "");
      if (!eleveId) throw new TypeError("eleveId requis");
      if (!(STATUTS_AGENT as readonly string[]).includes(statut)) {
        return Promise.resolve({ ok: false, message: `Statut non autorisé par cette voie : ${statut}.` });
      }
      return executerEnTantQue(acteur, () =>
        changerStatut(eleveId, statut as (typeof STATUTS_AGENT)[number], {
          motif: s(p.motif) ?? "",
          dateEffet: s(p.dateEffet),
          dateFinPrevue: s(p.dateFinPrevue),
          etablissement: s(p.etablissement),
        }),
      );
    },
  },

  // --- Parents et responsabilités --------------------------------------------
  // Les MÊMES actions que la fiche élève (gestion-tuteurs.tsx). Ce qui les
  // rend sûres pour l'agent est dans l'action, pas ici : réutilisation d'une
  // fiche existante (par identifiant, puis par les chiffres du numéro),
  // refus d'un double rattachement, transfert — et non retrait — du
  // responsable principal, un tuteur au moins conservé, audit.
  rattacherTuteur: {
    permission: "tuteur:gerer",
    executer: (p, acteur) => {
      const eleveId = uuid(p.eleveId);
      if (!eleveId) throw new TypeError("eleveId requis");
      const { eleveId: _ignore, ...tuteur } = p;
      return executerEnTantQue(acteur, () => rattacherTuteur(eleveId, tuteur));
    },
  },
  detacherTuteur: {
    permission: "tuteur:gerer",
    executer: (p, acteur) => {
      const eleveId = uuid(p.eleveId);
      const tuteurId = uuid(p.tuteurId);
      if (!eleveId || !tuteurId) throw new TypeError("eleveId et tuteurId requis");
      return executerEnTantQue(acteur, () => detacherTuteur(eleveId, tuteurId));
    },
  },
  modifierResponsabilitesTuteur: {
    permission: "tuteur:gerer",
    executer: (p, acteur) => {
      const eleveId = uuid(p.eleveId);
      const tuteurId = uuid(p.tuteurId);
      if (!eleveId || !tuteurId) throw new TypeError("eleveId et tuteurId requis");
      return executerEnTantQue(acteur, () => modifierResponsabilitesTuteur(eleveId, tuteurId, p.responsabilites));
    },
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
