"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const GRAVITES = [
  { valeur: "MINEURE", libelle: "Mineure" },
  { valeur: "MOYENNE", libelle: "Moyenne" },
  { valeur: "GRAVE", libelle: "Grave" },
  { valeur: "TRES_GRAVE", libelle: "Très grave" },
];

const SANCTIONS = [
  { valeur: "AVERTISSEMENT_ORAL", libelle: "Avertissement oral" },
  { valeur: "AVERTISSEMENT_ECRIT", libelle: "Avertissement écrit" },
  { valeur: "RETENUE", libelle: "Retenue" },
  { valeur: "TRAVAIL_INTERET_GENERAL", libelle: "Travail d'intérêt général" },
  { valeur: "EXCLUSION_COURS", libelle: "Exclusion de cours" },
  { valeur: "EXCLUSION_TEMPORAIRE", libelle: "Exclusion temporaire" },
  { valeur: "CONSEIL_DISCIPLINE", libelle: "Conseil de discipline" },
  { valeur: "EXCLUSION_DEFINITIVE", libelle: "Exclusion définitive" },
];

/**
 * Filtres de la vie scolaire.
 *
 * « Sanctions à exécuter » n'est pas un filtre comme les autres : une exclusion
 * prononcée mais oubliée fait revenir l'élève en classe, et l'établissement
 * perd sa parole devant les familles. C'est la première chose qu'un
 * surveillant général doit pouvoir sortir.
 */
export function FiltresDiscipline({
  classes,
}: {
  classes: Array<{ id: string; libelle: string }>;
}) {
  const routeur = useRouter();
  const params = useSearchParams();

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/discipline?${p.toString()}`);
  }

  const actifs = ["classe", "gravite", "sanction", "attente"].filter((c) => params.get(c));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        <Label htmlFor="f-classe">Classe</Label>
        <NativeSelect
          id="f-classe"
          className="w-44"
          value={params.get("classe") ?? ""}
          onChange={(e) => naviguer("classe", e.target.value)}
        >
          <option value="">Toutes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="f-gravite">Gravité des incidents</Label>
        <NativeSelect
          id="f-gravite"
          className="w-44"
          value={params.get("gravite") ?? ""}
          onChange={(e) => naviguer("gravite", e.target.value)}
        >
          <option value="">Toutes</option>
          {GRAVITES.map((g) => (
            <option key={g.valeur} value={g.valeur}>
              {g.libelle}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="f-sanction">Type de sanction</Label>
        <NativeSelect
          id="f-sanction"
          className="w-52"
          value={params.get("sanction") ?? ""}
          onChange={(e) => naviguer("sanction", e.target.value)}
        >
          <option value="">Toutes</option>
          {SANCTIONS.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Button
        variant={params.get("attente") ? "default" : "outline"}
        onClick={() => naviguer("attente", params.get("attente") ? "" : "1")}
      >
        Sanctions à exécuter
      </Button>

      {actifs.length > 0 ? (
        <Button variant="ghost" onClick={() => routeur.push("/dashboard/discipline")}>
          <X aria-hidden />
          Effacer
        </Button>
      ) : null}
    </div>
  );
}
