"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Prépare localement une photo carrée, compatible avec le stockage limité à 200 Ko.
 * Aucune photo n'est transmise avant la validation de l'inscription.
 */
export function PhotoInscription({
  photo, onChange,
}: {
  photo: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const fichier = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [calcul, setCalcul] = useState(false);
  useEffect(() => {
    if (!photo) { setApercu(null); return; }
    const url = URL.createObjectURL(photo);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function preparer(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Format accepté : JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Choisissez une photo de moins de 12 Mo.");
      return;
    }
    setCalcul(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const cote = Math.min(bitmap.width, bitmap.height);
        if (!cote) throw new Error("Image invalide.");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 400;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Traitement d'image indisponible.");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, (bitmap.width - cote) / 2, (bitmap.height - cote) / 2, cote, cote, 0, 0, 400, 400);
        let result: Blob | null = null;
        for (const qualite of [0.82, 0.68, 0.5]) {
          result = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", qualite));
          if (result && result.size <= 200 * 1024) break;
        }
        if (!result || result.type !== "image/webp" || result.size > 200 * 1024) throw new Error("Impossible de réduire la photo à moins de 200 Ko.");
        onChange(result);
      } finally { bitmap.close(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de préparer cette photo.");
    } finally { setCalcul(false); }
  }

  return <div className="flex flex-wrap items-center gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900 dark:bg-blue-950/20">
    <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:bg-muted">
      {apercu ? <img src={apercu} alt="Photo d'identité prête pour l'inscription" className="size-full object-cover" /> : <Camera className="size-8 text-slate-400" aria-hidden />}
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <p className="text-sm font-semibold">Photo d'identité de l'élève</p>
      <p className="text-xs leading-5 text-slate-500">Ajoutez une photo JPEG, PNG ou WebP. Recadrage carré et compression sur votre appareil (400 × 400, 200 Ko maximum).</p>
      <input ref={fichier} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        aria-label="Choisir une photo d'élève"
        onChange={e => { const image = e.target.files?.[0]; if (image) void preparer(image); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={calcul} onClick={() => fichier.current?.click()}>
          {calcul ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          {apercu ? "Changer" : "Choisir une photo"}
        </Button>
        {apercu && <Button type="button" size="sm" variant="ghost" disabled={calcul} onClick={() => onChange(null)}>
          <Trash2 className="size-4" aria-hidden /> Retirer
        </Button>}
      </div>
    </div>
  </div>;
}
