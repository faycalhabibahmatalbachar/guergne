"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import {
  anneesScolaires,
  classes,
  eleveTuteur,
  eleves,
  historiqueStatuts,
  inscriptions,
  tuteurs,
} from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  /** Identifiant créé, pour rediriger vers le dossier. */
  id?: string;
}

function echec(erreur: unknown, defaut: string): Resultat {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  const message = erreur instanceof Error ? erreur.message : "";

  // Message métier remonté volontairement par un déclencheur PostgreSQL
  // (capacité de classe atteinte, par exemple).
  if (message.includes("est complète")) {
    return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "") };
  }
  if (message.includes("duplicate key") || message.includes("23505")) {
    return { ok: false, message: "Cet élève est déjà inscrit pour cette année." };
  }
  console.error("[eleves]", erreur);
  return { ok: false, message: defaut };
}

function messages(erreur: z.ZodError): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const p of erreur.issues) {
    const champ = String(p.path.join("."));
    if (!sortie[champ]) sortie[champ] = p.message;
  }
  return sortie;
}

const TELEPHONE = /^\+?[0-9\s.-]{8,20}$/;

// ===========================================================================
// Inscription
// ===========================================================================

const schemaTuteur = z.object({
  nom: z.string().trim().min(2, "Nom requis"),
  prenom: z.string().trim().min(2, "Prénom requis"),
  sexe: z.enum(["M", "F"]).nullable().optional(),
  telephone: z.string().trim().regex(TELEPHONE, "Numéro invalide"),
  telephoneSecondaire: z.string().trim().optional(),
  email: z.string().trim().email("Adresse invalide").optional().or(z.literal("")),
  profession: z.string().trim().optional(),
  adresse: z.string().trim().optional(),
  lien: z.enum(["PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE"]),
  estPrincipal: z.boolean().default(false),
  estResponsableFinancier: z.boolean().default(false),
  estTuteurLegal: z.boolean().default(false),
  estContactUrgence: z.boolean().default(false),
  autoriseRetrait: z.boolean().default(true),
});

