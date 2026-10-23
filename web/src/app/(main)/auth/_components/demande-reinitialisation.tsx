"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { LoaderCircle, Mail } from "lucide-react";

import { demanderReinitialisation, type EtatReinitialisation } from "../reinitialisation/actions";

function BoutonEnvoi() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      Envoyer le lien de réinitialisation
    </button>
  );
}

export function DemandeReinitialisation() {
  const [etat, action] = useActionState<EtatReinitialisation, FormData>(demanderReinitialisation, {});
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{etat.erreur}</p>
      ) : null}
      {etat.succes ? (
        <p role="status" className="rounded-lg bg-neutral-100 p-4 text-sm leading-relaxed text-neutral-700">
          Si cette adresse correspond à un compte actif, un lien de réinitialisation a été envoyé.
          Consultez aussi le dossier des courriers indésirables.
        </p>
      ) : (
        <>
          <label htmlFor="email-reinitialisation" className="block text-sm font-semibold">
            Adresse e-mail professionnelle
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-3.5 size-5 text-neutral-400" aria-hidden />
            <input
              id="email-reinitialisation"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="prenom.nom@lyceerenaissance.td"
              className="h-12 w-full rounded-xl border border-neutral-200 bg-white pl-12 pr-4 text-sm text-neutral-950 outline-none focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-200"
            />
          </div>
          <BoutonEnvoi />
        </>
      )}
    </form>
  );
}
