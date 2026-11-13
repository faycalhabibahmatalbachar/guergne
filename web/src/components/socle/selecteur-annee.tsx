"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CalendarDays, ChevronDown } from "lucide-react";

export interface OptionAnneeScolaire {
  id: string;
  libelle: string;
  estCourante: boolean;
}

/**
 * Sélecteur partagé d'année scolaire.
 *
 * Le choix reste dans l'URL afin que les filtres soient partageables et que
 * les pages serveur chargent toujours les données de la bonne année.
 */
export function SelecteurAnnee({
  anneeId,
  annees,
  reinitialiser = [],
}: {
  anneeId: string;
  annees: OptionAnneeScolaire[];
  reinitialiser?: string[];
}) {
  const routeur = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams();

  function changer(identifiant: string) {
    const parametres = new URLSearchParams(recherche.toString());
    parametres.set("annee", identifiant);
    for (const cle of reinitialiser) parametres.delete(cle);
    parametres.delete("page");
    routeur.push(`${chemin}?${parametres.toString()}`, { scroll: false });
  }

  return (
    <label className="relative flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
      <CalendarDays className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">Année scolaire</span>
      <select
        aria-label="Année scolaire"
        value={anneeId}
        onChange={(e) => changer(e.target.value)}
        className="max-w-40 cursor-pointer appearance-none bg-transparent pr-5 font-medium outline-none"
      >
        {annees.map((annee) => (
          <option key={annee.id} value={annee.id}>
            {annee.libelle}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4" aria-hidden />
    </label>
  );
}
