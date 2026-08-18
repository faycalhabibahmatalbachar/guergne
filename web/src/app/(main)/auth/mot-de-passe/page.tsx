import type { Metadata } from "next";

import { KeyRound } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";
import { exigerSession } from "@/server/guard";

import { FormulaireMotDePasse } from "../_components/formulaire-mot-de-passe";

export const metadata: Metadata = { title: "Changer le mot de passe" };

export default async function PageMotDePasse() {
  const principal = await exigerSession();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="font-semibold text-xl tracking-tight">
              {principal.doitChangerMdp ? "Choisissez votre mot de passe" : "Changer de mot de passe"}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {principal.doitChangerMdp
                ? "Votre mot de passe provisoire doit être remplacé avant d'accéder à l'application."
                : `Connecté en tant que ${principal.prenom} ${principal.nom}.`}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <FormulaireMotDePasse />
        </div>

        <p className="text-center text-muted-foreground text-xs">{APP_CONFIG.copyright}</p>
      </div>
    </main>
  );
}
