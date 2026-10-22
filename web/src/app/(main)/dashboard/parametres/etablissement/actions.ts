"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { etablissement } from "@/server/db/schema";
import { chargerIdentiteLycee } from "@/server/domain/identite-lycee";
import { schemaIdentiteLycee } from "@/server/domain/identite-lycee-schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

type Resultat = { ok: true; message: string } |
  { ok: false; message: string; erreurs?: Record<string, string> };

export async function enregistrerIdentiteLycee(saisie: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("parametre:modifier");
    const analyse = schemaIdentiteLycee.safeParse(saisie);

    if (!analyse.success) {
      const erreurs: Record<string, string> = {};
      for (const e of analyse.error.issues) {
        const cle = String(e.path[0] ?? "_");
        erreurs[cle] ??= e.message;
      }
      return { ok: false, message: "Corrigez les champs indiqués.", erreurs };
    }

    const avant = await chargerIdentiteLycee();
    if (!avant) {
      return { ok: false, message: "La fiche unique du lycée est introuvable. Vérifiez l'installation de la base." };
    }

    const modifications = analyse.data;
    await db.update(etablissement)
      .set({ ...modifications, modifieLe: new Date().toISOString() })
      .where(eq(etablissement.id, true));

    await journaliser(acteur, {
      action: "etablissement.coordonnees_modifiees",
      entite: "etablissement",
      avant: {
        adresse: avant.adresse,
        ville: avant.ville,
        pays: avant.pays,
        telephone: avant.telephone,
        email: avant.email,
        siteWeb: avant.siteWeb,
        ministereTutelle: avant.ministereTutelle,
        autorisationNumero: avant.autorisationNumero,
        nomProviseur: avant.nomProviseur,
        nomCenseur: avant.nomCenseur,
      },
      apres: modifications,
    });

    revalidatePath("/dashboard/parametres");
    revalidatePath("/dashboard/parametres/etablissement");
    revalidatePath("/dashboard/bulletins");
    return { ok: true, message: "Coordonnées et signataires du lycée enregistrés." };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas le droit de modifier cette configuration." };
    }
    console.error("[parametres/etablissement]", erreur);
    return { ok: false, message: "La mise à jour des coordonnées a échoué." };
  }
}
