"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { schemaIdentiteLycee } from "@/lib/parametres-identite";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { etablissement } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface ReponseIdentite {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

export async function sauvegarderIdentiteLycee(inconnue: unknown): Promise<ReponseIdentite> {
  try {
    const acteur = await requirePermission("parametre:modifier");
    const parse = schemaIdentiteLycee.safeParse(inconnue);
    if (!parse.success) {
      const erreurs: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const champ = String(issue.path[0] ?? "_");
        erreurs[champ] ??= issue.message;
      }
      return { ok: false, message: "Vérifiez les champs signalés.", erreurs };
    }

    const { version, ...champs } = parse.data;
    const [avant] = await db.select({
      adresse: etablissement.adresse,
      ville: etablissement.ville,
      pays: etablissement.pays,
      telephone: etablissement.telephone,
      email: etablissement.email,
      siteWeb: etablissement.siteWeb,
      ministereTutelle: etablissement.ministereTutelle,
      autorisationNumero: etablissement.autorisationNumero,
      nomProviseur: etablissement.nomProviseur,
      nomCenseur: etablissement.nomCenseur,
    }).from(etablissement).where(eq(etablissement.id, true)).limit(1);

    if (!avant) {
      return { ok: false, message: "La fiche du lycée est absente de la base. Aucune modification effectuée." };
    }

    // Compare directement la représentation PostgreSQL de la version lue.
    // Une fiche modifiée par un autre administrateur n'est pas écrasée.
    const modifiee = await db.update(etablissement)
      .set({ ...champs, modifieLe: sql`now()` })
      .where(and(
        eq(etablissement.id, true),
        sql`${etablissement.modifieLe}::text = ${version}`,
      ))
      .returning({ id: etablissement.id });

    if (modifiee.length !== 1) {
      return { ok: false, message: "La fiche a été modifiée entre-temps. Rechargez cette page puis réessayez." };
    }

    await journaliser(acteur, {
      action: "etablissement.coordonnees_modifiees",
      entite: "etablissement",
      avant,
      apres: champs,
    });
    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/parametres/etablissement");
    return { ok: true, message: "Coordonnées officielles du lycée enregistrées." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour modifier la fiche du lycée." };
    }
    console.error("[parametres/etablissement]", erreur);
    return { ok: false, message: "Impossible d'enregistrer la fiche de l'établissement." };
  }
}
