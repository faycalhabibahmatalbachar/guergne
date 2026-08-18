"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { LoaderCircle, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIBELLES_STATUT } from "@/lib/eleves-constantes";

const TOUS = "__tous__";

interface Props {
  classes: Array<{ id: string; libelle: string }>;
  valeurs: { q: string; classe: string; statut: string };
}

export function FiltresEleves({ classes, valeurs }: Props) {
  const router = useRouter();
  const parametres = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [recherche, setRecherche] = useState(valeurs.q);

  function appliquer(modifs: Record<string, string | undefined>) {
    const params = new URLSearchParams(parametres.toString());

    for (const [cle, valeur] of Object.entries(modifs)) {
      if (!valeur || valeur === TOUS) params.delete(cle);
      else params.set(cle, valeur);
    }
    // Toute modification de filtre ramène en première page : rester page 4
    // d'un résultat qui n'en compte plus qu'une afficherait un tableau vide.
    params.delete("page");

    demarrer(() => router.push(`?${params.toString()}`));
  }

  /**
   * Recherche différée de 350 ms.
   *
   * Sans cela, chaque frappe déclencherait une requête serveur — inacceptable
   * sur les connexions lentes visées par ce projet.
   */
  useEffect(() => {
    if (recherche === valeurs.q) return;

    const minuteur = setTimeout(() => appliquer({ q: recherche }), 350);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  const filtreActif = Boolean(valeurs.q || valeurs.classe || valeurs.statut);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        {enCours ? (
          <LoaderCircle
            className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : (
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
        )}
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par nom, prénom ou matricule…"
          className="pl-8"
          aria-label="Rechercher un élève"
        />
      </div>

      <Select
        value={valeurs.classe || TOUS}
        onValueChange={(v) => appliquer({ classe: v })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Toutes les classes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOUS}>Toutes les classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.libelle}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={valeurs.statut || TOUS} onValueChange={(v) => appliquer({ statut: v })}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOUS}>Tous les statuts</SelectItem>
          {Object.entries(LIBELLES_STATUT).map(([cle, libelle]) => (
            <SelectItem key={cle} value={cle}>
              {libelle}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtreActif ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRecherche("");
            demarrer(() => router.push("?"));
          }}
        >
          <X aria-hidden />
          Effacer
        </Button>
      ) : null}
    </div>
  );
}
