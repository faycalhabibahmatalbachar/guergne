"use client";

import { useActionState } from "react";

import Link from "next/link";

import { AlertCircle, ArrowRight, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { connexion, type EtatConnexion } from "../actions";
import styles from "../connexion/connexion.module.css";
import { ChampMotDePasse } from "./champ-mot-de-passe";

function BoutonSoumettre() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="mt-7 grid h-14 w-full grid-cols-[1fr_auto_1fr] items-center bg-primary px-5 text-base font-semibold text-primary-foreground shadow-carte transition-colors hover:bg-primary/90 focus-visible:ring-ring disabled:opacity-60"
      size="lg"
    >
      <span aria-hidden="true" />
      <span>{pending ? "Connexion en cours…" : "Se connecter"}</span>
      {pending ? (
        <LoaderCircle className="size-5 animate-spin justify-self-end" aria-hidden="true" />
      ) : (
        <ArrowRight className="size-5 justify-self-end" aria-hidden="true" />
      )}
    </Button>
  );
}

export function FormulaireConnexion() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(connexion, {});
  return (
    <form action={action} className={styles.form} aria-label="Connexion du personnel">
      <header className={styles.formHeading}>
        <h2>Connexion</h2>
        <p>Accédez à votre espace d&apos;administration.</p>
      </header>

      {etat.erreur ? (
        <div id="erreur-connexion" role="alert" aria-live="assertive" className={styles.loginError}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{etat.erreur}</span>
        </div>
      ) : null}

      <div className={styles.formFields}>
        <div className={styles.formField}>
          <Label htmlFor="identifiant" className={styles.formLabel}>
            Adresse e-mail ou téléphone
          </Label>
          <div className={styles.iconInput}>
            <UserRound className={styles.fieldIcon} size={19} aria-hidden="true" />
            <Input
              id="identifiant"
              name="identifiant"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={254}
              required
              autoFocus
              aria-invalid={Boolean(etat.erreur)}
              aria-describedby={etat.erreur ? "erreur-connexion" : undefined}
              placeholder="prenom.nom@lyceerenaissance.td"
              className="h-14 rounded-xl border-border bg-card pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-border"
            />
          </div>
        </div>
        <div className={styles.formField}>
          <Label htmlFor="motDePasse" className={styles.formLabel}>
            Mot de passe
          </Label>
          <div className={styles.iconInput}>
            <LockKeyhole className={styles.fieldIcon} size={19} aria-hidden="true" />
            <ChampMotDePasse
              id="motDePasse"
              name="motDePasse"
              autoComplete="current-password"
              required
              maxLength={256}
              aria-invalid={Boolean(etat.erreur)}
              aria-describedby={etat.erreur ? "erreur-connexion" : undefined}
              className="h-14 rounded-xl border-border bg-card pl-12 pr-12 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-border"
            />
          </div>
          <div className={styles.recoveryRow}>
            <Link href="/auth/assistance" className={styles.recoveryLink}>
              Mot de passe oublié ?
            </Link>
          </div>
        </div>
      </div>

      <BoutonSoumettre />
    </form>
  );
}