const schemaInscription = z
  .object({
    // État civil
    nom: z.string().trim().min(2, "Nom requis").toUpperCase(),
    prenom: z.string().trim().min(2, "Prénom requis"),
    sexe: z.enum(["M", "F"], { message: "Sexe requis" }),
    dateNaissance: z.string().min(1, "Date de naissance requise"),
    lieuNaissance: z.string().trim().optional(),
    nationalite: z.string().trim().default("Tchadienne"),
    acteNaissanceNumero: z.string().trim().optional(),

    // Coordonnées
    adresse: z.string().trim().optional(),
    quartier: z.string().trim().optional(),
    telephone: z.string().trim().regex(TELEPHONE, "Numéro invalide").optional().or(z.literal("")),
    email: z.string().trim().email("Adresse invalide").optional().or(z.literal("")),

    // Santé et situation
    groupeSanguin: z.string().trim().max(5).optional(),
    allergies: z.string().trim().optional(),
    observationsMedicales: z.string().trim().optional(),
    situationParticuliere: z.string().trim().optional(),
    urgenceNom: z.string().trim().optional(),
    urgenceTelephone: z.string().trim().optional(),
    urgenceLien: z.string().trim().optional(),

    // Scolarité
    ecoleOrigine: z.string().trim().optional(),
    classeId: z.string().uuid("Sélectionnez une classe"),
    type: z.enum(["INSCRIPTION", "REINSCRIPTION", "TRANSFERT_ENTRANT"]).default("INSCRIPTION"),
    estRedoublant: z.boolean().default(false),
    estBoursier: z.boolean().default(false),
    observations: z.string().trim().optional(),

    tuteurs: z.array(schemaTuteur).min(1, "Au moins un tuteur est requis"),
  })
  .refine((v) => new Date(v.dateNaissance) < new Date(), {
    message: "La date de naissance doit être dans le passé",
    path: ["dateNaissance"],
  })
  .refine(
    (v) => {
      // Un élève de 6ème a environ 11 ans, un terminale environ 19.
      // On refuse l'aberrant, pas l'inhabituel : les parcours sont irréguliers.
      const age =
        (Date.now() - new Date(v.dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000);
      return age >= 8 && age <= 30;
    },
    { message: "Âge hors des bornes plausibles pour le secondaire (8 à 30 ans)", path: ["dateNaissance"] },
  )
  .refine((v) => v.tuteurs.filter((t) => t.estPrincipal).length === 1, {
    message: "Désignez exactement un tuteur principal",
    path: ["tuteurs"],
  });

/**
 * Inscrit un nouvel élève.
 *
 * Tout se fait dans UNE transaction : élève, inscription, tuteurs et premier
 * statut. Si une étape échoue — capacité de classe atteinte, par exemple —
 * rien n'est écrit. On ne veut pas d'élève orphelin sans inscription, ni
 * d'inscription sans tuteur joignable.
 */
export async function inscrireEleve(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("eleve:inscrire");
    const analyse = schemaInscription.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: messages(analyse.error) };

    const v = analyse.data;

    const [annee] = await db
      .select({ id: anneesScolaires.id, libelle: anneesScolaires.libelle })
      .from(anneesScolaires)
      .where(eq(anneesScolaires.estCourante, true));

    if (!annee) {
      return { ok: false, message: "Aucune année scolaire en cours. Configurez-la d'abord." };
    }

    const [classe] = await db
      .select({ id: classes.id, libelle: classes.libelle, anneeId: classes.anneeId })
      .from(classes)
      .where(eq(classes.id, v.classeId));

    if (!classe || classe.anneeId !== annee.id) {
      return { ok: false, erreurs: { classeId: "Cette classe n'appartient pas à l'année en cours." } };
    }

    const eleveId = await db.transaction(async (tx) => {
      const anneeCivile = new Date().getFullYear();

      // `execute` renvoie un QueryResult (avec `.rows`), pas un tableau :
      // les numéros sont attribués par une fonction PostgreSQL qui verrouille
      // sa ligne de séquence, ce qui garantit l'unicité même en cas de deux
      // inscriptions simultanées au guichet.
      const resMatricule = await tx.execute<{ matricule: string }>(
        sql`SELECT prochain_numero('MATRICULE', ${anneeCivile}::smallint) AS matricule`,
      );
      const resNumero = await tx.execute<{ numero: string }>(
        sql`SELECT prochain_numero('INSCRIPTION', ${anneeCivile}::smallint) AS numero`,
      );
      const matricule = resMatricule.rows[0].matricule;
      const numero = resNumero.rows[0].numero;

      const [eleve] = await tx
        .insert(eleves)
        .values({
          matricule,
          nom: v.nom,
          prenom: v.prenom,
          sexe: v.sexe,
          dateNaissance: v.dateNaissance,
          lieuNaissance: v.lieuNaissance || null,
          nationalite: v.nationalite || "Tchadienne",
          acteNaissanceNumero: v.acteNaissanceNumero || null,
          adresse: v.adresse || null,
          quartier: v.quartier || null,
          telephone: v.telephone || null,
          email: v.email || null,
          groupeSanguin: v.groupeSanguin || null,
          allergies: v.allergies || null,
          observationsMedicales: v.observationsMedicales || null,
          situationParticuliere: v.situationParticuliere || null,
          urgenceNom: v.urgenceNom || null,
          urgenceTelephone: v.urgenceTelephone || null,
          urgenceLien: v.urgenceLien || null,
          ecoleOrigine: v.ecoleOrigine || null,
          statut: "INSCRIT",
          datePremiereInscription: new Date().toISOString().slice(0, 10),
        })
        .returning({ id: eleves.id, matricule: eleves.matricule });

      await tx.insert(inscriptions).values({
        eleveId: eleve.id,
        anneeId: annee.id,
        classeId: v.classeId,
        type: v.type,
        numeroInscription: numero,
        estRedoublant: v.estRedoublant,
        estBoursier: v.estBoursier,
        observations: v.observations || null,
        statutDossier: "A_VALIDER",
      });

      // Tuteurs : on réutilise une fiche existante si le numéro de téléphone
      // est déjà connu. Une fratrie partage ses parents ; créer un doublon
      // couperait le lien entre les enfants dans l'application parent.
      for (const t of v.tuteurs) {
        const [existant] = await tx
          .select({ id: tuteurs.id })
          .from(tuteurs)
          .where(eq(tuteurs.telephone, t.telephone));

        const tuteurId =
          existant?.id ??
          (
            await tx
              .insert(tuteurs)
              .values({
                nom: t.nom.toUpperCase(),
                prenom: t.prenom,
                sexe: t.sexe ?? null,
                telephone: t.telephone,
                telephoneSecondaire: t.telephoneSecondaire || null,
                email: t.email || null,
                profession: t.profession || null,
                adresse: t.adresse || null,
              })
              .returning({ id: tuteurs.id })
          )[0].id;

        await tx.insert(eleveTuteur).values({
          eleveId: eleve.id,
          tuteurId,
          lien: t.lien,
          estPrincipal: t.estPrincipal,
          estResponsableFinancier: t.estResponsableFinancier,
          estTuteurLegal: t.estTuteurLegal,
          estContactUrgence: t.estContactUrgence,
          autoriseRetrait: t.autoriseRetrait,
        });
      }

      await tx.insert(historiqueStatuts).values({
        eleveId: eleve.id,
        anneeId: annee.id,
        ancienStatut: null,
        nouveauStatut: "INSCRIT",
        motif: `Inscription en ${classe.libelle} — année ${annee.libelle}`,
        decidePar: acteur.id,
      });

      await journaliser(acteur, {
        action: "eleve.inscrit",
        entite: "eleves",
        entiteId: eleve.id,
        eleveId: eleve.id,
        apres: {
          matricule: eleve.matricule,
          nom: `${v.prenom} ${v.nom}`,
          classe: classe.libelle,
          numeroInscription: numero,
        },
      });

      return eleve.id;
    });

    revalidatePath("/dashboard/eleves");
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/default");
    return { ok: true, id: eleveId };
  } catch (erreur) {
    return echec(erreur, "L'inscription a échoué.");
  }
}

