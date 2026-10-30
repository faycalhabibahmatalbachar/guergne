import Link from "next/link";

import { Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reglageBlocage } from "@/server/domain/caisse";
import { exigerPage } from "@/server/guard";

import { ReglageBulletinsImpayes } from "./reglage-bulletins";

export const metadata: Metadata = { title: "Règles financières du lycée" };
export const dynamic = "force-dynamic";

export default async function PageReglagesFinanciers() {
  await exigerPage("finance:configurer");
  const reglage = await reglageBlocage();

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div>
        <div className="flex items-center gap-2">
          <Wallet className="size-6 text-primary" aria-hidden />
          <EnTetePage titre="Règles financières" />
        </div>
        <p className="mt-2 text-muted-foreground text-sm">
          Décisions financières appliquées au processus de publication des bulletins du lycée.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulletins et impayés</CardTitle>
          <CardDescription>
            Ce réglage est partagé avec la page Bulletins. Toute modification y prend effet immédiatement et reste
            journalisée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReglageBulletinsImpayes reglage={reglage} />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard/finances">Ouvrir les finances</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/bulletins">Consulter les bulletins</Link>
        </Button>
      </div>
    </div>
  );
}
