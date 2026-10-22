import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, GitCompareArrows, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listerGroupesNumerosPartages } from "@/server/domain/doublons-parents";
import { exigerPage } from "@/server/guard";

export const metadata: Metadata = { title: "Examen des doublons — Parents" };
export const dynamic = "force-dynamic";

export default async function DoublonsParents({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  await exigerPage("tuteur:gerer");
  const params = await searchParams;
  const p = Number(params.page ?? 1);
  const page = Number.isSafeInteger(p) && p > 0 ? p : 1;
  const r = await listerGroupesNumerosPartages(page);
  const pages = Math.max(1, Math.ceil(r.total / r.parPage));

  return <main className="mx-auto max-w-[1470px] space-y-5 pb-9 text-[#12264b] dark:text-foreground">
    <Link href="/dashboard/parents/familles" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-700 hover:underline dark:text-muted-foreground"><ArrowLeft className="size-4" aria-hidden />Familles & fratries</Link>
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-border sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950"><GitCompareArrows className="size-6" aria-hidden /></span>
        <div><h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">Vérification des doublons</h1>
        <p className="text-sm text-slate-500 dark:text-muted-foreground">Examinez les fiches partageant un numéro, sans altérer les accès familiaux</p></div>
      </div>
      <span className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{r.total} groupe{r.total > 1 ? "s" : ""} à vérifier</span>
    </header>

    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <ShieldCheck className="mr-2 inline size-4" aria-hidden />
      Un numéro partagé peut appartenir à plusieurs personnes : ce n'est <strong>pas une preuve de doublon</strong>.
      L'examen classe seulement la suspicion. Aucun compte, enfant, responsable financier ou droit de retrait n'est transféré automatiquement.
    </section>

    {r.groupes.length ? <div className="grid items-stretch gap-4 lg:grid-cols-2">
      {r.groupes.map(g => <article key={g.numero} className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-4 dark:border-border dark:bg-muted/20">
          <div><p className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">Numéro en commun</p><p className="mt-1 text-[15px] font-bold tabular-nums">{g.numero}</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Users className="size-3.5" aria-hidden />{g.dossiers} fiches</span>
        </div>
        <div className="divide-y divide-slate-100 px-4 dark:divide-border">{g.responsables.map(t => <div key={t.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{t.prenom} {t.nom}</p><p className="text-xs text-slate-500 dark:text-muted-foreground">{t.nbEnfants} enfant{t.nbEnfants > 1 ? "s" : ""} rattaché{t.nbEnfants > 1 ? "s" : ""}</p></div>
          <Link href={"/dashboard/parents/" + t.id} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">Voir dossier <ArrowRight className="inline size-3" aria-hidden /></Link>
        </div>)}</div>
        <div className="border-t border-slate-100 p-3 text-right dark:border-border">
          <Button asChild className="h-9 rounded-xl bg-emerald-700 font-semibold text-white hover:bg-emerald-800">
            <Link href={"/dashboard/parents/familles/doublons/" + g.responsables[0].id}><GitCompareArrows className="size-4" aria-hidden />Comparer les fiches</Link>
          </Button>
        </div>
      </article>)}
    </div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-border dark:bg-card"><AlertTriangle className="mx-auto mb-2 size-8 text-slate-300" aria-hidden />Aucun numéro partagé n'est actuellement détecté.</div>}

    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-border dark:bg-card">
      <span>Page {page} / {pages} · {r.parPage} groupes par page</span>
      <nav aria-label="Pagination des numéros partagés" className="flex items-center gap-2">
        {page > 1 ? <Button size="sm" variant="outline" asChild><Link href={"?page=" + (page - 1)}><ChevronLeft className="size-4" aria-hidden />Précédent</Link></Button> : <Button size="sm" variant="outline" disabled><ChevronLeft className="size-4" aria-hidden />Précédent</Button>}
        {page < pages ? <Button size="sm" variant="outline" asChild><Link href={"?page=" + (page + 1)}>Suivant<ChevronRight className="size-4" aria-hidden /></Link></Button> : <Button size="sm" variant="outline" disabled>Suivant<ChevronRight className="size-4" aria-hidden /></Button>}
      </nav>
    </footer>
  </main>;
}
