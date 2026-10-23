"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ArrowRight, LoaderCircle, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import styles from "../connexion/connexion.module.css";
import { demanderReinitialisation, type EtatReinitialisation } from "../reinitialisation/actions";

function BoutonEnvoi() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-7 grid h-14 w-full grid-cols-[1fr_auto_1fr] items-center rounded-xl bg-neutral-950 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 disabled:opacity-60"
    >
      <span aria-hidden="true" />
      <span>{pending ? "Envoi en cours…" : "Envoyer le lien"}</span>
      {pending ? (
        <LoaderCircle className="size-5 animate-spin justify-self-end" aria-hidden="true" />
      ) : (
        <ArrowRight className="size-5 justify-self-end" aria-hidden="true" />
      )}
    </button>
  );
}

export function DemandeReinitialisation() {
  const [etat, action] = useActionState<EtatReinitialisation, FormData>(demanderReinitialisation, {});

  return (
    <form action={action} className={styles.recoveryForm}>
      {etat.erreur ? (
        <p role="alert" className={styles.loginError}>{etat.erreur}</p>
      ) : null}
      {etat.succes ? (
        <p role="status" className={styles.changeNotice}>
          Si cette adresse correspond à un compte actif, un lien a été envoyé.
          Vérifiez également votre dossier de courriers indésirables.
        </p>
      ) : (
        <>
          <div className={styles.formField}>
            <Label htmlFor="email-reinitialisation" className={styles.formLabel}>
              Adresse e-mail
            </Label>
            <div className={styles.iconInput}>
              <Mail className={styles.fieldIcon} size={19} aria-hidden="true" />
              <Input
                id="email-reinitialisation"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="prenom.nom@lyceerenaissance.td"
                className="h-14 rounded-xl border-neutral-200 bg-white pl-12 pr-4 text-base text-neutral-950 placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-neutral-200"
              />
            </div>
          </div>
          <BoutonEnvoi />
        </>
      )}
    </form>
  );
}
