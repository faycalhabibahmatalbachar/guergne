import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Baby, CheckCircle2, ChevronLeft, ChevronRight,
  CircleHelp, Search, ShieldCheck, Users, UserRoundCheck, House,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { listerFamilles, type VueFamilles } from "@/server/domain/familles";
import { exigerPage } from "@/server/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Familles & fratries — comptes parents" };

const vues: { value: VueFamilles; texte: string }[] = [
  { value: "plusieurs", texte: "Plusieurs enfants" },
  { value: "tous", texte: "Tous les responsables" },
  { value: "telephone", texte: "Numéros partagés" },
  { value: "sans_enfant", texte: "Sans enfant" },
];
const liens: Record<string, string> = {
  PERE: "Père", MERE: "Mère", TUTEUR: "Tuteur", ONCLE: "Oncle",
  TANTE: "Tante", GRAND_PARENT: "Grand-parent", FRERE_SOEUR: "Frère / sœur", AUTRE: "Autre",
};
function url(vue: VueFamilles, recherche: string, page: number) {
  const q = new URLSearchParams({ vue, page: String(page) });
  if (recherche) q.set("recherche", recherche);
  return "/dashboard/parents/familles?" + q.toString();
}

export default async function FamillesPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; recherche?: string; page?: string }>;
}) {
  await exigerPage("tuteur:gerer");
  const params = await searchParams;
  const vue: VueFamilles = vues.some(x => x.value === params.vue) ? params.vue as VueFamilles : "plusieurs";
  const recherche = (params.recherche ?? "").trim().slice(0, 100);
  const p = Number(params.page || 1);
  const page = Number.isSafeInteger(p) && p >= 1 ? p : 1;
  const resultat = await listerFamilles({ vue, recherche, page });
  const nbPages = Math.max(1, Math.ceil(resultat.total / resultat.parPage));

  return <main className="mx-auto max-w-[1600px] space-y-5 pb-8 text-[#142347] dark:text-foreground">
    <nav aria-label="Retour aux parents">
      <Link href="/dashboard/parents" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-700 hover:underline dark:text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden />Retour à la liste des parents
      </Link>
    </nav>
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-border sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><House className="size-6" aria-hidden /></span>
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">Familles & fratries</h1>
            <p className="text-[13px] text-slate-500 dark:text-muted-foreground">Enfants rattachés à chaque responsable · contrôle des liens familiaux</p>
          </div>
        </div>
      </div>
      <Button asChild variant="outline" className="h-10 rounded-xl border-slate-200 bg-white shadow-none dark:border-border dark:bg-card">
        <Link href="/dashboard/parents">Tous les comptes <ArrowRight className="ml-1 size-4" aria-hidden /></Link>
      </Button>
    </header>

    <section aria-label="Indicateurs du regroupement" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { titre: "Responsables", valeur: resultat.stats.responsables, icone: Users, ton: "text-blue-700 bg-blue-50 dark:bg-blue-950" },
        { titre: "Avec plusieurs enfants", valeur: resultat.stats.plusieursEnfants, icone: Baby, ton: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950" },
        { titre: "Numéros partagés", valeur: resultat.stats.numerosPartages, icone: AlertTriangle, ton: "text-amber-700 bg-amber-50 dark:bg-amber-950" },
        { titre: "Sans enfant", valeur: resultat.stats.sansEnfant, icone: CircleHelp, ton: "text-slate-700 bg-slate-100 dark:bg-muted" },
      ].map(k => <article key={k.titre} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-border dark:bg-card">
        <div><p className="text-xs text-slate-500 dark:text-muted-foreground">{k.titre}</p><p className="mt-1 text-3xl font-bold tabular-nums">{k.valeur.toLocaleString("fr-FR")}</p></div>
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${k.ton}`}><k.icone className="size-5" aria-hidden /></span>
      </article>)}
    </section>

    <section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[13px] leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      <ShieldCheck className="mr-2 inline size-4" aria-hidden />
      Un regroupement par responsable ne prouve pas un lien de fratrie biologique ou un foyer commun.
      Les liens de parenté et les autorisations doivent être vérifiés dans chaque dossier. Aucun regroupement ni numéro partagé n’entraîne de fusion automatique.
    </section>

    <section aria-label="Recherche et filtres des familles" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-border dark:bg-card">
      <form method="get" className="flex flex-wrap items-center gap-2.5">
        <input type="hidden" name="vue" value={vue} />
        <label className="relative min-w-[230px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <span className="sr-only">Rechercher un responsable</span>
          <input name="recherche" maxLength={100} defaultValue={recherche} placeholder="Nom, prénom, téléphone…" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-border dark:bg-card" />
        </label>
        <Button type="submit" className="h-10 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800">Rechercher</Button>
      </form>
      <nav aria-label="Catégories de regroupement" className="flex flex-wrap gap-2">
        {vues.map(v => <Link key={v.value} href={url(v.value, recherche, 1)} aria-current={vue === v.value ? "page" : undefined}
          className={`rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors ${vue === v.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-border dark:bg-card dark:text-muted-foreground"}`}>
          {v.texte}
        </Link>)}
      </nav>
    </section>

    <section aria-label="Liste des responsables et enfants" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-muted-foreground">
        <p><strong className="font-semibold text-slate-900 dark:text-foreground">{resultat.total.toLocaleString("fr-FR")}</strong> responsable{resultat.total > 1 ? "s" : ""} dans cette vue</p>
        <p>Page {page} sur {nbPages}</p>
      </div>
      {resultat.lignes.length ? <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {resultat.lignes.map(f => <article key={f.tuteurId} className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
          <header className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4 dark:border-border dark:bg-muted/15 sm:px-5">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[13px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{(f.prenom[0] ?? "") + (f.nom[0] ?? "")}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/dashboard/parents/${f.tuteurId}`} className="inline-flex max-w-full items-center gap-1.5 break-words text-[14px] font-bold text-slate-900 hover:text-emerald-700 hover:underline dark:text-foreground">{f.prenom} {f.nom}<ArrowRight className="size-3.5 shrink-0" aria-hidden /></Link>
              <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{f.telephone} · {f.nbEnfants} enfant{f.nbEnfants > 1 ? "s" : ""} rattaché{f.nbEnfants > 1 ? "s" : ""}</p>
            </div>
            {f.numeroPartage ? <span title="Numéro présent sur plusieurs fiches : examen manuel" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"><AlertTriangle className="size-3.5" aria-hidden />À vérifier</span> : null}
          </header>
          {f.enfants.length ? <div className="divide-y divide-slate-100 px-4 dark:divide-border sm:px-5">{f.enfants.map(enfant => <div key={enfant.eleveId} className="flex min-w-0 items-start gap-3 py-3">
            <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950"><UserRoundCheck className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <Link href={`/dashboard/eleves/${enfant.eleveId}`} className="inline-flex flex-wrap items-center gap-1 text-[13px] font-semibold text-slate-900 hover:text-blue-700 hover:underline dark:text-foreground">{enfant.prenom} {enfant.nom}<ArrowRight className="size-3" aria-hidden /></Link>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-muted-foreground">{enfant.matricule} · {enfant.classe || "Classe non renseignée"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-muted dark:text-foreground">{liens[enfant.lien] ?? enfant.lien}</span>
                {enfant.estPrincipal ? <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">Principal</span> : null}
                {enfant.estTuteurLegal ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Tuteur légal</span> : null}
                {enfant.estResponsableFinancier ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">Finances</span> : null}
                {enfant.estContactUrgence ? <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">Urgence</span> : null}
                {enfant.autoriseRetrait ? <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200">Retrait autorisé</span> : null}
              </div>
            </div>
          </div>)}</div> : <p className="px-5 py-7 text-sm text-slate-500 dark:text-muted-foreground">Aucun élève associé à ce responsable.</p>}
          <footer className="border-t border-slate-100 px-4 py-3 text-right dark:border-border sm:px-5"><Link href={`/dashboard/parents/${f.tuteurId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">Examiner la fiche <ArrowRight className="size-3.5" aria-hidden /></Link></footer>
        </article>)}
      </div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center text-sm text-slate-500 dark:border-border dark:bg-card"><CircleHelp className="mx-auto mb-3 size-8 text-slate-300" aria-hidden />Aucun dossier ne correspond à ces critères.</div>}
      <nav aria-label="Pagination des regroupements" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-border dark:bg-card">
        <span className="text-xs text-slate-500">Affichage par groupes de 12 responsables</span>
        <div className="flex items-center gap-2">
          {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={url(vue, recherche, page - 1)}><ChevronLeft className="size-4" aria-hidden />Précédent</Link></Button> : <Button variant="outline" size="sm" disabled><ChevronLeft className="size-4" aria-hidden />Précédent</Button>}
          {page < nbPages ? <Button asChild variant="outline" size="sm"><Link href={url(vue, recherche, page + 1)}>Suivant<ChevronRight className="size-4" aria-hidden /></Link></Button> : <Button variant="outline" size="sm" disabled>Suivant<ChevronRight className="size-4" aria-hidden /></Button>}
        </div>
      </nav>
    </section>
  </main>;
}
