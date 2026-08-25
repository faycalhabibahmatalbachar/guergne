"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { evaluations, notes } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  id?: string;
}

const OK: Resultat = { ok: true };

function echec(e: unknown, defaut: string): Resultat {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  const m = e instanceof Error ? e.message : "";
  // Messages métier des déclencheurs : barème dépassé, période verrouillée…
  if (/barème|verrouillée|classe évaluée/.test(m)) {
    return { ok: false, message: m.replace(/^.*?ERROR:\s*/i, "").split("\n")[0] };
  }
  console.error("[notes]", e);
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
// Évaluations
// ===========================================================================

const schemaEvaluation = z.object({
  anneeId: z.string().uuid(),
  periodeId: z.string().uuid(),
  classeId: z.string().uuid("Sélectionnez une classe"),
  matiereId: z.string().uuid("Sélectionnez une matière"),
  type: z.enum(["INTERROGATION", "DEVOIR", "COMPOSITION", "EXAMEN_BLANC", "TP", "ORAL"]),
  titre: z.string().trim().min(3, "Donnez un titre explicite"),
  dateEvaluation: z.string().min(1, "Date requise"),
  bareme: z.coerce.number().min(1).max(100).default(20),
  poids: z.coerce.number().min(0.5).max(10).default(1),
  dureeMinutes: z.coerce.number().int().min(1).max(480).nullable().optional(),
  compteDansMoyenne: z.boolean().default(true),
});

export async function creerEvaluation(donnees: unknown): Promise<Resultat> {
  try {
    // Le périmètre est vérifié sur le couple (classe, matière) : un enseignant
    // ne peut créer d'évaluation que là où il est affecté.
    const a = schemaEvaluation.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;
    const acteur = await requirePermission("evaluation:creer", {
      classeId: v.classeId,
      matiereId: v.matiereId,
    });

    const [cree] = await db
      .insert(evaluations)
      .values({
        anneeId: v.anneeId,
        periodeId: v.periodeId,
        classeId: v.classeId,
        matiereId: v.matiereId,
        type: v.type,
        titre: v.titre,
        dateEvaluation: v.dateEvaluation,
        bareme: String(v.bareme),
        poids: String(v.poids),
        dureeMinutes: v.dureeMinutes ?? null,
        compteDansMoyenne: v.compteDansMoyenne,
        statut: "PROGRAMMEE",
        creePar: acteur.id,
      })
      .returning({ id: evaluations.id });

    await journaliser(acteur, {
      action: "evaluation.creee",
      entite: "evaluations",
      entiteId: cree.id,
      apres: { titre: v.titre, type: v.type, bareme: v.bareme },
    });

    revalidatePath("/dashboard/notes");
    return { ok: true, id: cree.id };
  } catch (e) {
    return echec(e, "La création de l'évaluation a échoué.");
  }
}

export async function changerStatutEvaluation(
  evaluationId: string,
  statut: "BROUILLON" | "PROGRAMMEE" | "PASSEE" | "CORRIGEE" | "PUBLIEE" | "ANNULEE",
): Promise<Resultat> {
  try {
    // Publier des notes est une décision pédagogique : elle relève du censeur
    // ou de la direction, pas de l'enseignant qui a saisi.
    const acteur = await requirePermission(
      statut === "PUBLIEE" ? "bulletin:publier" : "evaluation:modifier",
    );

    const [avant] = await db
      .select({ statut: evaluations.statut, titre: evaluations.titre })
      .from(evaluations)
      .where(eq(evaluations.id, evaluationId));
    if (!avant) return { ok: false, message: "Évaluation introuvable." };

    await db
      .update(evaluations)
      .set({
        statut,
        publieeLe: statut === "PUBLIEE" ? new Date().toISOString() : null,
        publieePar: statut === "PUBLIEE" ? acteur.id : null,
      })
      .where(eq(evaluations.id, evaluationId));

    await journaliser(acteur, {
      action: `evaluation.${statut.toLowerCase()}`,
      entite: "evaluations",
      entiteId: evaluationId,
      avant: { statut: avant.statut },
      apres: { statut },
    });

    revalidatePath("/dashboard/notes");
    return {
      ok: true,
      message:
        statut === "PUBLIEE"
          ? "Notes publiées : elles sont désormais visibles des familles."
          : undefined,
    };
  } catch (e) {
    return echec(e, "Le changement d'état a échoué.");
  }
}

export async function basculerVerrouEvaluation(
  evaluationId: string,
  verrouiller: boolean,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("periode:verrouiller");
    await db
      .update(evaluations)
      .set({ estVerrouillee: verrouiller })
      .where(eq(evaluations.id, evaluationId));

    await journaliser(acteur, {
      action: verrouiller ? "evaluation.verrouillee" : "evaluation.deverrouillee",
      entite: "evaluations",
      entiteId: evaluationId,
    });

    revalidatePath("/dashboard/notes");
    return OK;
  } catch (e) {
    return echec(e, "Le verrouillage a échoué.");
  }
}

