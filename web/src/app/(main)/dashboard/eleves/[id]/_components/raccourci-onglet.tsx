"use client";

import type { ReactNode } from "react";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Active l'onglet Radix déjà monté, sans recharger la page ni perdre le dossier. */
export function RaccourciOnglet({
  onglet,
  children,
  className,
}: {
  onglet: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? "h-8 rounded-lg text-xs"}
      onClick={() => {
        const declencheur = document.getElementById("dossier-onglet-" + onglet);
        declencheur?.click();
        declencheur?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }}
    >
      {children}
    </Button>
  );
}

/** Impression de la fiche courante, sans ouvrir de formulaire fictif. */
export function ImprimerDossier() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Imprimer
    </Button>
  );
}
