import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import { Button } from "@/components/ui/button";
import { exigerPage } from "@/server/guard";

import { ImportEnseignants } from "./_components/import-enseignants";

export const metadata: Metadata = { title: "Importer des enseignants" };
export const dynamic = "force-dynamic";

export default async function PageImportPersonnel() {
  await exigerPage("utilisateur:creer");

  return (
    <Page>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/personnel">
            <ArrowLeft aria-hidden />
            Retour
          </Link>
        </Button>
      </div>

      <div>
        <EnTetePage titre="Importer des enseignants" />
        <p className="text-muted-foreground mt-1 text-sm">
          Reprise d&apos;un fichier de personnel. Le matricule vient du fichier — il figure déjà sur la fiche de paie de
          l&apos;enseignant, en inventer un créerait un second identifiant pour la même personne.
        </p>
      </div>

      <ImportEnseignants />
    </Page>
  );
}
