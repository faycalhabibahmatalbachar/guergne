import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GraduationCap } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";
import { sessionCourante } from "@/server/auth/session";

import { FormulaireConnexion } from "../_components/formulaire-connexion";

export const metadata: Metadata = {
  title: "Connexion",
  description: `Accès à l'administration du ${APP_CONFIG.nomComplet}.`,
};

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  // Déjà connecté : on ne réaffiche pas le formulaire.
  if (await sessionCourante()) redirect("/dashboard/default");

  const { change } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="font-semibold text-xl tracking-tight">{APP_CONFIG.nomComplet}</h1>
            <p className="mt-1 text-muted-foreground text-sm">Espace d&apos;administration</p>
          </div>
        </div>

        {change ? (
          <div
            role="status"
            className="rounded-md border border-emerald-600/30 bg-emerald-600/8 px-3 py-2.5 text-emerald-700 text-sm dark:text-emerald-400"
          >
            Mot de passe modifié. Reconnectez-vous avec le nouveau.
          </div>
        ) : null}

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <FormulaireConnexion />
        </div>

        <p className="text-center text-muted-foreground text-xs">{APP_CONFIG.copyright}</p>
      </div>
    </main>
  );
}
