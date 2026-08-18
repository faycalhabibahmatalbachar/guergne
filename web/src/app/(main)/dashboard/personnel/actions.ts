"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import {
  affectations,
  emploiDuTemps,
  enseignantMatieres,
  enseignants,
  indisponibilites,
  salles,
} from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  id?: string;
}

const OK: Resultat = { ok: true };

function echec(erreur: unknown, defaut: string): Resultat {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  const m = erreur instanceof Error ? erreur.message : "";
  // Messages métier remontés volontairement par les déclencheurs PostgreSQL.
  if (m.includes("Conflit d'emploi du temps") || m.includes("Conflit d''emploi")) {
    return { ok: false, message: m.replace(/^.*?ERROR:\s*/i, "").split("\n")[0] };
  }
  if (m.includes("duplicate key") || m.includes("23505")) {
    return { ok: false, message: "Cet élément existe déjà." };
  }
  console.error("[personnel]", erreur);
  return { ok: false, message: defaut };
}

function messages(e: z.ZodError): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of e.issues) {
    const c = String(p.path[0] ?? "_");
    if (!s[c]) s[c] = p.message;
  }
  return s;
}

// ===========================================================================
// Enseignants
// ===========================================================================

const schemaEnseignant = z.object({
  matricule: z.string().trim().min(2, "Matricule requis").toUpperCase(),
  nom: z.string().trim().min(2, "Nom requis").toUpperCase(),
  prenom: z.string().trim().min(2, "Prénom requis"),
  sexe: z.enum(["M", "F"]).nullable().optional(),
  dateNaissance: z.string().optional(),
  telephone: z.string().trim().regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro invalide").optional().or(z.literal("")),
  email: z.string().trim().email("Adresse invalide").optional().or(z.literal("")),
  adresse: z.string().trim().optional(),
  quartier: z.string().trim().optional(),
  diplome: z.string().trim().optional(),
  specialite: z.string().trim().optional(),
  statut: z.enum([
    "PERMANENT", "CONTRACTUEL", "VACATAIRE", "STAGIAIRE",
    "SUSPENDU", "RETRAITE", "DEMISSIONNAIRE",
  ]),
  dateEmbauche: z.string().optional(),
  dateFinContrat: z.string().optional(),
  numeroCnps: z.string().trim().optional(),
  heuresContractuelles: z.coerce.number().min(0).max(40).nullable().optional(),
  observations: z.string().trim().optional(),
});

function valeursEnseignant(v: z.infer<typeof schemaEnseignant>) {
  return {
    matricule: v.matricule,
    nom: v.nom,
    prenom: v.prenom,
    sexe: v.sexe ?? null,
    dateNaissance: v.dateNaissance || null,
    telephone: v.telephone || null,
    email: v.email || null,
    adresse: v.adresse || null,
    quartier: v.quartier || null,
    diplome: v.diplome || null,
    specialite: v.specialite || null,
    statut: v.statut,
    dateEmbauche: v.dateEmbauche || null,
    dateFinContrat: v.dateFinContrat || null,
    numeroCnps: v.numeroCnps || null,
    heuresContractuelles: v.heuresContractuelles == null ? null : String(v.heuresContractuelles),
    observations: v.observations || null,
  };
}

export async function creerEnseignant(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:creer");
    const a = schemaEnseignant.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const [cree] = await db
      .insert(enseignants)
      .values(valeursEnseignant(a.data))
      .returning({ id: enseignants.id });

    await journaliser(acteur, {
      action: "enseignant.cree",
      entite: "enseignants",
      entiteId: cree.id,
      apres: { matricule: a.data.matricule, nom: `${a.data.prenom} ${a.data.nom}` },
    });

    revalidatePath("/dashboard/personnel");
    revalidatePath("/dashboard/default");
    return { ok: true, id: cree.id };
  } catch (e) {
    return echec(e, "La création de l'enseignant a échoué.");
  }
}

export async function modifierEnseignant(id: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:modifier");
    const a = schemaEnseignant.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const [avant] = await db
      .select({ matricule: enseignants.matricule, nom: enseignants.nom, statut: enseignants.statut })
      .from(enseignants)
      .where(eq(enseignants.id, id));
    if (!avant) return { ok: false, message: "Enseignant introuvable." };

    await db.update(enseignants).set(valeursEnseignant(a.data)).where(eq(enseignants.id, id));

    await journaliser(acteur, {
      action: "enseignant.modifie",
      entite: "enseignants",
      entiteId: id,
      avant,
      apres: { matricule: a.data.matricule, statut: a.data.statut },
    });

    revalidatePath("/dashboard/personnel");
    revalidatePath(`/dashboard/personnel/${id}`);
    return OK;
  } catch (e) {
    return echec(e, "La modification a échoué.");
  }
}

