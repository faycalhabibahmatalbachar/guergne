"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { evaluations, notes } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { lireFeuille } from "@/server/import/feuille";
import { analyserNotes, type RapportNotes } from "@/server/import/notes";

export interface ResultatImportNotes {
  ok: boolean;
  message?: string;
  rapport?: RapportNotes;
  ecrites?: number;
}

function echec(erreur: unknown, defaut: string): ResultatImportNotes {
  if (erreur instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour saisir ces notes." };
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (message.includes("format") || message.includes("Format") || message.includes(".xls")) {
    return { ok: false, message };
  }
  // Les déclencheurs PostgreSQL remontent des messages métier lisibles
  // (barème dépassé, évaluation verrouillée).
  if (message.includes("ERROR:")) {
    return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
  }
  console.error("[import-notes]", erreur);
  return { ok: false, message: defaut };
}

async function lireEtAnalyser(donnees: FormData) {
  const fichier = donnees.get("fichier");
  const evaluationId = String(donnees.get("evaluationId") ?? "");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Aucun fichier reçu." as const };
  }
  if (fichier.size > 2 * 1024 * 1024) {
    return { erreur: "Fichier trop volumineux (2 Mo maximum)." as const };
  }
  if (!/^[0-9a-f-]{36}$/i.test(evaluationId)) {
    return { erreur: "Évaluation non désignée." as const };
  }

  const feuille = await lireFeuille(fichier);
  if (feuille.lignes.length === 0) {
    return { erreur: "Le fichier ne contient aucune ligne de données." as const };
  }

  const rapport = await analyserNotes(feuille, evaluationId);
  if (!rapport) return { erreur: "Évaluation introuvable." as const };

  return { rapport, fichier, evaluationId };
}

/** Lit le fichier et le confronte à l'évaluation, sans rien écrire. */
export async function analyserFichierNotes(donnees: FormData): Promise<ResultatImportNotes> {
  try {
    const evaluationId = String(donnees.get("evaluationId") ?? "");
    const [ev] = await db
      .select({ classeId: evaluations.classeId, matiereId: evaluations.matiereId })
      .from(evaluations)
      .where(eq(evaluations.id, evaluationId));
    if (!ev) return { ok: false, message: "Évaluation introuvable." };

    await requirePermission("note:saisir", { classeId: ev.classeId, matiereId: ev.matiereId });

    const lu = await lireEtAnalyser(donnees);
    if ("erreur" in lu) return { ok: false, message: lu.erreur };

    return { ok: true, rapport: lu.rapport };
  } catch (erreur) {
    return echec(erreur, "La lecture du fichier a échoué.");
  }
}

/**
 * Écrit les notes du fichier.
 *
 * TOUT OU RIEN, contrairement à l'import des élèves.
 *
 * La différence mérite d'être expliquée : cinq cents inscriptions sont des
 * actes indépendants — si l'une échoue, les autres restent valables. Une grille
 * de notes est un TOUT. Une classe à moitié notée fausse la moyenne, le rang de
 * tous les élèves, et personne ne sait quelles lignes ont été prises. On
 * préfère donc tout refuser et laisser le professeur corriger son fichier.
 *
 * Les élèves absents du fichier ne sont pas touchés : leur note actuelle, s'ils
 * en ont une, est conservée. Un import n'est pas une remise à zéro.
 */
export async function importerNotes(donnees: FormData): Promise<ResultatImportNotes> {
  try {
    const evaluationId = String(donnees.get("evaluationId") ?? "");
    const [ev] = await db
      .select({
        classeId: evaluations.classeId,
        matiereId: evaluations.matiereId,
        titre: evaluations.titre,
        verrouillee: evaluations.estVerrouillee,
      })
      .from(evaluations)
      .where(eq(evaluations.id, evaluationId));
    if (!ev) return { ok: false, message: "Évaluation introuvable." };

    if (ev.verrouillee) {
      return {
        ok: false,
        message: "Cette évaluation est verrouillée. Déverrouillez-la avant d'importer.",
      };
    }

    const acteur = await requirePermission("note:saisir", {
      classeId: ev.classeId,
      matiereId: ev.matiereId,
    });

    const lu = await lireEtAnalyser(donnees);
    if ("erreur" in lu) return { ok: false, message: lu.erreur };

    const rapport = lu.rapport;

    if (rapport.colonnesManquantes.length > 0) {
      return {
        ok: false,
        message: `Colonnes absentes : ${rapport.colonnesManquantes.join(", ")}.`,
        rapport,
      };
    }
    if (rapport.erreurs.length > 0 || rapport.doublonsFichier.length > 0) {
      return {
        ok: false,
        message:
          "Le fichier contient des erreurs. Rien n'a été écrit — corrigez-les puis redéposez.",
        rapport,
      };
    }
    if (rapport.valides.length === 0) {
      return { ok: false, message: "Aucune note exploitable dans ce fichier.", rapport };
    }

    await db.transaction(async (tx) => {
      for (const n of rapport.valides) {
        const valeurs = {
          valeur: n.statut === "NOTEE" && n.valeur !== null ? String(n.valeur) : null,
          statut: n.statut,
          appreciation: n.appreciation,
          saisiePar: acteur.id,
        };

        const [existante] = await tx
          .select({ id: notes.id })
          .from(notes)
          .where(and(eq(notes.evaluationId, evaluationId), eq(notes.inscriptionId, n.inscriptionId)));

        if (existante) {
          await tx.update(notes).set(valeurs).where(eq(notes.id, existante.id));
        } else {
          await tx.insert(notes).values({
            evaluationId,
            inscriptionId: n.inscriptionId,
            ...valeurs,
          });
        }
      }
    });

    await journaliser(acteur, {
      action: "notes.importees",
      entite: "evaluations",
      entiteId: evaluationId,
      apres: {
        evaluation: ev.titre,
        fichier: lu.fichier.name,
        notes: rapport.valides.length,
        non_fournis: rapport.nonFournis.length,
      },
    });

    // Les moyennes stockées deviennent caduques : elles seront recalculées à la
    // prochaine production de bulletins.
    await db.execute(sql`
      DELETE FROM moyennes_matiere
       WHERE periode_id = (SELECT periode_id FROM evaluations WHERE id = ${evaluationId}::uuid)
         AND matiere_id = (SELECT matiere_id FROM evaluations WHERE id = ${evaluationId}::uuid)
         AND inscription_id IN (
              SELECT id FROM inscriptions WHERE classe_id = ${ev.classeId}::uuid AND active
         )
    `);

    revalidatePath("/dashboard/notes");

    return {
      ok: true,
      ecrites: rapport.valides.length,
      rapport,
      message:
        rapport.nonFournis.length === 0
          ? `${rapport.valides.length} note(s) enregistrée(s).`
          : `${rapport.valides.length} note(s) enregistrée(s). ${rapport.nonFournis.length} élève(s) absents du fichier gardent leur note.`,
    };
  } catch (erreur) {
    return echec(erreur, "L'import a échoué.");
  }
}