// ===========================================================================
// Dossier administratif
// ===========================================================================

export async function validerDossier(
  inscriptionId: string,
  statut: "VALIDE" | "INCOMPLET" | "REFUSE",
  observations?: string,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("eleve:inscrire");

    if (statut !== "VALIDE" && !observations?.trim()) {
      return { ok: false, erreurs: { observations: "Précisez ce qui manque ou le motif du refus." } };
    }

    const [avant] = await db
      .select({ eleveId: inscriptions.eleveId, statut: inscriptions.statutDossier })
      .from(inscriptions)
      .where(eq(inscriptions.id, inscriptionId));

    if (!avant) return { ok: false, message: "Inscription introuvable." };

    await db
      .update(inscriptions)
      .set({
        statutDossier: statut,
        valideePar: acteur.id,
        valideeLe: new Date().toISOString(),
        observations: observations?.trim() || null,
      })
      .where(eq(inscriptions.id, inscriptionId));

    await journaliser(acteur, {
      action: `dossier.${statut.toLowerCase()}`,
      entite: "inscriptions",
      entiteId: inscriptionId,
      eleveId: avant.eleveId,
      avant: { statut: avant.statut },
      apres: { statut },
      motif: observations ?? null,
    });

    revalidatePath(`/dashboard/eleves/${avant.eleveId}`);
    revalidatePath("/dashboard/eleves");
    return SUCCES_VIDE;
  } catch (erreur) {
    return echec(erreur, "La validation du dossier a échoué.");
  }
}

const SUCCES_VIDE: Resultat = { ok: true };

// ===========================================================================
// Changement de classe
// ===========================================================================

export async function changerClasse(
  inscriptionId: string,
  nouvelleClasseId: string,
  motif: string,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("eleve:affecter");

    if (motif.trim().length < 3) {
      return { ok: false, erreurs: { motif: "Le motif est obligatoire." } };
    }

    const [inscription] = await db
      .select({
        id: inscriptions.id,
        eleveId: inscriptions.eleveId,
        classeId: inscriptions.classeId,
      })
      .from(inscriptions)
      .where(eq(inscriptions.id, inscriptionId));

    if (!inscription) return { ok: false, message: "Inscription introuvable." };
    if (inscription.classeId === nouvelleClasseId) {
      return { ok: false, message: "L'élève est déjà dans cette classe." };
    }

    await db.transaction(async (tx) => {
      // Le déclencheur de capacité s'applique ici aussi : si la classe cible
      // est pleine, la transaction échoue et rien ne bouge.
      await tx
        .update(inscriptions)
        .set({ classeId: nouvelleClasseId })
        .where(eq(inscriptions.id, inscriptionId));

      await tx.execute(sql`
        INSERT INTO changements_classe
          (inscription_id, classe_origine_id, classe_destination_id, motif, decide_par)
        VALUES (${inscriptionId}, ${inscription.classeId}, ${nouvelleClasseId}, ${motif}, ${acteur.id})
      `);
    });

    await journaliser(acteur, {
      action: "eleve.classe_changee",
      entite: "inscriptions",
      entiteId: inscriptionId,
      eleveId: inscription.eleveId,
      avant: { classeId: inscription.classeId },
      apres: { classeId: nouvelleClasseId },
      motif,
    });

    revalidatePath(`/dashboard/eleves/${inscription.eleveId}`);
    revalidatePath("/dashboard/classes");
    return SUCCES_VIDE;
  } catch (erreur) {
    return echec(erreur, "Le changement de classe a échoué.");
  }
}

