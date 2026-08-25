"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Actions en lot sur une sélection d'élèves (E-38).
 *
 * POURQUOI TOUT OU RIEN
 * ----------------------
 * Le changement de classe s'exécute dans UNE transaction. Si la classe cible
 * déborde sa capacité au douzième élève, rien ne bouge — au lieu de laisser
 * onze élèves déplacés et neuf restés en arrière, situation qu'il faut ensuite
 * démêler à la main sans savoir qui est passé.
 *
 * Le déclencheur de capacité de la base reste l'autorité : on ne recompte pas
 * les places ici, on laisse la transaction échouer. Vérifier côté application
 * ce que la base vérifie déjà, c'est se donner deux vérités qui divergeront.
 *
 * LE MOTIF EST OBLIGATOIRE, ET COMMUN
 * ------------------------------------
 * Un mouvement de vingt élèves a une raison unique : dédoublement, fusion,
 * réorientation de série. Ce motif est écrit dans `changements_classe` pour
 * chacun — c'est ce que le censeur relira l'année suivante.
 */

export interface ResultatLot {
  ok: boolean;
  message?: string;
  traites?: number;
}

const schemaClasse = z.object({
  eleveIds: z.array(z.string().uuid()).min(1, "Aucun élève sélectionné.").max(200),
  classeId: z.string().uuid(),
  motif: z.string().trim().min(3, "Le motif est obligatoire."),
});

export async function changerClasseEnLot(donnees: unknown): Promise<ResultatLot> {
  try {
    const acteur = await requirePermission("eleve:affecter");

    const a = schemaClasse.safeParse(donnees);
    if (!a.success) {
      return { ok: false, message: a.error.issues[0]?.message ?? "Requête invalide." };
    }
    const { eleveIds, classeId, motif } = a.data;

    // On résout les inscriptions actives ici plutôt que de les faire remonter
    // de l'écran : la liste affiche des élèves, et un élève peut n'avoir aucune
    // inscription active — il ne doit alors pas être déplacé en silence.
    const cibles = await db.execute<{ id: string; eleve_id: string; classe_id: string }>(sql`
      SELECT i.id, i.eleve_id, i.classe_id
        FROM inscriptions i
       WHERE i.eleve_id = ANY(${eleveIds}::uuid[])
         AND i.active
         AND i.classe_id <> ${classeId}::uuid
    `);

    if (cibles.rows.length === 0) {
      return {
        ok: false,
        message: "Aucun élève à déplacer : ils sont déjà dans cette classe, ou sans inscription active.",
      };
    }

    await db.transaction(async (tx) => {
      for (const c of cibles.rows) {
        await tx.execute(sql`
          UPDATE inscriptions SET classe_id = ${classeId}::uuid WHERE id = ${c.id}::uuid
        `);
        await tx.execute(sql`
          INSERT INTO changements_classe
            (inscription_id, classe_origine_id, classe_destination_id, motif, decide_par)
          VALUES (${c.id}::uuid, ${c.classe_id}::uuid, ${classeId}::uuid, ${motif}, ${acteur.id}::uuid)
        `);
      }
    });

    await journaliser(acteur, {
      action: "eleve.classe_changee_en_lot",
      entite: "inscriptions",
      apres: { classeId, eleves: cibles.rows.length },
      motif,
    });

    revalidatePath("/dashboard/eleves");
    revalidatePath("/dashboard/classes");

    const ignores = eleveIds.length - cibles.rows.length;
    return {
      ok: true,
      traites: cibles.rows.length,
      message:
        `${cibles.rows.length} élève(s) déplacé(s).` +
        (ignores > 0 ? ` ${ignores} ignoré(s) : déjà dans la classe ou sans inscription active.` : ""),
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour affecter des élèves." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    // Le message du déclencheur de capacité est explicite ; le masquer par un
    // « échec » générique obligerait à deviner pourquoi rien n'a bougé.
    if (message.includes("ERROR:")) {
      return { ok: false, message: message.replace(/^.*?ERROR:\s*/i, "").slice(0, 200) };
    }
    console.error("[lot-classe]", erreur);
    return { ok: false, message: "Le déplacement a échoué. Aucun élève n'a été déplacé." };
  }
}
