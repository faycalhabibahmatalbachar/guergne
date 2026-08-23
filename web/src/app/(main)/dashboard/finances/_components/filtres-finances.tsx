"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { FileSpreadsheet, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Filtres du suivi financier.
 *
 * « En retard » et « reste à payer » ne sont PAS la même chose, et les
 * confondre est l'erreur la plus coûteuse de ce module : un élève peut devoir
 * la totalité de sa scolarité sans être en retard, si l'échéance n'est pas
 * encore arrivée. C'est le retard qui justifie une relance — relancer un parent
 * à jour de ses versements le braque, et il ne lira plus les suivantes.
 *
 * Les deux filtres sont donc distincts, et libellés pour qu'on ne les prenne
 * pas l'un pour l'autre.
 */
export function FiltresFinances({
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
    // Changer de filtre referme la fiche ouverte : elle ne fait plus partie de
    // la liste affichée, et la garder à l'écran serait déroutant.
    p.delete("inscription");
    routeur.push(`/dashboard/finances?${p.toString()}`);
  }

  const actifs = ["classe", "q", "impayes", "retard", "boursier"].filter((c) => params.get(c));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        <Label htmlFor="f-recherche">Élève</Label>
        <div className="relative w-56">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
          />
          <Input
            id="f-recherche"
            className="pl-8"
            placeholder="Nom, prénom ou matricule"
            defaultValue={params.get("q") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") naviguer("q", e.currentTarget.value);
            }}
            onBlur={(e) => {
              if (e.currentTarget.value !== (params.get("q") ?? "")) {
                naviguer("q", e.currentTarget.value);
              }
            }}
          />
        </div>
      </div>

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
        <Label htmlFor="f-boursier">Bourse</Label>
        <NativeSelect
          id="f-boursier"
          className="w-40"
          value={params.get("boursier") ?? ""}
          onChange={(e) => naviguer("boursier", e.target.value)}
        >
          <option value="">Tous les élèves</option>
          <option value="oui">Boursiers</option>
          <option value="non">Non boursiers</option>
        </NativeSelect>
      </div>

      <Button
        variant={params.get("impayes") ? "default" : "outline"}
        onClick={() => naviguer("impayes", params.get("impayes") ? "" : "1")}
        title="Élèves dont il reste quelque chose à payer, échéance arrivée ou non"
      >
        Reste à payer
      </Button>

      <Button
        variant={params.get("retard") ? "destructive" : "outline"}
        onClick={() => naviguer("retard", params.get("retard") ? "" : "1")}
        title="Élèves dont au moins une échéance est dépassée — ceux qu'on relance"
      >
        Échéance dépassée
      </Button>

      {actifs.length > 0 ? (
        <Button variant="ghost" onClick={() => routeur.push("/dashboard/finances")}>
          <X aria-hidden />
          Effacer
        </Button>
      ) : null}

      {/*
        L'export comptable n'obéit PAS aux filtres de l'écran, et c'est
        délibéré : un comptable rapproche une caisse sur une période entière.
        Un export filtré par classe donnerait un total qui ne correspond à
        aucun relevé, et il faudrait deviner lequel des deux fait foi.
      */}
      <Button asChild variant="outline" className="ml-auto">
        <a href="/api/export/comptable">
          <FileSpreadsheet aria-hidden />
          Export comptable
        </a>
      </Button>
    </div>
  );
}
