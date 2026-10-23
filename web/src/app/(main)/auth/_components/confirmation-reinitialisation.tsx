"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { LoaderCircle } from "lucide-react";

import { ChampMotDePasse } from "../_components/champ-mot-de-passe";
import { confirmerReinitialisation, type EtatReinitialisation } from "../reinitialisation/actions";

function BoutonConfirmation() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      Enregistrer le nouveau mot de passe
    </button>
  );
}

export function ConfirmationReinitialisation({ jeton }: { jeton: string }) {
  const [etat, action] = useActionState<EtatReinitialisation, FormData>(confirmerReinitialisation, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="jeton" value={jeton} />
      {etat.erreur ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{etat.erreur}</p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="nouveau-mdp" className="block text-sm font-semibold">Nouveau mot de passe</label>
        <ChampMotDePasse
          id="nouveau-mdp"
          name="nouveau"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          className="h-12"
        />
        <p className="text-xs text-neutral-500">10 caractères minimum, sans mot de passe uniquement numérique.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="confirmer-mdp" className="block text-sm font-semibold">Confirmer le mot de passe</label>
        <ChampMotDePasse
          id="confirmer-mdp"
          name="confirmation"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          className="h-12"
        />
      </div>
      <BoutonConfirmation />
    </form>
  );
}
