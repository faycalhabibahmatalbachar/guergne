"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { dureeInvitationJours } from "@/server/domain/parametres";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export async function reglerValiditeInvitations(jours: number): Promise<{ ok: boolean; message: string }> {
  try {
    const acteur = await requirePermission("parametre:modifier");
    if (!Number.isInteger(jours) || jours < 1 || jours > 30) {
      return { ok: false, message: "Choisissez une durée entière de 1 à 30 jours." };
    }

    const precedent = await dureeInvitationJours();
    await db.execute(sql`
      INSERT INTO parametres (cle, valeur, description)
      VALUES ('invitation_parent_validite_jours', ${String(jours)},
              'Durée des nouveaux codes d''activation parents, en jours (1 à 30).')
      ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, modifie_le = now()
    `);

    await journaliser(acteur, {
      action: "parametre.validite_invitation_parent",
      entite: "parametres",
      avant: { jours: precedent },
      apres: { jours },
    });

    revalidatePath("/dashboard/parametres/parents");
    return { ok: true, message: "Durée des prochains codes d'activation mise à jour." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas le droit de modifier ce paramètre." };
    }
    console.error("[parametres/parents]", erreur);
    return { ok: false, message: "Enregistrement impossible." };
  }
}
