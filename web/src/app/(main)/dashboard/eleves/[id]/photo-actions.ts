"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { eleves, enseignants } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { enregistrerFichier, TYPES_IMAGE } from "@/server/stockage";

export interface ResultatPhoto {
  ok: boolean;
  message?: string;
}

function echec(e: unknown, defaut: string): ResultatPhoto {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  console.error("[photo]", e);
  return { ok: false, message: defaut };
}

/**
 * Extrait le fichier du formulaire et le confie au stockage.
 *
 * Le navigateur a déjà recadré et compressé ; le serveur revérifie le type
 * réel par les octets de tête et la taille. Un client peut mentir sur les
 * deux — c'est précisément pourquoi on ne le croit pas.
 */
async function extraireEtStocker(
  donnees: FormData,
  usage: "PHOTO_ELEVE" | "PHOTO_ENSEIGNANT",
  acteurId: string,
) {
  const fichier = donnees.get("fichier");
  if (!(fichier instanceof File)) {
    return { ok: false as const, erreur: "Aucun fichier reçu." };
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const largeur = Number(donnees.get("largeur")) || undefined;
  const hauteur = Number(donnees.get("hauteur")) || undefined;

  const r = await enregistrerFichier(
    {
      contenu,
      nomOrigine: fichier.name || "photo.webp",
      mimeType: fichier.type || "image/webp",
      usage,
      largeur,
      hauteur,
    },
    acteurId,
    TYPES_IMAGE,
  );

  return r.ok && r.id ? { ok: true as const, id: r.id } : { ok: false as const, erreur: r.erreur };
}

export async function definirPhotoEleve(
  eleveId: string,
  donnees: FormData,
): Promise<ResultatPhoto> {
  try {
    const acteur = await requirePermission("eleve:modifier");

    const stockage = await extraireEtStocker(donnees, "PHOTO_ELEVE", acteur.id);
    if (!stockage.ok) return { ok: false, message: stockage.erreur };

    await db.update(eleves).set({ photoId: stockage.id }).where(eq(eleves.id, eleveId));

    await journaliser(acteur, {
      action: "eleve.photo_definie",
      entite: "eleves",
      entiteId: eleveId,
      eleveId,
      apres: { photoId: stockage.id },
    });

    revalidatePath(`/dashboard/eleves/${eleveId}`);
    return { ok: true, message: "Photo enregistrée." };
  } catch (e) {
    return echec(e, "L'enregistrement de la photo a échoué.");
  }
}

export async function retirerPhotoEleve(eleveId: string): Promise<ResultatPhoto> {
  try {
    const acteur = await requirePermission("eleve:modifier");

    // On détache seulement : le fichier lui-même est retiré par la purge des
    // orphelins, ce qui laisse une heure pour annuler une fausse manœuvre.
    await db.update(eleves).set({ photoId: null }).where(eq(eleves.id, eleveId));

    await journaliser(acteur, {
      action: "eleve.photo_retiree",
      entite: "eleves",
      entiteId: eleveId,
      eleveId,
    });

    revalidatePath(`/dashboard/eleves/${eleveId}`);
    return { ok: true, message: "Photo retirée." };
  } catch (e) {
    return echec(e, "Le retrait de la photo a échoué.");
  }
}

export async function definirPhotoEnseignant(
  enseignantId: string,
  donnees: FormData,
): Promise<ResultatPhoto> {
  try {
    const acteur = await requirePermission("utilisateur:modifier");

    const stockage = await extraireEtStocker(donnees, "PHOTO_ENSEIGNANT", acteur.id);
    if (!stockage.ok) return { ok: false, message: stockage.erreur };

    await db.update(enseignants).set({ photoId: stockage.id }).where(eq(enseignants.id, enseignantId));

    await journaliser(acteur, {
      action: "enseignant.photo_definie",
      entite: "enseignants",
      entiteId: enseignantId,
    });

    revalidatePath(`/dashboard/personnel/${enseignantId}`);
    return { ok: true, message: "Photo enregistrée." };
  } catch (e) {
    return echec(e, "L'enregistrement de la photo a échoué.");
  }
}

export async function retirerPhotoEnseignant(enseignantId: string): Promise<ResultatPhoto> {
  try {
    const acteur = await requirePermission("utilisateur:modifier");
    await db.update(enseignants).set({ photoId: null }).where(eq(enseignants.id, enseignantId));
    await journaliser(acteur, {
      action: "enseignant.photo_retiree",
      entite: "enseignants",
      entiteId: enseignantId,
    });
    revalidatePath(`/dashboard/personnel/${enseignantId}`);
    return { ok: true, message: "Photo retirée." };
  } catch (e) {
    return echec(e, "Le retrait de la photo a échoué.");
  }
}
