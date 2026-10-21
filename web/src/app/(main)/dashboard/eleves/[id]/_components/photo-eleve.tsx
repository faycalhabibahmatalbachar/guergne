"use client";

import { TeleverserPhoto } from "@/components/televerser-photo";
import { imageProfilEleve } from "@/lib/avatar-eleve";

import { definirPhotoEleve, retirerPhotoEleve } from "../photo-actions";

/**
 * Photo de l'élève sur sa fiche.
 *
 * Ce composant n'existe que pour lier le composant générique de téléversement
 * aux actions serveur : celles-ci ne peuvent pas être passées en propriété
 * depuis un composant serveur sans être d'abord refermées sur l'identifiant.
 */
export function PhotoEleve({
  eleveId,
  photoId,
  nomComplet,
  sexe,
  peutModifier = true,
}: {
  eleveId: string;
  photoId: string | null;
  nomComplet: string;
  sexe?: "M" | "F" | null;
  peutModifier?: boolean;
}) {
  if (!peutModifier) {
    const source = imageProfilEleve({ id: eleveId, sexe, photoUrl: photoId ? "/api/fichiers/" + photoId : null });
    return <div className="size-32 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-muted sm:size-36">
      {/* La photo réelle est servie par une route authentifiée ; pas d’optimiseur externe. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt={"Photo ou avatar de " + nomComplet} className="size-full object-cover" />
    </div>;
  }
  return (
    <TeleverserPhoto
      photoActuelleId={photoId}
      alt={`Photo de ${nomComplet}`}
      taille="size-32 sm:size-36"
      onEnvoyer={(donnees) => definirPhotoEleve(eleveId, donnees)}
      onRetirer={() => retirerPhotoEleve(eleveId)}
    />
  );
}
