"use client";

import { useRef, useState, useTransition } from "react";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Téléversement d'une photo, compressée DANS LE NAVIGATEUR.
 *
 * Une photo prise au téléphone pèse 3 à 5 Mo. L'envoyer telle quelle sur une
 * connexion tchadienne prendrait une minute et saturerait le quota de base en
 * quelques centaines d'élèves. On recadre et on compresse donc avant l'envoi :
 * le serveur ne reçoit que ~40 ko de WebP.
 *
 * Le serveur revérifie tout de même type et taille : on ne fait jamais
 * confiance à ce que le client annonce.
 */

const COTE = 400; // photo d'identité carrée, suffisante pour l'impression
const QUALITE = 0.82;

export interface ResultatPhoto {
  ok: boolean;
  message?: string;
}

export function TeleverserPhoto({
  photoActuelleId,
  alt,
  onEnvoyer,
  onRetirer,
  taille = "size-28",
}: {
  photoActuelleId: string | null;
  alt: string;
  onEnvoyer: (donnees: FormData) => Promise<ResultatPhoto>;
  onRetirer?: () => Promise<ResultatPhoto>;
  taille?: string;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [enCours, demarrer] = useTransition();
  const [compression, setCompression] = useState(false);
  const [apercu, setApercu] = useState<string | null>(null);

  /**
   * Recadre au centre en carré, redimensionne, et convertit en WebP.
   * Le recadrage centré évite les portraits déformés par un simple étirement.
   */
  async function compresser(fichier: File): Promise<Blob> {
    const image = await createImageBitmap(fichier);
    const cote = Math.min(image.width, image.height);
    const x = (image.width - cote) / 2;
    const y = (image.height - cote) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = COTE;
    canvas.height = COTE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Traitement d'image indisponible sur ce navigateur.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x, y, cote, cote, 0, 0, COTE, COTE);
    image.close();

    const blob = await new Promise<Blob | null>((resoudre) =>
      canvas.toBlob(resoudre, "image/webp", QUALITE),
    );
    if (!blob) throw new Error("La conversion de l'image a échoué.");
    return blob;
  }

  async function traiter(fichier: File) {
    if (!fichier.type.startsWith("image/")) {
      toast.error("Choisissez une image.");
      return;
    }

    setCompression(true);
    try {
      const compresse = await compresser(fichier);
      setApercu(URL.createObjectURL(compresse));

      const donnees = new FormData();
      donnees.append("fichier", compresse, "photo.webp");
      donnees.append("largeur", String(COTE));
      donnees.append("hauteur", String(COTE));

      demarrer(async () => {
        const r = await onEnvoyer(donnees);
        toast[r.ok ? "success" : "error"](
          r.message ?? (r.ok ? "Photo enregistrée." : "Échec de l'enregistrement."),
        );
        if (!r.ok) setApercu(null);
      });
    } catch (erreur) {
      toast.error(erreur instanceof Error ? erreur.message : "Traitement impossible.");
      setApercu(null);
    } finally {
      setCompression(false);
    }
  }

  const source = apercu ?? (photoActuelleId ? `/api/fichiers/${photoActuelleId}` : null);
  const occupe = enCours || compression;

  return (
    <div className="flex items-start gap-3">
      <div
        className={`${taille} relative shrink-0 overflow-hidden rounded-lg border bg-muted`}
      >
        {source ? (
          // biome-ignore lint/performance/noImgElement: l'image vient d'une
          // route authentifiée, l'optimiseur Next.js ne peut pas la traiter.
          <img src={source} alt={alt} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Camera className="size-7" aria-hidden />
          </div>
        )}

        {occupe ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <input
          ref={champ}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) traiter(f);
            e.target.value = "";
          }}
        />

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={occupe}
          onClick={() => champ.current?.click()}
        >
          <Camera aria-hidden />
          {source ? "Changer la photo" : "Ajouter une photo"}
        </Button>

        {source && onRetirer ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={occupe}
            onClick={() =>
              demarrer(async () => {
                const r = await onRetirer();
                if (r.ok) setApercu(null);
                toast[r.ok ? "success" : "error"](r.message ?? (r.ok ? "Photo retirée." : "Échec."));
              })
            }
          >
            <Trash2 aria-hidden />
            Retirer
          </Button>
        ) : null}

        <p className="max-w-56 text-muted-foreground text-xs">
          Recadrée en carré et compressée sur votre appareil avant l&apos;envoi — environ 40 ko.
        </p>
      </div>
    </div>
  );
}