export async function basculerEnseignant(id: string, actif: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("utilisateur:desactiver");

    if (!actif) {
      // Un enseignant encore présent à l'emploi du temps laisserait des cours
      // sans professeur : on l'annonce plutôt que de créer un trou silencieux.
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(emploiDuTemps)
        .where(eq(emploiDuTemps.enseignantId, id));

      if (Number(n) > 0) {
        return {
          ok: false,
          message: `Cet enseignant occupe ${n} créneau(x) à l'emploi du temps. Réaffectez ces cours avant de le désactiver.`,
        };
      }
    }

    await db.update(enseignants).set({ actif }).where(eq(enseignants.id, id));
    await journaliser(acteur, {
      action: actif ? "enseignant.active" : "enseignant.desactive",
      entite: "enseignants",
      entiteId: id,
    });

    revalidatePath("/dashboard/personnel");
    return OK;
  } catch (e) {
    return echec(e, "Le changement d'état a échoué.");
  }
}

// ===========================================================================
// Spécialités
// ===========================================================================

export async function definirSpecialite(
  enseignantId: string,
  matiereId: string,
  estPrincipale: boolean,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("affectation:gerer");

    await db.transaction(async (tx) => {
      if (estPrincipale) {
        await tx
          .update(enseignantMatieres)
          .set({ estPrincipale: false })
          .where(
            and(
              eq(enseignantMatieres.enseignantId, enseignantId),
              eq(enseignantMatieres.estPrincipale, true),
            ),
          );
      }

      const [existant] = await tx
        .select({ id: enseignantMatieres.id })
        .from(enseignantMatieres)
        .where(
          and(
            eq(enseignantMatieres.enseignantId, enseignantId),
            eq(enseignantMatieres.matiereId, matiereId),
          ),
        );

      if (existant) {
        await tx
          .update(enseignantMatieres)
          .set({ estPrincipale })
          .where(eq(enseignantMatieres.id, existant.id));
      } else {
        await tx.insert(enseignantMatieres).values({ enseignantId, matiereId, estPrincipale });
      }
    });

    await journaliser(acteur, {
      action: "enseignant.specialite_definie",
      entite: "enseignant_matieres",
      entiteId: enseignantId,
      apres: { matiereId, estPrincipale },
    });

    revalidatePath(`/dashboard/personnel/${enseignantId}`);
    return OK;
  } catch (e) {
    return echec(e, "L'enregistrement de la spécialité a échoué.");
  }
}

export async function retirerSpecialite(enseignantId: string, matiereId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("affectation:gerer");
    await db
      .delete(enseignantMatieres)
      .where(
        and(
          eq(enseignantMatieres.enseignantId, enseignantId),
          eq(enseignantMatieres.matiereId, matiereId),
        ),
      );
    await journaliser(acteur, {
      action: "enseignant.specialite_retiree",
      entite: "enseignant_matieres",
      entiteId: enseignantId,
      avant: { matiereId },
    });
    revalidatePath(`/dashboard/personnel/${enseignantId}`);
    return OK;
  } catch (e) {
    return echec(e, "Le retrait de la spécialité a échoué.");
  }
}

// ===========================================================================
// Affectations (classe × matière)
// ===========================================================================

const schemaAffectation = z.object({
  anneeId: z.string().uuid(),
  enseignantId: z.string().uuid(),
  classeId: z.string().uuid("Sélectionnez une classe"),
  matiereId: z.string().uuid("Sélectionnez une matière"),
  heuresSemaine: z.coerce.number().min(0).max(40).nullable().optional(),
});

export async function affecter(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("affectation:gerer");
    const a = schemaAffectation.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;

    // Une matière n'est confiée qu'à UN enseignant par classe : c'est la base
    // du contrôle d'accès aux notes. Si le couple est déjà pris, on le dit.
    const [occupe] = await db
      .select({ enseignantId: affectations.enseignantId })
      .from(affectations)
      .where(
        and(
          eq(affectations.anneeId, v.anneeId),
          eq(affectations.classeId, v.classeId),
          eq(affectations.matiereId, v.matiereId),
        ),
      );

    if (occupe && occupe.enseignantId !== v.enseignantId) {
      return {
        ok: false,
        message: "Cette matière est déjà confiée à un autre enseignant dans cette classe.",
      };
    }

    const valeurs = {
      anneeId: v.anneeId,
      enseignantId: v.enseignantId,
      classeId: v.classeId,
      matiereId: v.matiereId,
      heuresSemaine: v.heuresSemaine == null ? null : String(v.heuresSemaine),
      active: true,
    };

    if (occupe) {
      await db
        .update(affectations)
        .set(valeurs)
        .where(
          and(
            eq(affectations.anneeId, v.anneeId),
            eq(affectations.classeId, v.classeId),
            eq(affectations.matiereId, v.matiereId),
          ),
        );
    } else {
      await db.insert(affectations).values(valeurs);
    }

    await journaliser(acteur, {
      action: "affectation.definie",
      entite: "affectations",
      entiteId: v.enseignantId,
      apres: v,
    });

    revalidatePath(`/dashboard/personnel/${v.enseignantId}`);
    revalidatePath("/dashboard/personnel");
    return OK;
  } catch (e) {
    return echec(e, "L'affectation a échoué.");
  }
}

