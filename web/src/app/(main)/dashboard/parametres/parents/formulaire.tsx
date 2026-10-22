"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { reglerValiditeInvitations } from "./actions";

export function FormulaireValidite({ joursActuels }: { joursActuels: number }) {
  const router = useRouter();
  const [jours, setJours] = useState(String(joursActuels));
  const [enCours, demarrer] = useTransition();
  const validite = Number(jours);
  const valide = /^\d+$/.test(jours) && Number.isInteger(validite) && validite >= 1 && validite <= 30;

  function enregistrer() {
    if (!valide) return;
    demarrer(async () => {
      const resultat = await reglerValiditeInvitations(validite);
      toast[resultat.ok ? "success" : "error"](resultat.message);
      if (resultat.ok) router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        enregistrer();
      }}
    >
      <div className="grid max-w-xs flex-1 gap-2">
        <Label htmlFor="validite-invitation">Validité des nouveaux codes (jours)</Label>
        <Input
          id="validite-invitation"
          name="validite"
          type="number"
          min={1}
          max={30}
          step={1}
          value={jours}
          onChange={(evenement) => setJours(evenement.target.value)}
          aria-invalid={!valide}
          aria-describedby="validite-aide"
          disabled={enCours}
          required
        />
        <p id="validite-aide" className="text-muted-foreground text-xs">
          Entre 1 et 30 jours. La valeur initiale est 7 jours.
        </p>
      </div>
      <Button type="submit" disabled={!valide || enCours || validite === joursActuels}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