// ===========================================================================
// Saisie des notes
// ===========================================================================

const schemaSaisie = z.object({
  evaluationId: z.string().uuid(),
  lignes: z.array(
    z.object({
      inscriptionId: z.string().uuid(),
      valeur: z.union([z.coerce.number().min(0), z.null()]),
      statut: z.enum(["NOTEE", "ABSENT", "ABSENT_ZERO", "DISPENSE", "NON_RENDU"]),
      appreciation: z.string().trim().optional(),
    }),
  ),
});

/**
 * Enregistre la grille de notes d'une évaluation.
 *
 * Écriture en une transaction : une saisie de classe est un tout. Si une seule
 * note dépasse le barème, rien n'est enregistré et le professeur corrige —
 * plutôt que de découvrir une grille à moitié saisie.
 *
 * Les contrôles d'intégrité (barème, appartenance à la classe, verrous) sont
 * appliqués par des déclencheurs PostgreSQL : ils valent quel que soit le
 * chemin d'écriture.
 */
export async function enregistrerNotes(donnees: unknown): Promise<Resultat> {
  try {
    const a = schemaSaisie.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messages(a.error) };

    const v = a.data;

    const [evaluation] = await db
      .select({
        classeId: evaluations.classeId,
        matiereId: evaluations.matiereId,
        titre: evaluations.titre,
      })
      .from(evaluations)
      .where(eq(evaluations.id, v.evaluationId));
    if (!evaluation) return { ok: false, message: "Évaluation introuvable." };

    const acteur = await requirePermission("note:saisir", {
      classeId: evaluation.classeId,
      matiereId: evaluation.matiereId,
    });

    let ecrites = 0;

    await db.transaction(async (tx) => {
      for (const ligne of v.lignes) {
        // Une case laissée vide n'est pas une note : on n'écrit rien, et on
        // retire une éventuelle note précédente devenue caduque.
        if (ligne.statut === "NOTEE" && (ligne.valeur === null || Number.isNaN(ligne.valeur))) {
          await tx
            .delete(notes)
            .where(
              and(
                eq(notes.evaluationId, v.evaluationId),
                eq(notes.inscriptionId, ligne.inscriptionId),
              ),
            );
          continue;
        }

        const valeurs = {
          valeur: ligne.statut === "NOTEE" ? String(ligne.valeur) : null,
          statut: ligne.statut,
          appreciation: ligne.appreciation || null,
          saisiePar: acteur.id,
        };

        const [existante] = await tx
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.evaluationId, v.evaluationId),
              eq(notes.inscriptionId, ligne.inscriptionId),
            ),
          );

        if (existante) {
          await tx.update(notes).set(valeurs).where(eq(notes.id, existante.id));
        } else {
          await tx.insert(notes).values({
            evaluationId: v.evaluationId,
            inscriptionId: ligne.inscriptionId,
            ...valeurs,
          });
        }
        ecrites += 1;
      }
    });

    await journaliser(acteur, {
      action: "notes.saisies",
      entite: "evaluations",
      entiteId: v.evaluationId,
      apres: { titre: evaluation.titre, nbNotes: ecrites },
    });

    revalidatePath("/dashboard/notes");
    return { ok: true, message: `${ecrites} note(s) enregistrée(s).` };
  } catch (e) {
    return echec(e, "L'enregistrement des notes a échoué.");
  }
}

