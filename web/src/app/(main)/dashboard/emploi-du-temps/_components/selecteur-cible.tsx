"use client";

import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const TITRES = {
  classe: "Classe",
  enseignant: "Enseignant",
  salle: "Salle",
} as const;

/**
 * Sélection de la cible affichée par la grille.
 *
 * Le choix passe par l'URL plutôt que par un état local : la grille est
 * rendue côté serveur, et un emploi du temps se partage par lien.
 */
export function SelecteurCible({
  vue,
  cibles,
  cibleId,
}: {
  vue: "classe" | "enseignant" | "salle";
  cibles: Array<{ id: string; libelle: string }>;
  cibleId: string;
}) {
  const routeur = useRouter();

  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="cible">{TITRES[vue]}</Label>
      <NativeSelect
        id="cible"
        value={cibleId}
        onChange={(e) =>
          routeur.push(`/dashboard/emploi-du-temps?vue=${vue}&cible=${e.target.value}`)
        }
      >
        {cibles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.libelle}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
