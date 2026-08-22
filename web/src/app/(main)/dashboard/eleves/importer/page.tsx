import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../../_components/prerequis";
import { ImportEleves } from "./_components/import-eleves";

export const metadata: Metadata = { title: "Importer des élèves" };
export const dynamic = "force-dynamic";

export default async function PageImport() {
  await exigerPage("eleve:inscrire");

  const annee = await chargerAnneeCourante();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/eleves">
            <ArrowLeft aria-hidden />
            Retour
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Importer des élèves</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reprise d&apos;un fichier de rentrée. Les élèves sont inscrits pour l&apos;année
          courante, et leur tuteur principal est créé — ou réutilisé s&apos;il est déjà connu
          par son numéro.
        </p>
      </div>

      {annee ? (
        <ImportEleves />
      ) : (
        <Prerequis
          titre="Aucune année scolaire courante"
          explication="Une inscription se rattache toujours à une année. Ouvrez-en une avant d'importer."
          manquants={[
            { libelle: "Ouvrir une année scolaire", url: "/dashboard/parametres" },
            { libelle: "Créer les classes de l'année", url: "/dashboard/classes" },
          ]}
        />
      )}
    </div>
  );
}
