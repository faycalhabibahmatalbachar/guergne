"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import Link from "next/link";

import { AlertCircle, ArrowRight, HelpCircle, LoaderCircle, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { connexion, type EtatConnexion } from "../actions";
import { ChampMotDePasse } from "./champ-mot-de-passe";

function BoutonSoumettre() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="h-11 w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Connexion en cours…
        </>
      ) : (
        <>
          Se connecter
          <ArrowRight className="size-4" aria-hidden />
        </>
      )}
    </Button>
  );
}

export function FormulaireConnexion() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(connexion, {});

  return (
    <form action={action} className="space-y-5" aria-label="Connexion du personnel">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="size-4 text-muted-foreground" aria-hidden />
          Accès à votre espace
        </div>
        <p className="text-muted-foreground text-xs">
          Utilisez l&apos;identifiant attribué par l&apos;établissement.
        </p>
      </div>

      {etat.erreur ? (
        <div
          id="erreur-connexion"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-destructive text-sm"
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
          className="h-11"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          required
          autoFocus
          aria-invalid={Boolean(etat.erreur)}
          aria-describedby={etat.erreur ? "erreur-connexion" : undefined}
          placeholder="E-mail ou numéro de téléphone"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="motDePasse">Mot de passe</Label>
          <Link
            href="/auth/assistance"
            className="text-primary text-xs font-medium underline-offset-4 hover:underline focus-visible:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
        <ChampMotDePasse
          id="motDePasse"
          name="motDePasse"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-invalid={Boolean(etat.erreur)}
          aria-describedby={etat.erreur ? "erreur-connexion" : undefined}
          placeholder="Saisissez votre mot de passe"
        />
      </div>

      <BoutonSoumettre />

      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-3">
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Vous n&apos;avez pas encore de compte ? Les accès sont créés uniquement par
          l&apos;administration. En cas de difficulté, contactez le secrétariat.
        </p>
      </div>
    </form>
  );
}