// ===========================================================================
// Statuts : suspension, réactivation, exclusion, transfert, abandon
// ===========================================================================

const STATUTS_ACTION = {
  SUSPENDU_DISCIPLINE: { action: "eleve:suspendre", libelle: "suspension disciplinaire" },
  SUSPENDU_IMPAYE: { action: "eleve:suspendre", libelle: "suspension pour impayés" },
  INSCRIT: { action: "eleve:reactiver", libelle: "réactivation" },
  EXCLU: { action: "eleve:exclure", libelle: "exclusion définitive" },
  TRANSFERE: { action: "eleve:transferer", libelle: "transfert" },
  ABANDON: { action: "eleve:modifier", libelle: "abandon de scolarité" },
  DIPLOME: { action: "eleve:modifier", libelle: "obtention du diplôme" },
  ARCHIVE: { action: "eleve:modifier", libelle: "archivage" },
} as const;

export type StatutCible = keyof typeof STATUTS_ACTION;

/**
 * Change le statut d'un élève.
 *
 * L'écriture se fait dans `historique_statuts` ; un déclencheur reporte
 * ensuite la valeur sur la fiche élève. On ne met JAMAIS à jour
 * `eleves.statut` directement : ce serait perdre la trace de qui a décidé
 * quoi, quand et pourquoi — précisément ce qui est contesté en cas de litige
 * avec une famille.
 */
export async function changerStatut(
  eleveId: string,
  nouveauStatut: StatutCible,
  options: { motif: string; dateEffet?: string; dateFinPrevue?: string; etablissement?: string },
): Promise<Resultat> {
  try {
    const definition = STATUTS_ACTION[nouveauStatut];
    if (!definition) return { ok: false, message: "Statut inconnu." };

    const acteur = await requirePermission(definition.action);

    if (options.motif.trim().length < 5) {
      return { ok: false, erreurs: { motif: "Le motif doit être explicite (5 caractères minimum)." } };
    }

    const [eleve] = await db
      .select({ statut: eleves.statut, nom: eleves.nom, prenom: eleves.prenom })
      .from(eleves)
      .where(eq(eleves.id, eleveId));

    if (!eleve) return { ok: false, message: "Élève introuvable." };
    if (eleve.statut === nouveauStatut) {
      return { ok: false, message: `Cet élève est déjà dans l'état « ${nouveauStatut} ».` };
    }

    // Une exclusion définitive est irréversible côté métier : on empêche de la
    // prononcer sur un élève déjà parti, ce qui n'aurait aucun sens.
    if (["TRANSFERE", "ABANDON", "EXCLU"].includes(eleve.statut) && nouveauStatut !== "ARCHIVE") {
      return {
        ok: false,
        message: `Cet élève a quitté l'établissement (${eleve.statut}). Seul l'archivage reste possible.`,
      };
    }

    const [annee] = await db
      .select({ id: anneesScolaires.id })
      .from(anneesScolaires)
      .where(eq(anneesScolaires.estCourante, true));

    await db.transaction(async (tx) => {
      await tx.insert(historiqueStatuts).values({
        eleveId,
        anneeId: annee?.id ?? null,
        ancienStatut: eleve.statut,
        nouveauStatut,
        motif: options.motif.trim(),
        dateEffet: options.dateEffet || new Date().toISOString().slice(0, 10),
        dateFinPrevue: options.dateFinPrevue || null,
        decidePar: acteur.id,
      });

      // Un départ définitif clôt l'inscription de l'année en cours.
      if (["TRANSFERE", "ABANDON", "EXCLU"].includes(nouveauStatut) && annee) {
        await tx
          .update(inscriptions)
          .set({
            active: false,
            dateSortie: options.dateEffet || new Date().toISOString().slice(0, 10),
            motifSortie: options.motif.trim(),
            etablissementDestination: options.etablissement || null,
          })
          .where(and(eq(inscriptions.eleveId, eleveId), eq(inscriptions.anneeId, annee.id)));
      }
    });

    await journaliser(acteur, {
      action: `eleve.${nouveauStatut.toLowerCase()}`,
      entite: "eleves",
      entiteId: eleveId,
      eleveId,
      avant: { statut: eleve.statut },
      apres: { statut: nouveauStatut, etablissement: options.etablissement ?? null },
      motif: options.motif.trim(),
    });

    revalidatePath(`/dashboard/eleves/${eleveId}`);
    revalidatePath("/dashboard/eleves");
    revalidatePath("/dashboard/default");
    return SUCCES_VIDE;
  } catch (erreur) {
    return echec(erreur, "Le changement de statut a échoué.");
  }
}

