import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft } from "lucide-react";

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-5 dark:border-border">
        <div><h1 className="text-[29px] font-bold tracking-tight sm:text-[34px]">Importer des élèves</h1></div>
        <Button asChild variant="outline" className="h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 shadow-none dark:border-border dark:bg-card">
          <Link href="/dashboard/eleves"><ArrowLeft className="size-4" aria-hidden />Élèves</Link>
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
