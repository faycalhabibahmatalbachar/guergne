"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { AlertCircle, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changerMotDePasse, type EtatConnexion } from "../actions";

function BoutonSoumettre() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden />
          Enregistrement…
        </>
      ) : (
        "Enregistrer le nouveau mot de passe"
      )}
    </Button>
  );
}

export function FormulaireMotDePasse() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(changerMotDePasse, {});

  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-destructive text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{etat.erreur}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="actuel">Mot de passe actuel</Label>
        <Input id="actuel" name="actuel" type="password" autoComplete="current-password" required autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nouveau">Nouveau mot de passe</Label>
        <Input id="nouveau" name="nouveau" type="password" autoComplete="new-password" required minLength={10} />
        <p className="text-muted-foreground text-xs">
          Au moins 10 caractères. Une phrase courte est plus sûre et plus facile à retenir
          qu&apos;un mot compliqué.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmation">Confirmer le nouveau mot de passe</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>

      <BoutonSoumettre />

      <p className="text-center text-muted-foreground text-xs">
        Toutes vos autres sessions seront fermées.
      </p>
    </form>
  );
}