// ===========================================================================
// Tuteurs
// ===========================================================================

export async function rattacherTuteur(eleveId: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    const analyse = schemaTuteur.safeParse(donnees);
    if (!analyse.success) return { ok: false, erreurs: messages(analyse.error) };

    const t = analyse.data;

    await db.transaction(async (tx) => {
      const [existant] = await tx
        .select({ id: tuteurs.id })
        .from(tuteurs)
        .where(eq(tuteurs.telephone, t.telephone));

      const tuteurId =
        existant?.id ??
        (
          await tx
            .insert(tuteurs)
            .values({
              nom: t.nom.toUpperCase(),
              prenom: t.prenom,
              sexe: t.sexe ?? null,
              telephone: t.telephone,
              telephoneSecondaire: t.telephoneSecondaire || null,
              email: t.email || null,
              profession: t.profession || null,
              adresse: t.adresse || null,
            })
            .returning({ id: tuteurs.id })
        )[0].id;

      // Un seul tuteur principal : on bascule l'ancien avant d'insérer,
      // sinon l'index unique partiel refuse l'écriture.
      if (t.estPrincipal) {
        await tx
          .update(eleveTuteur)
          .set({ estPrincipal: false })
          .where(and(eq(eleveTuteur.eleveId, eleveId), eq(eleveTuteur.estPrincipal, true)));
      }

      await tx.insert(eleveTuteur).values({
        eleveId,
        tuteurId,
        lien: t.lien,
        estPrincipal: t.estPrincipal,
        estResponsableFinancier: t.estResponsableFinancier,
        estTuteurLegal: t.estTuteurLegal,
        estContactUrgence: t.estContactUrgence,
        autoriseRetrait: t.autoriseRetrait,
      });
    });

    await journaliser(acteur, {
      action: "tuteur.rattache",
      entite: "eleve_tuteur",
      eleveId,
      apres: { nom: `${t.prenom} ${t.nom}`, lien: t.lien },
    });

    revalidatePath(`/dashboard/eleves/${eleveId}`);
    return SUCCES_VIDE;
  } catch (erreur) {
    return echec(erreur, "Le rattachement du tuteur a échoué.");
  }
}

export async function detacherTuteur(eleveId: string, tuteurId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(eleveTuteur)
      .where(eq(eleveTuteur.eleveId, eleveId));

    if (Number(n) <= 1) {
      return {
        ok: false,
        message: "Un élève doit conserver au moins un tuteur. Rattachez le nouveau avant de retirer celui-ci.",
      };
    }

    await db
      .delete(eleveTuteur)
      .where(and(eq(eleveTuteur.eleveId, eleveId), eq(eleveTuteur.tuteurId, tuteurId)));

    await journaliser(acteur, {
      action: "tuteur.detache",
      entite: "eleve_tuteur",
      eleveId,
      avant: { tuteurId },
    });

    revalidatePath(`/dashboard/eleves/${eleveId}`);
    return SUCCES_VIDE;
  } catch (erreur) {
    return echec(erreur, "Le retrait du tuteur a échoué.");
  }
}
