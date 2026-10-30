"use client";

import { useActionState } from "react";

import { ArrowRight, CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Label } from "@/components/ui/label";

import { changerMotDePasse, type EtatConnexion } from "../actions";
import styles from "../connexion/connexion.module.css";
import { ChampMotDePasse } from "./champ-mot-de-passe";

function BoutonSoumettre() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.recoverySubmit}>
      <span aria-hidden="true" />
      <span>{pending ? "Enregistrement…" : "Enregistrer le mot de passe"}</span>
      {pending ? (
        <LoaderCircle className="size-5 animate-spin justify-self-end" aria-hidden />
      ) : (
        <ArrowRight className="size-5 justify-self-end" aria-hidden />
      )}
    </button>
  );
}

function Champ({
  id,
  libelle,
  nom,
  completion,
  description,
}: {
  id: string;
  libelle: string;
  nom: string;
  completion: "current-password" | "new-password";
  description?: string;
}) {
  return (
    <div className={styles.formField}>
      <Label htmlFor={id} className={styles.formLabel}>
        {libelle}
      </Label>
      <div className={styles.iconInput}>
        <KeyRound className={styles.fieldIcon} size={19} aria-hidden />
        <ChampMotDePasse
          id={id}
          name={nom}
          autoComplete={completion}
          required
          minLength={completion === "new-password" ? 10 : undefined}
          maxLength={128}
          className="h-14 rounded-xl border-border bg-card pl-12 pr-12 text-base text-foreground focus-visible:ring-border"
        />
      </div>
      {description ? <p className="text-muted-foreground text-xs leading-relaxed">{description}</p> : null}
    </div>
  );
}

export function FormulaireMotDePasse() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(changerMotDePasse, {});
  return (
    <form action={action} className={styles.recoveryForm}>
      {etat.erreur ? (
        <div role="alert" className={styles.loginError}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{etat.erreur}</span>
        </div>
      ) : null}
      <div className="space-y-6">
        <Champ id="actuel" nom="actuel" libelle="Mot de passe actuel" completion="current-password" />
        <Champ
          id="nouveau"
          nom="nouveau"
          libelle="Nouveau mot de passe"
          completion="new-password"
          description="10 caractères minimum. Préférez une phrase secrète longue et unique."
        />
        <Champ id="confirmation" nom="confirmation" libelle="Confirmer le mot de passe" completion="new-password" />
      </div>
      <BoutonSoumettre />
      <p className="mt-4 flex items-center justify-center gap-2 text-muted-foreground text-xs">
        <ShieldCheck className="size-4" aria-hidden />
        Vos anciennes sessions seront fermées automatiquement.
      </p>
    </form>
  );
}
