import Link from "next/link";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

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
    <div className="min-w-0 space-y-4 pb-6 text-foreground">
      <header
        aria-label="En-tête des invitations parents"
        className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="leading-tight tracking-tight">Invitations parents</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Définissez la durée de validité des codes d’activation des nouveaux comptes.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
          <Link href="/dashboard/parametres?section=communication">
            <ArrowLeft className="size-4" aria-hidden /> Retour aux réglages
          </Link>
        </Button>
      </header>

      <section
        aria-labelledby="invitations-validite"
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <h2 id="invitations-validite" className="text-base font-bold tracking-tight">
            Durée de validité des codes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Après une invitation, chaque parent dispose de ce délai pour activer son compte.
          </p>
        </div>
        <div className="space-y-4 px-4 py-5 sm:px-5">
          <FormulaireValidite joursActuels={jours} />
          <p className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Cette durée concerne uniquement les nouveaux codes. Les invitations déjà envoyées conservent leur date
              d’expiration.
            </span>
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/parents">Comptes parents</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/parents/invitations">Suivi des invitations</Link>
        </Button>
      </div>
    </div>
  );
}
