import type { Metadata } from "next";
import { Download, House, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

import { listerTuteurs, statistiquesParents } from "@/server/domain/parents";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage, peut } from "@/server/guard";

import { Parents } from "./_components/parents";
import { CreerParent } from "./_components/creer-parent";

export const metadata: Metadata = { title: "Comptes parents" };
export const dynamic = "force-dynamic";

export default async function PageParents({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; etat?: string; classe?: string; page?: string; parPage?: string }>;
}) {
  const principal = await exigerPage("tuteur:gerer");
  const [peutInviter, peutNotifier] = await Promise.all([peut(principal, "tuteur:inviter"), peut(principal, "message:envoyer")]);

  const params = await searchParams;
  const annee = await chargerAnneeCourante();
  const parPage = [8, 16, 25, 50, 100].includes(Number(params.parPage)) ? Number(params.parPage) : 25;

  const filtres = {
    recherche: params.recherche ?? "",
    etat: params.etat ?? "",
    classeId: params.classe ?? "",
  };

  const [resultat, stats, referentiel] = await Promise.all([
    listerTuteurs({
      recherche: filtres.recherche,
      etat: filtres.etat,
      classeId: filtres.classeId,
      page: Number(params.page) || 1,
      parPage,
    }),
    statistiquesParents(),
    annee ? listerClassesEtMatieres(annee.id) : Promise.resolve({ classes: [], matieres: [] }),
  ]);

  return (
    <div className="space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <header aria-label="En-tête de la page Parents" className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-border xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">Parents & tuteurs</h1>
            <span className="inline-flex items-center rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 tabular-nums dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{stats.total.toLocaleString("fr-FR")} dossiers</span>
          </div>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-muted-foreground">Consultez les responsables, leurs enfants et l’accès à l’application parent.</p>
        </div>
        <div role="group" aria-label="Actions sur les comptes parents" className="flex flex-wrap items-center gap-2 sm:justify-end">
          {peutInviter && <Button asChild variant="outline" className="h-10 gap-2 border-slate-200 bg-white px-3.5 font-semibold shadow-none dark:border-border dark:bg-card">
            <a href="/dashboard/parents/invitations"><Send className="size-4" aria-hidden />Suivi des invitations</a>
          </Button>}
          <Button asChild variant="outline" className="h-10 gap-2 border-slate-200 bg-white px-3.5 font-semibold shadow-none dark:border-border dark:bg-card">
            <a href="/dashboard/parents/familles"><House className="size-4" aria-hidden />Familles & fratries</a>
          </Button>
          <Button asChild variant="outline" className="h-10 gap-2 border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 dark:bg-card dark:text-foreground">
            <a href="/api/export/parents" title="Export Excel de tous les responsables"><Download className="size-4" aria-hidden />Exporter Excel</a>
          </Button>
          <CreerParent />
        </div>
      </header>

      <Parents
        tuteurs={resultat.lignes}
        total={resultat.total}
        page={resultat.page}
        parPage={resultat.parPage}
        classes={referentiel.classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        stats={stats}
        peutInviter={peutInviter}
        peutNotifier={peutNotifier}
        filtres={filtres}
      />
    </div>
  );
}