/**
 * Duplique une évaluation vers d'autres classes (E-44).
 *
 * LE MÊME DEVOIR EST DONNÉ À TROIS CLASSES
 * -----------------------------------------
 * Un professeur qui a la 6e A, B et C fait passer le même contrôle aux trois.
 * Le ressaisir trois fois — titre, type, barème, poids, durée — coûte du temps
 * et produit des écarts : un barème sur 20 ici, sur 40 là, et les moyennes ne
 * sont plus comparables entre classes du même niveau.
 *
 * ON NE COPIE QUE LA COQUILLE
 * ----------------------------
 * Jamais les notes. Ce sont d'autres élèves.
 *
 * L'ENSEIGNANT EST CELUI DE LA CLASSE D'ARRIVÉE
 * ----------------------------------------------
 * La 6e B peut être tenue par un autre professeur. Recopier l'enseignant
 * d'origine lui attribuerait une évaluation qui n'est pas la sienne, et
 * fausserait « qui n'a pas saisi » avant le conseil.
 *
 * LE STATUT REPART À « PROGRAMMÉE »
 * ----------------------------------
 * L'original peut être corrigé, voire publié. La copie, elle, n'a pas encore
 * eu lieu — la marquer « corrigée » la ferait compter comme une évaluation
 * dont les notes manquent.
 */
export async function dupliquerEvaluation(
  evaluationId: string,
  classeIds: string[],
  dateEvaluation?: string,
): Promise<Resultat & { creees?: number; ignorees?: string[] }> {
  try {
    if (classeIds.length === 0) {
      return { ok: false, message: "Choisissez au moins une classe de destination." };
    }

    const [source] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId));
    if (!source) return { ok: false, message: "Évaluation introuvable." };

    const acteur = await requirePermission("evaluation:creer", {
      classeId: source.classeId,
      matiereId: source.matiereId,
    });

    // Une classe qui n'a pas cette matière à son programme ne peut pas
    // recevoir l'évaluation : la note n'entrerait dans aucune moyenne, et
    // apparaîtrait comme une saisie manquante que personne ne pourrait combler.
    const eligibles = await db.execute<{ id: string; libelle: string; enseignant_id: string | null }>(sql`
      SELECT c.id, c.libelle,
             (SELECT af.enseignant_id FROM affectations af
               WHERE af.classe_id = c.id AND af.matiere_id = ${source.matiereId}::uuid AND af.active
               LIMIT 1) AS enseignant_id
        FROM classes c
        JOIN coefficients co
          ON co.matiere_id = ${source.matiereId}::uuid
         AND co.annee_id = c.annee_id
         AND co.niveau_id = c.niveau_id
         AND (co.serie_id IS NULL OR co.serie_id = c.serie_id)
       WHERE c.id = ANY(${classeIds}::uuid[])
         AND c.id <> ${source.classeId}::uuid
    `);

    const retenues = eligibles.rows;
    const ignorees = classeIds.filter((id) => !retenues.some((c) => c.id === id));

    if (retenues.length === 0) {
      return {
        ok: false,
        message: "Aucune classe éligible : la matière ne figure pas à leur programme.",
      };
    }

    await db.transaction(async (tx) => {
      for (const c of retenues) {
        await tx.insert(evaluations).values({
          anneeId: source.anneeId,
          periodeId: source.periodeId,
          classeId: c.id,
          matiereId: source.matiereId,
          enseignantId: c.enseignant_id,
          type: source.type,
          titre: source.titre,
          dateEvaluation: dateEvaluation || source.dateEvaluation,
          bareme: source.bareme,
          poids: source.poids,
          dureeMinutes: source.dureeMinutes,
          compteDansMoyenne: source.compteDansMoyenne,
          observations: source.observations,
          statut: "PROGRAMMEE",
          creePar: acteur.id,
        });
      }
    });

    await journaliser(acteur, {
      action: "evaluation.dupliquee",
      entite: "evaluations",
      entiteId: evaluationId,
      apres: { titre: source.titre, classes: retenues.map((c) => c.libelle) },
    });

    revalidatePath("/dashboard/notes");

    return {
      ok: true,
      creees: retenues.length,
      ignorees: ignorees.length > 0 ? ignorees : undefined,
      message:
        `Évaluation créée dans ${retenues.length} classe(s).` +
        (ignorees.length > 0
          ? ` ${ignorees.length} écartée(s) : la matière n'est pas à leur programme.`
          : ""),
    };
  } catch (e) {
    return echec(e, "La duplication a échoué.");
  }
}
