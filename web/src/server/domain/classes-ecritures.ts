import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import type { Principal } from "@/server/auth/session";
import { db } from "@/server/db";

/**
 * Archivage d'une classe — l'alternative sûre à la suppression.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * L'interface n'offrait que `supprimerClasse`, qui fait un `DELETE`. Or
 * `emploi_du_temps.classe_id` et d'autres tables sont en `ON DELETE CASCADE` :
 * supprimer une classe emporte sa grille horaire et ce qui en dépend, sans
 * retour possible. Une demande de suppression formulée à l'oral, sur WhatsApp,
 * ne doit pas pouvoir produire cela.
 *
 * Archiver, c'est poser `active = false` : la classe disparaît des listes de
 * l'année courante (`listerClassesCourantes` filtre sur `active`), ne reçoit
 * plus d'élève (`changerClasse` refuse une destination archivée), mais tout son
 * historique reste lisible et l'opération se défait en reposant `true`.
 *
 * CE MODULE NE DÉCIDE PAS DES DROITS
 * -----------------------------------
 * Il reçoit l'acteur DÉJÀ autorisé (`classe:modifier`, comme la suppression).
 * Il est hors d'un fichier `"use server"` : exporter de là une fonction qui
 * accepte un acteur arbitraire laisserait un client choisir son identité.
 */

export interface ResultatArchivage {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function archiverClassePour(
  acteur: Principal,
  params: { classeId?: unknown; motif?: unknown },
): Promise<ResultatArchivage> {
  const classeId = typeof params.classeId === "string" ? params.classeId.trim() : "";
  const motif = typeof params.motif === "string" ? params.motif.trim() : "";
  if (!UUID.test(classeId)) return { ok: false, erreurs: { classeId: "Classe requise." } };
  if (motif.length < 5) return { ok: false, erreurs: { motif: "Le motif doit être explicite (5 caractères minimum)." } };

  return db.transaction(async (tx) => {
    // Verrou sur la classe : une inscription concurrente ne doit pas s'y
    // glisser entre le comptage et l'archivage.
    const res = await tx.execute<{ libelle: string; code: string; active: boolean; annee: string }>(sql`
      SELECT c.libelle, c.code, c.active, a.libelle AS annee
        FROM classes c JOIN annees_scolaires a ON a.id = c.annee_id
       WHERE c.id = ${classeId}::uuid
       FOR UPDATE OF c
    `);
    const classe = res.rows[0];
    if (!classe) return { ok: false, message: "Classe introuvable." };
    if (!classe.active) return { ok: false, message: `La classe ${classe.libelle} est déjà archivée.` };

    // Des élèves y sont encore inscrits : l'archiver les rendrait invisibles
    // dans les listes sans les avoir déplacés. On refuse, et on dit combien.
    const eff = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM inscriptions WHERE classe_id = ${classeId}::uuid AND active
    `);
    const actifs = Number(eff.rows[0]?.n ?? 0);
    if (actifs > 0) {
      return {
        ok: false,
        message: `La classe ${classe.libelle} compte encore ${actifs} élève(s) inscrit(s). Changez-les de classe avant de l'archiver.`,
      };
    }

    await tx.execute(sql`UPDATE classes SET active = false WHERE id = ${classeId}::uuid`);

    await journaliser(acteur, {
      action: "classe.archivee",
      entite: "classes",
      entiteId: classeId,
      avant: { active: true, libelle: classe.libelle, code: classe.code, annee: classe.annee },
      apres: { active: false },
      motif,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/classes");
    return { ok: true, message: `Classe ${classe.libelle} (${classe.annee}) archivée. Son historique reste consultable.` };
  });
}
