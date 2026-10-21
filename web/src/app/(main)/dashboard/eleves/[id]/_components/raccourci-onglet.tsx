"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Active l'onglet Radix déjà monté, sans recharger la page ni perdre le dossier. */
export function RaccourciOnglet({
  onglet,
  enfants,
  className,
}: {
  onglet: string;
  enfants: ReactNode;
  className?: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm"
      className={className ?? "h-8 rounded-lg text-xs"}
      onClick={() => {
        const declencheur = document.getElementById("dossier-onglet-" + onglet);
        declencheur?.click();
        declencheur?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }}
    >
      {enfants}
    </Button>
  );
}
