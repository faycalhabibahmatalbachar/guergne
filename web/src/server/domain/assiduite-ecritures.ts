import { revalidatePath } from "next/cache";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import type { Principal } from "@/server/auth/session";
import { db } from "@/server/db";
import { absences, evenementsCalendrier, periodes, retards } from "@/server/db/schema";

import { type PlageVacances, validerDateAssiduite } from "./assiduite-dates";

/**
 * Noyau des écritures de vie scolaire.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Ces opérations ont deux appelants : les actions serveur de l'écran Assiduité
 * (session navigateur) et l'API agent (pilotage WhatsApp). Les écrire deux fois
 * ferait diverger les règles métier — et c'est précisément sur une divergence de
 * ce genre qu'un contrôle finit par sauter.
 *
 * CE MODULE NE DÉCIDE PAS DES DROITS
 * -----------------------------------
 * Chaque fonction reçoit l'acteur DÉJÀ autorisé. L'autorisation est faite par
 * l'appelant (`requirePermission` côté action, `exigerPermissionPour` côté API).
 * Il est délibérément hors d'un fichier `"use server"` : un export de ce type est
 * un point d'entrée public, et exposer une fonction qui accepte un acteur
 * arbitraire laisserait n'importe quel client choisir son identité.
 */

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

const OK: Resultat = { ok: true };

