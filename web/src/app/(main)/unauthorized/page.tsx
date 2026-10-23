import { LockKeyhole } from "lucide-react";

import { deconnexion } from "@/app/(main)/auth/actions";

export default function PageAccesRefuse() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-5 py-12">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border bg-muted">
          <LockKeyhole className="size-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Accès à l'administration refusé</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Votre compte n'est pas autorisé à utiliser cet espace.
          Les parents et les élèves accèdent à leurs services par l'application dédiée.
        </p>
        <form action={deconnexion}>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
