import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../../_components/prerequis";
import { ImportEleves } from "./_components/import-eleves";
import "../../default/gentelella-tokens.css";
import "../../default/gentelella-layout.css";
import "../../default/gentelella-components.css";
import "../../default/gentelella-widgets.css";

export const metadata: Metadata = { title: "Importer des élèves" };
export const dynamic = "force-dynamic";

export default async function PageImport() {
  await exigerPage("eleve:inscrire");

  const annee = await chargerAnneeCourante();

  return (
    <div className="gentelella-v4 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <h1 className="tracking-tight">Importer des élèves</h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/eleves">
            <ArrowLeft className="size-4" aria-hidden />
            Élèves
          </Link>
        </Button>
      </header>

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
