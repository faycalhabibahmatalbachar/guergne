"use client";

import { useActionState } from "react";

import { CircleAlert, LoaderCircle, Mail, Send } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import styles from "../connexion/connexion.module.css";
import { demanderReinitialisation, type EtatReinitialisation } from "../reinitialisation/actions";

function BoutonEnvoi() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.recoverySubmit}>
      <span aria-hidden="true" />
      <span>{pending ? "Envoi en cours…" : "Envoyer le lien"}</span>
      {pending ? (
        <LoaderCircle className="size-5 animate-spin justify-self-end" aria-hidden="true" />
      ) : (
        <Send className="size-5 justify-self-end" aria-hidden="true" />
      )}
    </button>
  );
}

export function DemandeReinitialisation() {
  const [etat, action] = useActionState<EtatReinitialisation, FormData>(demanderReinitialisation, {});
  return (
    <form action={action} className={styles.recoveryForm}>
      {etat.erreur ? (
        <div role="alert" className={styles.loginError}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{etat.erreur}</span>
        </div>
      ) : null}
      {etat.succes ? (
        <p role="status" className={styles.changeNotice}>
          Si cette adresse correspond à un compte actif, un lien a été envoyé. Vérifiez également votre dossier de
          courriers indésirables.
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
                className="h-14 rounded-xl border-border bg-card pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-border"
              />
            </div>
          </div>
          <BoutonEnvoi />
        </>
      )}
    </form>
  );
}
