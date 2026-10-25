import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dureeInvitationJours } from "@/server/domain/parametres";
import { exigerPage } from "@/server/guard";

import { FormulaireValidite } from "./formulaire";

export const metadata: Metadata = { title: "Paramètres des invitations parents" };
export const dynamic = "force-dynamic";

export default async function PageParametresParents() {
  await exigerPage("parametre:modifier");
  const jours = await dureeInvitationJours();

  return (
    <div className="min-w-0 space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <header aria-label="En-tête des invitations parents" className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-border">
        <div className="min-w-0">
          <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">
            Invitations parents
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-muted-foreground">
            Définissez la durée de validité des codes d’activation des nouveaux comptes.
          </p>
        </div>
        <Button asChild variant="outline" className="h-10 w-full shrink-0 gap-2 border-slate-200 bg-white px-3.5 text-slate-700 shadow-none sm:w-auto dark:border-border dark:bg-card dark:text-foreground">
          <Link href="/dashboard/parametres?section=communication">
            <ArrowLeft className="size-4" aria-hidden /> Retour aux réglages
          </Link>
        </Button>
      </header>

      <section aria-labelledby="invitations-validite" className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-border">
          <h2 id="invitations-validite" className="text-base font-bold tracking-tight">
            Durée de validité des codes
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
            Après une invitation, chaque parent dispose de ce délai pour activer son compte.
          </p>
        </div>
        <div className="space-y-4 px-4 py-5 sm:px-5">
          <FormulaireValidite joursActuels={jours} />
          <p className="flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500 dark:border-border dark:text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Cette durée concerne uniquement les nouveaux codes. Les invitations déjà envoyées conservent leur date d’expiration.</span>
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" className="h-10 gap-2 border-slate-200 bg-white px-3.5 text-slate-700 shadow-none dark:border-border dark:bg-card dark:text-foreground">
          <Link href="/dashboard/parents">Comptes parents</Link>
        </Button>
        <Button asChild variant="outline" className="h-10 gap-2 border-slate-200 bg-white px-3.5 text-slate-700 shadow-none dark:border-border dark:bg-card dark:text-foreground">
          <Link href="/dashboard/parents/invitations">Suivi des invitations</Link>
        </Button>
      </div>
    </div>
  );
}
