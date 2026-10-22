import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, Info, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { chargerIdentiteLycee } from "@/server/domain/identite-lycee";
import { exigerPage } from "@/server/guard";

import { FormulaireIdentiteLycee } from "./formulaire";

export const metadata: Metadata = { title: "Identité officielle du lycée" };
export const dynamic = "force-dynamic";

export default async function PageIdentiteLycee() {
  await exigerPage("parametre:modifier");
  const identite = await chargerIdentiteLycee();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/parametres">
          <ArrowLeft className="size-4" aria-hidden />
          Tous les paramètres
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border bg-card">
          <Building2 className="size-6 text-primary" aria-hidden />
        </span>
        <div className="flex-1">
          <h1 className="font-semibold text-2xl tracking-tight">Identité officielle du lycée</h1>
          <p className="text-muted-foreground text-sm">
            Coordonnées, références administratives et signataires de l'unique établissement.
          </p>
        </div>
        <Badge variant="outline">Établissement unique</Badge>
      </div>

      {!identite ? (
        <Alert variant="destructive">
          <AlertTitle>Fiche non initialisée</AlertTitle>
          <AlertDescription>
            La ligne officielle du lycée est introuvable dans la base. Vérifiez les migrations
            et les données initiales avant toute modification.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identification institutionnelle</CardTitle>
              <CardDescription>
                Ces informations de marque sont conservées fixes tant que les en-têtes du tableau de bord
                et tous les modèles de documents ne consultent pas la même source.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div><p className="text-muted-foreground text-xs">Dénomination</p><p className="mt-1 font-medium text-sm">{identite.nom}</p></div>
              <div><p className="text-muted-foreground text-xs">Sigle</p><p className="mt-1 font-medium text-sm">{identite.sigle}</p></div>
              <div><p className="text-muted-foreground text-xs">Devise</p><p className="mt-1 font-medium text-sm">{identite.devise}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coordonnées et responsables</CardTitle>
              <CardDescription>
                Ces données proviennent de la fiche officielle PostgreSQL, et non d'un profil fictif.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormulaireIdentiteLycee key={identite.version} identite={identite} />
            </CardContent>
          </Card>

          <Alert>
            <Info className="size-4" aria-hidden />
            <AlertTitle>Modification contrôlée</AlertTitle>
            <AlertDescription>
              L'enregistrement refuse les données invalides et les changements concurrents.
              Les documents déjà émis ne sont pas modifiés rétroactivement. L'ajout d'un
              logo ou d'un cachet nécessite une procédure distincte de gestion de fichiers.
            </AlertDescription>
          </Alert>

          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <ShieldCheck className="size-4" aria-hidden />
            Les champs institutionnels restent réservés aux administrateurs autorisés.
          </p>
        </>
      )}
    </div>
  );
}
