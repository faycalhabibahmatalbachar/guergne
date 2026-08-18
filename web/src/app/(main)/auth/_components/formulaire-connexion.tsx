"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { AlertCircle, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { connexion, type EtatConnexion } from "../actions";

function BoutonSoumettre() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden />
          Connexion…
        </>
      ) : (
        "Se connecter"
      )}
    </Button>
  );
}

export function FormulaireConnexion() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(connexion, {});

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
        <Label htmlFor="identifiant">Adresse e-mail ou téléphone</Label>
        <Input
          id="identifiant"
          name="identifiant"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          // Le clavier s'ouvre directement sur le champ : les agents du
          // secrétariat se connectent des dizaines de fois par jour.
          autoFocus
          placeholder="prenom.nom@lyceerenaissance.td"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="motDePasse">Mot de passe</Label>
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <BoutonSoumettre />

      <p className="text-center text-muted-foreground text-xs leading-relaxed">
        Les comptes sont créés par l&apos;administration de l&apos;établissement.
        <br />
        En cas d&apos;oubli de mot de passe, adressez-vous au secrétariat.
      </p>
    </form>
  );
}
