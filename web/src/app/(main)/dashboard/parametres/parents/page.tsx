
import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dureeInvitationJours } from "@/server/domain/parametres";
import { exigerPage } from "@/server/guard";

import { FormulaireValidite } from "./formulaire";

export const metadata: Metadata = { title: "Paramètres des invitations parents" };
export const dynamic = "force-dynamic";

export default async function PageParametresParents() {
  await exigerPage("parametre:modifier");
  const jours = await dureeInvitationJours();

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/parametres">
          <ArrowLeft className="size-4" aria-hidden />
          Tous les paramètres
        </Link>
      </Button>

      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="size-6 text-primary" aria-hidden />
          <h1 className="font-semibold text-2xl tracking-tight">Invitations des parents</h1>
        </div>
        <p className="mt-2 text-muted-foreground text-sm">
          Paramètres des codes d'activation des comptes parents de La Renaissance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Durée de validité du code</CardTitle>
          <CardDescription>
            Après invitation, un parent dispose de ce délai pour activer son compte sur l'application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormulaireValidite joursActuels={jours} />
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-muted-foreground text-xs">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Cette règle s'applique uniquement aux codes créés après l'enregistrement.
              Les codes existants conservent leur date d'expiration et les anciens codes
              sont invalidés lors du renvoi d'une nouvelle invitation. Les codes ne sont jamais
              stockés en clair dans la base.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard/parents">Accéder aux comptes parents</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/parents/invitations">Suivre les invitations</Link>
        </Button>
      </div>
    </div>
  );
}
