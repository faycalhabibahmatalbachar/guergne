"use client";

import { TeleverserPhoto } from "@/components/televerser-photo";

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
}: {
  eleveId: string;
  photoId: string | null;
  nomComplet: string;
}) {
  return (
    <TeleverserPhoto
      photoActuelleId={photoId}
      alt={`Photo de ${nomComplet}`}
      taille="size-24"
      onEnvoyer={(donnees) => definirPhotoEleve(eleveId, donnees)}
      onRetirer={() => retirerPhotoEleve(eleveId)}
    />
  );
}
