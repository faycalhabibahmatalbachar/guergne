"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ArrowRight, CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";

import { Label } from "@/components/ui/label";

import styles from "../connexion/connexion.module.css";
import { ChampMotDePasse } from "./champ-mot-de-passe";
import { confirmerReinitialisation, type EtatReinitialisation } from "../reinitialisation/actions";

function BoutonConfirmation() {
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

export function ConfirmationReinitialisation({ jeton }: { jeton: string }) {
  const [etat, action] = useActionState<EtatReinitialisation, FormData>(confirmerReinitialisation, {});

  return (
    <form action={action} className={styles.recoveryForm}>
      <input type="hidden" name="jeton" value={jeton} />
      {etat.erreur ? (
        <div role="alert" className={styles.loginError}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{etat.erreur}</span>
        </div>
      ) : null}

      <div className={styles.formField}>
        <Label htmlFor="nouveau-mdp" className={styles.formLabel}>
          Nouveau mot de passe
        </Label>
        <div className={styles.iconInput}>
          <KeyRound className={styles.fieldIcon} size={19} aria-hidden />
          <ChampMotDePasse
            id="nouveau-mdp"
            name="nouveau"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            aria-describedby="recommandation-mot-de-passe"
            className="h-14 rounded-xl border-neutral-200 bg-white pl-12 pr-12 text-base text-neutral-950 focus-visible:ring-neutral-200"
          />
        </div>
        <p id="recommandation-mot-de-passe" className="text-muted-foreground text-xs leading-relaxed">
          10 caractères minimum. Privilégiez une phrase secrète longue et unique.
        </p>
      </div>

      <div className="mt-6">
        <div className={styles.formField}>
          <Label htmlFor="confirmer-mdp" className={styles.formLabel}>
            Confirmer le mot de passe
          </Label>
          <div className={styles.iconInput}>
            <KeyRound className={styles.fieldIcon} size={19} aria-hidden />
            <ChampMotDePasse
              id="confirmer-mdp"
              name="confirmation"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              className="h-14 rounded-xl border-neutral-200 bg-white pl-12 pr-12 text-base text-neutral-950 focus-visible:ring-neutral-200"
            />
          </div>
        </div>
      </div>
      <BoutonConfirmation />
      <p className="mt-4 flex items-center justify-center gap-2 text-muted-foreground text-xs">
        <ShieldCheck className="size-4" aria-hidden />
        Vos anciennes sessions seront fermées automatiquement.
      </p>
    </form>
  );
}
