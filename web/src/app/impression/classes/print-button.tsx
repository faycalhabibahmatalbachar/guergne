"use client";

import { Printer } from "lucide-react";

export function BoutonImprimerListe() {
  return <button type="button" className="bouton-imprimer" onClick={() => window.print()}>
    <Printer className="size-4" aria-hidden /> Imprimer / Enregistrer en PDF
  </button>;
}
