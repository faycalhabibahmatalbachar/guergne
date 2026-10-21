"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TeleverserPhoto } from "@/components/televerser-photo";
import { imageProfilEleve } from "@/lib/avatar-eleve";
import { definirPhotoEleve, retirerPhotoEleve } from "../photo-actions";

/** Une seule vignette dans le bandeau. Les commandes photo sont dans la fenêtre. */
export function PhotoEleve({
  eleveId, photoId, nomComplet, sexe, peutModifier = false,
}: {
  eleveId: string; photoId: string | null; nomComplet: string;
  sexe?: "M" | "F" | null; peutModifier?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const router = useRouter();
  const src = imageProfilEleve({
    id: eleveId, sexe, photoUrl: photoId ? "/api/fichiers/" + photoId : null,
  });
  return (
    <>
      <div className="relative size-[92px] shrink-0 sm:size-[136px] xl:size-[156px]">
        <div className="size-full overflow-hidden rounded-full border-[5px] border-white bg-slate-100 shadow-[0_5px_20px_rgba(15,23,42,0.14)] ring-1 ring-slate-200 dark:border-slate-900 dark:ring-border">
          {/* Image privée authentifiée, ou avatar SVG local. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={photoId ? "Photo de " + nomComplet : "Avatar illustré de " + nomComplet} className="size-full object-cover" />
        </div>
        {peutModifier ? (
          <Button
            type="button" variant="outline" size="icon"
            aria-label={"Modifier la photo de " + nomComplet}
            title="Modifier la photo"
            onClick={() => setOuvert(true)}
            className="absolute bottom-0 right-0 size-9 rounded-full border-[3px] border-white bg-[#10244b] text-white shadow-md hover:bg-[#203c72] hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-background"
          >
            <Camera className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {peutModifier ? (
        <Dialog open={ouvert} onOpenChange={setOuvert}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-2xl p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle>Photo d’identité de l’élève</DialogTitle>
              <DialogDescription>
                Remplacez l’avatar illustré par une photo réelle autorisée. Le fichier sera compressé avant son enregistrement.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <TeleverserPhoto
                photoActuelleId={photoId}
                alt={"Photo de " + nomComplet}
                taille="size-28"
                onEnvoyer={async (donnees) => {
                  const resultat = await definirPhotoEleve(eleveId, donnees);
                  if (resultat.ok) { router.refresh(); setOuvert(false); }
                  return resultat;
                }}
                onRetirer={async () => {
                  const resultat = await retirerPhotoEleve(eleveId);
                  if (resultat.ok) { router.refresh(); setOuvert(false); }
                  return resultat;
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