export async function retirerAffectation(affectationId: string, enseignantId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("affectation:gerer");

    const [aff] = await db
      .select({ classeId: affectations.classeId, matiereId: affectations.matiereId, anneeId: affectations.anneeId })
      .from(affectations)
      .where(eq(affectations.id, affectationId));
    if (!aff) return { ok: false, message: "Affectation introuvable." };

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(emploiDuTemps)
      .where(
        and(
          eq(emploiDuTemps.anneeId, aff.anneeId),
          eq(emploiDuTemps.classeId, aff.classeId),
          eq(emploiDuTemps.matiereId, aff.matiereId),
        ),
      );

    if (Number(n) > 0) {
      return {
        ok: false,
        message: `${n} créneau(x) d'emploi du temps dépendent de cette affectation. Retirez-les d'abord.`,
      };
    }

    await db.delete(affectations).where(eq(affectations.id, affectationId));
    await journaliser(acteur, {
      action: "affectation.retiree",
      entite: "affectations",
      entiteId: affectationId,
      avant: aff,
    });

    revalidatePath(`/dashboard/personnel/${enseignantId}`);
    return OK;
  } catch (e) {
    return echec(e, "Le retrait de l'affectation a échoué.");
  }
}

// ===========================================================================
// Indisponibilités
// ===========================================================================

export async function ajouterIndisponibilite(donnees: {
  enseignantId: string;
  anneeId: string;
  jourSemaine: number;
  creneauId: string | null;
  motif?: string;
}): Promise<Resultat> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");

    await db.insert(indisponibilites).values({
      enseignantId: donnees.enseignantId,
      anneeId: donnees.anneeId,
      jourSemaine: donnees.jourSemaine,
      creneauId: donnees.creneauId,
      motif: donnees.motif || null,
    });

    await journaliser(acteur, {
      action: "indisponibilite.ajoutee",
      entite: "indisponibilites",
      entiteId: donnees.enseignantId,
      apres: donnees,
    });

    revalidatePath(`/dashboard/personnel/${donnees.enseignantId}`);
    return OK;
  } catch (e) {
    return echec(e, "L'ajout de l'indisponibilité a échoué.");
  }
}

export async function retirerIndisponibilite(id: string, enseignantId: string): Promise<Resultat> {
  try {
    await requirePermission("emploi_du_temps:gerer");
    await db.delete(indisponibilites).where(eq(indisponibilites.id, id));
    revalidatePath(`/dashboard/personnel/${enseignantId}`);
    return OK;
  } catch (e) {
    return echec(e, "Le retrait a échoué.");
  }
}

// ===========================================================================
// Salles
// ===========================================================================

const schemaSalle = z.object({
  code: z.string().trim().toUpperCase().min(1, "Code requis").max(10),
  libelle: z.string().trim().min(2, "Libellé requis"),
  type: z.enum(["CLASSE", "LABORATOIRE", "INFORMATIQUE", "AMPHI", "AUTRE"]),
  capacite: z.coerce.number().int().min(1).max(500).nullable().optional(),
  batiment: z.string().trim().optional(),
});

export async function creerSalle(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("parametre:modifier");
    const a = schemaSalle.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const [creee] = await db
      .insert(salles)
      .values({
        code: a.data.code,
        libelle: a.data.libelle,
        type: a.data.type,
        capacite: a.data.capacite ?? null,
        batiment: a.data.batiment || null,
      })
      .returning({ id: salles.id });

    await journaliser(acteur, {
      action: "salle.creee",
      entite: "salles",
      entiteId: creee.id,
      apres: a.data,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/emploi-du-temps");
    return OK;
  } catch (e) {
    return echec(e, "La création de la salle a échoué.");
  }
}

export async function basculerSalle(id: string, active: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("parametre:modifier");

    if (!active) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(emploiDuTemps)
        .where(eq(emploiDuTemps.salleId, id));
      if (Number(n) > 0) {
        return { ok: false, message: `Cette salle est utilisée par ${n} créneau(x).` };
      }
    }

    await db.update(salles).set({ active }).where(eq(salles.id, id));
    await journaliser(acteur, {
      action: active ? "salle.activee" : "salle.desactivee",
      entite: "salles",
      entiteId: id,
    });
    revalidatePath("/dashboard/parametres");
    return OK;
  } catch (e) {
    return echec(e, "Le changement d'état a échoué.");
  }
}

