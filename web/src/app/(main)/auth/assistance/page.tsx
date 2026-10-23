import Link from "next/link";
import type { Metadata } from "next";

import { ArrowLeft, GraduationCap, KeyRound, ShieldCheck } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";

export const metadata: Metadata = {
  title: "Assistance à la connexion",
  description: "Aide à la récupération des accès du personnel.",
};

export default function PageAssistanceConnexion() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-6" aria-hidden />
          </div>
          <h1 className="font-semibold text-xl tracking-tight">{APP_CONFIG.nomComplet}</h1>
          <p className="text-muted-foreground text-sm">Assistance à la connexion</p>
        </div>

        <section aria-labelledby="assistance-titre" className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="size-5" aria-hidden />
            </div>
            <div>
              <h2 id="assistance-titre" className="font-semibold">Vous ne pouvez plus vous connecter ?</h2>
              <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                La récupération des comptes du personnel est assurée par l&apos;administration.
              </p>
            </div>
          </div>

          <ol className="list-inside list-decimal space-y-3 text-sm leading-relaxed">
            <li>Contactez le secrétariat ou un administrateur habilité du lycée.</li>
            <li>Présentez-vous pour permettre la vérification de votre identité.</li>
            <li>Recevez un nouveau mot de passe provisoire, transmis par un canal sûr.</li>
            <li>Connectez-vous et remplacez ce mot de passe dès votre premier accès.</li>
          </ol>

          <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Ne transmettez jamais votre mot de passe ni vos codes de connexion à un tiers.
              Après plusieurs essais incorrects, le compte peut être temporairement verrouillé.
            </p>
          </div>

          <Link
            href="/auth/connexion"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Retour à la connexion
          </Link>
        </section>

        <p className="text-center text-muted-foreground text-xs">{APP_CONFIG.copyright}</p>
      </div>
    </main>
  );
}
