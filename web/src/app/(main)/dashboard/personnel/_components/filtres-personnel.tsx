"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const STATUTS = [
  "PERMANENT",
  "CONTRACTUEL",
  "VACATAIRE",
  "STAGIAIRE",
  "SUSPENDU",
  "RETRAITE",
  "DEMISSIONNAIRE",
];

/**
 * Filtres du personnel.
 *
 * L'état vit dans l'URL, jamais dans le composant : le censeur qui prépare les
 * emplois du temps ouvre « sous-chargés », clique sur un enseignant, revient —
 * et doit retrouver sa liste. Un état local la perdrait à chaque aller-retour,
 * et le filtre serait abandonné au bout de trois essais.
 *
 * « Service incomplet » mérite sa place à côté des autres : c'est la question
 * de chaque rentrée — qui n'a pas encore ses heures ? — et elle est invisible
 * à l'œil sur une liste de cinquante lignes.
 */
export function FiltresPersonnel({
  matieres,
}: {
  matieres: Array<{ id: string; libelle: string }>;
}) {
  const routeur = useRouter();
  const params = useSearchParams();

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/personnel?${p.toString()}`);
  }

  const actifs = ["q", "statut", "matiere", "activite", "souscharge"].filter((c) => params.get(c));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
        />
        <Input
          className="pl-8"
          placeholder="Nom, prénom, matricule ou spécialité"
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

      <NativeSelect
        aria-label="Statut"
        className="w-44"
        value={params.get("statut") ?? ""}
        onChange={(e) => naviguer("statut", e.target.value)}
      >
        <option value="">Tous les statuts</option>
        {STATUTS.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ")}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Matière"
        className="w-48"
        value={params.get("matiere") ?? ""}
        onChange={(e) => naviguer("matiere", e.target.value)}
      >
        <option value="">Toutes les matières</option>
        {matieres.map((m) => (
          <option key={m.id} value={m.id}>
            {m.libelle}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Activité"
        className="w-40"
        value={params.get("activite") ?? ""}
        onChange={(e) => naviguer("activite", e.target.value)}
      >
        <option value="">En activité et retirés</option>
        <option value="actif">En activité</option>
        <option value="inactif">Retirés</option>
      </NativeSelect>

      <Button
        variant={params.get("souscharge") ? "default" : "outline"}
        size="sm"
        onClick={() => naviguer("souscharge", params.get("souscharge") ? "" : "1")}
      >
        Service incomplet
      </Button>

      {actifs.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => routeur.push("/dashboard/personnel")}>
          <X aria-hidden />
          Effacer
        </Button>
      ) : null}
    </div>
  );
}