// ===========================================================================
// Emploi du temps
// ===========================================================================

const schemaCours = z.object({
  anneeId: z.string().uuid(),
  classeId: z.string().uuid("Sélectionnez une classe"),
  matiereId: z.string().uuid("Sélectionnez une matière"),
  enseignantId: z.string().uuid().nullable(),
  salleId: z.string().uuid().nullable(),
  jourSemaine: z.coerce.number().int().min(1).max(7),
  creneauId: z.string().uuid("Sélectionnez un créneau"),
  nbCreneaux: z.coerce.number().int().min(1).max(4).default(1),
  semaineType: z.enum(["A", "B"]).nullable().optional(),
});

/**
 * Pose un cours à l'emploi du temps.
 *
 * Les trois conflits — professeur, classe, salle — sont détectés par un
 * déclencheur PostgreSQL, y compris sur les séances de plusieurs créneaux.
 * On ne duplique pas ce contrôle ici : le faire en JavaScript laisserait
 * passer deux saisies simultanées.
 */
export async function poserCours(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const a = schemaCours.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;

    // Avertissement métier : poser un cours sans affectation correspondante
    // signifie que l'enseignant ne pourra pas saisir les notes de ce cours.
    const [aff] = await db
      .select({ enseignantId: affectations.enseignantId })
      .from(affectations)
      .where(
        and(
          eq(affectations.anneeId, v.anneeId),
          eq(affectations.classeId, v.classeId),
          eq(affectations.matiereId, v.matiereId),
          eq(affectations.active, true),
        ),
      );

    const [cree] = await db
      .insert(emploiDuTemps)
      .values({
        anneeId: v.anneeId,
        classeId: v.classeId,
        matiereId: v.matiereId,
        enseignantId: v.enseignantId ?? aff?.enseignantId ?? null,
        salleId: v.salleId,
        jourSemaine: v.jourSemaine,
        creneauId: v.creneauId,
        nbCreneaux: v.nbCreneaux,
        semaineType: v.semaineType ?? null,
      })
      .returning({ id: emploiDuTemps.id });

    await journaliser(acteur, {
      action: "edt.cours_pose",
      entite: "emploi_du_temps",
      entiteId: cree.id,
      apres: v,
    });

    revalidatePath("/dashboard/emploi-du-temps");
    return {
      ok: true,
      id: cree.id,
      message: aff
        ? undefined
        : "Cours posé. Attention : aucune affectation n'existe pour ce couple classe-matière, l'enseignant ne pourra pas saisir de notes.",
    };
  } catch (e) {
    return echec(e, "La pose du cours a échoué.");
  }
}

export async function retirerCours(id: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");
    const [avant] = await db.select().from(emploiDuTemps).where(eq(emploiDuTemps.id, id));
    await db.delete(emploiDuTemps).where(eq(emploiDuTemps.id, id));

    await journaliser(acteur, {
      action: "edt.cours_retire",
      entite: "emploi_du_temps",
      entiteId: id,
      avant: avant ? { classeId: avant.classeId, jour: avant.jourSemaine } : null,
    });

    revalidatePath("/dashboard/emploi-du-temps");
    return OK;
  } catch (e) {
    return echec(e, "Le retrait du cours a échoué.");
  }
}

/** Publie ou masque l'emploi du temps d'une classe pour les familles. */
export async function publierEmploiDuTemps(
  anneeId: string,
  classeId: string,
  publie: boolean,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("emploi_du_temps:gerer");

    await db
      .update(emploiDuTemps)
      .set({ publie })
      .where(and(eq(emploiDuTemps.anneeId, anneeId), eq(emploiDuTemps.classeId, classeId)));

    await journaliser(acteur, {
      action: publie ? "edt.publie" : "edt.masque",
      entite: "emploi_du_temps",
      entiteId: classeId,
    });

    revalidatePath("/dashboard/emploi-du-temps");
    return OK;
  } catch (e) {
    return echec(e, "La publication a échoué.");
  }
}