export function messagesZod(e: z.ZodError): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of e.issues) {
    const c = String(p.path[0] ?? "_");
    if (!s[c]) s[c] = p.message;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Contrôle du calendrier, commun à l'appel et au retard
// ---------------------------------------------------------------------------

/**
 * Confronte la date saisie à la période visée et au calendrier de l'année.
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ----------------------------
 * La production porte 23 absences datées d'un dimanche : rien n'a jamais
 * regardé la date. Une absence hors jour de classe gonfle le cumul horaire du
 * bulletin et fait partir une notification aux tuteurs pour un cours qui n'a
 * pas eu lieu.
 *
 * CE QU'IL LIT, ET CE QU'IL NE PEUT PAS LIRE
 * -------------------------------------------
 * Les bornes viennent de la période elle-même, les fermetures des événements
 * `VACANCES` de l'année. Les JOURS OUVRÉS, eux, ne sont lisibles nulle part :
 * les profils horaires journaliers de 0036 ne sont pas encore reflétés dans le
 * schéma TypeScript généré. On laisse donc `validerDateAssiduite` appliquer
 * son défaut documenté (lundi à samedi, le samedi étant ouvré au Tchad).
 *
 * La période introuvable n'est pas traitée comme un refus de date : l'identifiant
 * est déjà validé en UUID, et c'est à l'écriture de signaler qu'il ne désigne rien.
 */
async function controlerDateAssiduite(periodeId: string, date: string, champ: string): Promise<Resultat> {
  const [periode] = await db
    .select({ anneeId: periodes.anneeId, dateDebut: periodes.dateDebut, dateFin: periodes.dateFin })
    .from(periodes)
    .where(eq(periodes.id, periodeId));

  if (!periode) return { ok: false, message: "Cette période scolaire n'existe pas (ou plus)." };

  const vacances: PlageVacances[] = await db
    .select({
      id: evenementsCalendrier.id,
      titre: evenementsCalendrier.titre,
      type: evenementsCalendrier.type,
      dateDebut: evenementsCalendrier.dateDebut,
      dateFin: evenementsCalendrier.dateFin,
    })
    .from(evenementsCalendrier)
    .where(and(eq(evenementsCalendrier.anneeId, periode.anneeId), eq(evenementsCalendrier.type, "VACANCES")));

  const verdict = validerDateAssiduite({
    date,
    debutPeriode: periode.dateDebut,
    finPeriode: periode.dateFin,
    vacances,
  });

  // La clé d'erreur porte le nom du champ de l'appelant : c'est elle qui place
  // le message sous le bon champ du formulaire d'assiduité.
  return verdict.valide ? OK : { ok: false, erreurs: { [champ]: verdict.raison ?? "Date refusée." } };
}

// ---------------------------------------------------------------------------
// Appel (absences + retards du cours)
// ---------------------------------------------------------------------------

export const schemaAppel = z.object({
  periodeId: z.string().uuid(),
  dateAbsence: z.string().min(1, "Date requise"),
  matiereId: z.string().uuid().nullable().optional(),
  nbHeures: z.coerce.number().min(0.5).max(12).default(1),
  absents: z.array(z.string().uuid()),
  retards: z
    .array(z.object({ inscriptionId: z.string().uuid(), dureeMinutes: z.coerce.number().min(0).max(240) }))
    .default([]),
});

export async function enregistrerAppelPour(acteur: Principal, donnees: unknown): Promise<Resultat> {
  const a = schemaAppel.safeParse(donnees);
  if (!a.success) return { ok: false, erreurs: messagesZod(a.error) };

  const v = a.data;
  if (v.absents.length === 0 && v.retards.length === 0) {
    return { ok: true, message: "Appel enregistré : classe au complet." };
  }

  // Avant toute écriture : la date doit être un jour de classe de cette période.
  const calendrier = await controlerDateAssiduite(v.periodeId, v.dateAbsence, "dateAbsence");
  if (!calendrier.ok) return calendrier;

  // Nombre d'absences RÉELLEMENT créées : un rejeu ignoré ne doit pas être
  // annoncé comme une saisie, sinon le message ment à l'agent.
  let absencesCreees = 0;

  if (v.absents.length > 0) {
    // `ON CONFLICT DO NOTHING` sans cible : c'est l'index unique de 0038
    // (uq_absence_inscription_date_seance) qui définit le doublon, et le dire
    // en SQL serait le redire deux fois — d'autant que la clé de 0038 est en
    // NULLS NOT DISTINCT, ce que la cible explicite de Drizzle n'exprime pas.
    //
    // POURQUOI ÇA, ET PAS UN SELECT PRÉALABLE
    // ----------------------------------------
    // Un appel se rejoue : le réseau coupe, l'agent renvoie, ou la saisie
    // navigateur et l'API agent passent au même moment. Un « est-ce que ça
    // existe déjà ? » suivi d'un INSERT laisse exactement cette fenêtre
    // ouverte, et chaque doublon qui s'y glisse envoie un second message au
    // tuteur. Seule la base peut arbitrer sans fenêtre.
    //
    // IGNORER plutôt que METTRE À JOUR est délibéré : si un rejeu porte un
    // `nb_heures` différent, c'est la première saisie qui fait foi. Décider
    // laquelle doit l'emporter est un arbitrage de vie scolaire, pas un
    // détail technique, et il n'est pas tranché ici.
    const creees = await db
      .insert(absences)
      .values(
        v.absents.map((inscriptionId) => ({
          inscriptionId,
          periodeId: v.periodeId,
          type: v.matiereId ? ("COURS" as const) : ("JOURNEE" as const),
          dateAbsence: v.dateAbsence,
          matiereId: v.matiereId ?? null,
          nbHeures: String(v.nbHeures),
          saisiePar: acteur.id,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: absences.id });
    absencesCreees = creees.length;
  }

  if (v.retards.length > 0) {
    await db.insert(retards).values(
      v.retards.map((r) => ({
        inscriptionId: r.inscriptionId,
        periodeId: v.periodeId,
        dateRetard: v.dateAbsence,
        dureeMinutes: r.dureeMinutes,
        matiereId: v.matiereId ?? null,
        saisiePar: acteur.id,
      })),
    );
  }

  await journaliser(acteur, {
    action: "assiduite.appel",
    entite: "absences",
    apres: {
      date: v.dateAbsence,
      nbAbsents: v.absents.length,
      nbAbsencesCreees: absencesCreees,
      nbRetards: v.retards.length,
      matiereId: v.matiereId,
    },
  });

  revalidatePath("/dashboard/assiduite");

  const parties = [];
  if (absencesCreees > 0) parties.push(`${absencesCreees} absence(s)`);
  if (v.retards.length > 0) parties.push(`${v.retards.length} retard(s)`);

  const ignorees = v.absents.length - absencesCreees;
  if (parties.length === 0) {
    return { ok: true, message: "Cet appel était déjà enregistré : rien n'a été ajouté." };
  }

  const rappel = ignorees > 0 ? ` ${ignorees} absence(s) déjà saisie(s) ont été ignorée(s).` : "";
  return { ok: true, message: `${parties.join(" et ")} enregistré(s). Les tuteurs seront notifiés.${rappel}` };
}

// ---------------------------------------------------------------------------
// Suppression d'une absence (opération sensible)
// ---------------------------------------------------------------------------

export async function supprimerAbsencePour(acteur: Principal, absenceId: string, motif: string): Promise<Resultat> {
  if (motif.trim().length < 3) {
    return { ok: false, erreurs: { motif: "Une saisie erronée se corrige avec un motif." } };
  }

  const [avant] = await db.select().from(absences).where(eq(absences.id, absenceId));
  if (!avant) return { ok: false, message: "Cette absence n'existe pas (ou plus)." };

  await db.delete(absences).where(eq(absences.id, absenceId));

  await journaliser(acteur, {
    action: "absence.supprimee",
    entite: "absences",
    entiteId: absenceId,
    avant: { date: avant.dateAbsence, heures: avant.nbHeures },
    motif: motif.trim(),
  });

  revalidatePath("/dashboard/assiduite");
  return OK;
}

// ---------------------------------------------------------------------------
// Retard
// ---------------------------------------------------------------------------

export const schemaRetard = z.object({
  inscriptionId: z.string().uuid("Sélectionnez un élève"),
  periodeId: z.string().uuid(),
  dateRetard: z.string().min(1, "Date requise"),
  heureArrivee: z.string().optional(),
  dureeMinutes: z.coerce.number().int().min(0).max(480).nullable().optional(),
  motif: z.string().trim().optional(),
});

export async function enregistrerRetardPour(acteur: Principal, donnees: unknown): Promise<Resultat> {
  const a = schemaRetard.safeParse(donnees);
  if (!a.success) return { ok: false, erreurs: messagesZod(a.error) };

  const v = a.data;

  // Même contrôle que pour l'appel : un retard un dimanche n'existe pas plus
  // qu'une absence un dimanche.
  const calendrier = await controlerDateAssiduite(v.periodeId, v.dateRetard, "dateRetard");
  if (!calendrier.ok) return calendrier;

  // Pas de `ON CONFLICT` ici : la table `retards` n'a pas de contrainte
  // d'unicité, et 0038 ne lui en pose pas. Un même élève peut arriver en
  // retard à deux cours le même jour, et rien dans les données actuelles ne
  // dit à quel grain le doublon devrait être défini.
  await db.insert(retards).values({
    inscriptionId: v.inscriptionId,
    periodeId: v.periodeId,
    dateRetard: v.dateRetard,
    heureArrivee: v.heureArrivee || null,
    dureeMinutes: v.dureeMinutes ?? null,
    motif: v.motif || null,
    saisiePar: acteur.id,
  });

  await journaliser(acteur, {
    action: "retard.saisi",
    entite: "retards",
    apres: { date: v.dateRetard, duree: v.dureeMinutes },
  });

  revalidatePath("/dashboard/assiduite");
  return OK;
}

// ---------------------------------------------------------------------------
// Justification en lot
// ---------------------------------------------------------------------------

export async function justifierEnLotPour(
  acteur: Principal,
  absenceIds: string[],
  statut: "JUSTIFIEE" | "NON_JUSTIFIEE",
  motif: string,
): Promise<Resultat & { traitees?: number }> {
  if (absenceIds.length === 0) return { ok: false, message: "Aucune absence sélectionnée." };
  if (absenceIds.length > 200) return { ok: false, message: "Sélection trop large : 200 absences au maximum." };
  if (statut === "JUSTIFIEE" && motif.trim().length < 3) {
    return { ok: false, erreurs: { motif: "Indiquez le motif de la justification." } };
  }

  // Constructeur de requêtes plutôt que SQL brut : dans un template `sql`,
  // Drizzle APLATIT le tableau en paramètres séparés, si bien que
  // `ANY(($4)::uuid[])` recevait une chaîne nue — « malformed array literal »,
  // et la justification échouait. `inArray` produit le bon `IN (...)`.
  const maintenant = new Date().toISOString();
  const maj = await db
    .update(absences)
    .set({
      statut,
      motif: motif.trim() || null,
      justifieePar: acteur.id,
      justifieeLe: maintenant,
      modifieLe: maintenant,
    })
    .where(inArray(absences.id, absenceIds))
    .returning({ id: absences.id });

  const traitees = maj.length;
  if (traitees === 0) return { ok: false, message: "Aucune de ces absences n'existe plus." };

  await journaliser(acteur, {
    action: statut === "JUSTIFIEE" ? "absence.justifiee_en_lot" : "absence.dejustifiee_en_lot",
    entite: "absences",
    apres: { statut, absences: traitees },
    motif: motif.trim() || null,
  });

  revalidatePath("/dashboard/assiduite");

  return {
    ok: true,
    traitees,
    message:
      statut === "JUSTIFIEE"
        ? `${traitees} absence(s) justifiée(s).`
        : `${traitees} absence(s) repassée(s) en non justifiée(s).`,
  };
}
