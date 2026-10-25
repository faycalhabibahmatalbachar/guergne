"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListFilter, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIBELLES_STATUT } from "@/lib/eleves-constantes";

const TOUS = "__tous__";
type Classe = { id: string; libelle: string; niveauId: string; niveauLibelle: string };
type Annee = { id: string; libelle: string; estCourante: boolean };
type Valeurs = { q: string; classe: string; niveau: string; statut: string; dossier: string; annee: string; rapide: string };
type Statistiques = { total: number; inscrits: number; suspendus: number; incomplets: number; redoublants: number };

export function FiltresEleves({ classes, annees, valeurs, statistiques }: {
  classes: Classe[];
  annees: Annee[];
  valeurs: Valeurs;
  statistiques: Statistiques;
}) {
  const router = useRouter();
  const parametres = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [recherche, setRecherche] = useState(valeurs.q);
  const [etendus, setEtendus] = useState(true);

  const niveaux = useMemo(
    () => [...new Map(classes.map((c) => [c.niveauId, { id: c.niveauId, libelle: c.niveauLibelle }])).values()],
    [classes],
  );

  function appliquer(modifs: Record<string, string | undefined>) {
    const params = new URLSearchParams(parametres.toString());
    for (const [cle, valeur] of Object.entries(modifs)) {
      if (!valeur || valeur === TOUS) params.delete(cle);
      else params.set(cle, valeur);
    }
    params.delete("page");
    demarrer(() => router.push(`/dashboard/eleves?${params.toString()}`));
  }

  useEffect(() => {
    if (recherche === valeurs.q) return;
    const minuteur = setTimeout(() => appliquer({ q: recherche }), 350);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  const filtreActif = Boolean(valeurs.q || valeurs.classe || valeurs.niveau || valeurs.statut || valeurs.dossier || valeurs.annee || valeurs.rapide);
  const raccourcis = [
    { id: "", label: "Tous", count: statistiques.total, dot: "" },
    { id: "inscrits", label: "Inscrits", count: statistiques.inscrits, dot: "bg-emerald-500" },
    { id: "suspendus", label: "Suspendus", count: statistiques.suspendus, dot: "bg-red-500" },
    { id: "incomplets", label: "Dossiers incomplets", count: statistiques.incomplets, dot: "bg-amber-500" },
    { id: "redoublants", label: "Redoublants", count: statistiques.redoublants, dot: "bg-violet-600" },
  ];

  return (
    <section aria-label="Rechercher et filtrer les élèves" className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm dark:border-border dark:bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {raccourcis.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => appliquer({ rapide: r.id })}
              aria-pressed={valeurs.rapide === r.id}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors ${valeurs.rapide === r.id ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700" : "bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}
            >
              {r.dot ? <span aria-hidden className={`size-2.5 rounded-full ${r.dot}`} /> : null}
              {r.label} <span className="tabular-nums opacity-80">({r.count})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEtendus(!etendus)} aria-expanded={etendus}>
            <SlidersHorizontal className="size-4" aria-hidden /> Filtres avancés <ChevronDown className={`size-3 transition-transform ${etendus ? "rotate-180" : ""}`} aria-hidden />
          </Button>
          {filtreActif ? <Button variant="ghost" size="sm" onClick={() => { setRecherche(""); demarrer(() => router.push("/dashboard/eleves")); }}><X className="size-4" aria-hidden /> Effacer</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2.1fr)_repeat(5,minmax(120px,1fr))] dark:border-border">
        <div className="relative sm:col-span-2 lg:col-span-1">
          {enCours ? <LoaderCircle className="absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-slate-500" aria-hidden /> : <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />}
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un élève…" aria-label="Rechercher par nom, prénom ou matricule" className="h-10 bg-slate-50/50 pl-10 dark:bg-background" />
        </div>
        <div className="lg:col-span-1">
          <Select value={valeurs.classe || TOUS} onValueChange={(v) => appliquer({ classe: v })}>
            <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
            <SelectContent><SelectItem value={TOUS}>Toutes les classes</SelectItem>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {etendus ? <>
          <div className="lg:col-span-1">
            <Select value={valeurs.niveau || TOUS} onValueChange={(v) => appliquer({ niveau: v, classe: "" })}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Niveaux" /></SelectTrigger>
              <SelectContent><SelectItem value={TOUS}>Tous les niveaux</SelectItem>{niveaux.map((n) => <SelectItem key={n.id} value={n.id}>{n.libelle}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-1">
            <Select value={valeurs.statut || TOUS} onValueChange={(v) => appliquer({ statut: v })}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
              <SelectContent><SelectItem value={TOUS}>Tous les statuts</SelectItem>{Object.entries(LIBELLES_STATUT).map(([cle, libelle]) => <SelectItem key={cle} value={cle}>{libelle}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-1">
            <Select value={valeurs.dossier || TOUS} onValueChange={(v) => appliquer({ dossier: v })}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="État du dossier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TOUS}>Tous les dossiers</SelectItem>
                <SelectItem value="VALIDE">Validé</SelectItem>
                <SelectItem value="INCOMPLET">Incomplet</SelectItem>
                <SelectItem value="A_VALIDER">À valider</SelectItem>
                <SelectItem value="BROUILLON">Brouillon</SelectItem>
                <SelectItem value="REFUSE">Refusé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-1">
            <Select value={valeurs.annee || TOUS} onValueChange={(v) => appliquer({ annee: v, classe: "", niveau: "" })}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Année scolaire" /></SelectTrigger>
              <SelectContent><SelectItem value={TOUS}>Année courante</SelectItem>{annees.map((a) => <SelectItem key={a.id} value={a.id}>{a.libelle}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </> : <div className="flex items-center gap-2 text-xs text-slate-500 lg:col-span-6"><ListFilter className="size-4" aria-hidden /> Afficher les filtres par niveau, statut, dossier et année scolaire</div>}
      </div>
    </section>
  );
}

export function PaginationEleves({ page, nbPages, total, parPage }: {
  page: number; nbPages: number; total: number; parPage: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const nombrePages = Math.max(1, nbPages);
  const pageCourante = Math.min(Math.max(1, page), nombrePages);

  function aller(numero: number, taille = parPage) {
    if (numero < 1 || numero > nombrePages) return;
    const q = new URLSearchParams(params.toString());
    q.set("page", String(numero));
    q.set("parPage", String(taille));
    router.push(`/dashboard/eleves?${q.toString()}`);
  }

  const debut = total === 0 ? 0 : (pageCourante - 1) * parPage + 1;
  const fin = Math.min(pageCourante * parPage, total);
  const pages = [...new Set([1, Math.max(1, pageCourante - 1), pageCourante, Math.min(nombrePages, pageCourante + 1), nombrePages])]
    .filter((numero) => numero >= 1 && numero <= nombrePages);

  return (
    <footer aria-label="Pied du tableau des élèves" className="border-t border-slate-200/80 bg-slate-50/60 px-4 py-3.5 text-sm dark:border-border dark:bg-muted/15 sm:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="whitespace-nowrap text-slate-600 dark:text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-slate-900 tabular-nums dark:text-foreground">{debut}–{fin}</span> sur <span className="font-semibold text-slate-900 tabular-nums dark:text-foreground">{total.toLocaleString("fr-FR")}</span> élèves
          </p>
          <span aria-hidden className="hidden h-5 w-px bg-slate-200 dark:bg-border sm:block" />
          <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-600 dark:text-muted-foreground">
            Par page
            <select
              aria-label="Nombre d'élèves par page"
              className="h-9 min-w-16 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-border dark:bg-background dark:text-foreground"
              value={parPage}
              onChange={(e) => aller(1, Number(e.target.value))}
            >
              {[8, 16, 25, 50, 100].map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
            </select>
          </label>
        </div>

        <nav aria-label="Pagination des élèves" className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs font-medium text-slate-600 tabular-nums dark:text-muted-foreground sm:hidden">Page {pageCourante} sur {nombrePages}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="hidden size-9 bg-white shadow-none sm:inline-flex dark:bg-card" disabled={pageCourante <= 1} onClick={() => aller(1)} aria-label="Première page"><ChevronsLeft className="size-4" aria-hidden /></Button>
            <Button variant="outline" size="icon" className="size-9 bg-white shadow-none dark:bg-card" disabled={pageCourante <= 1} onClick={() => aller(pageCourante - 1)} aria-label="Page précédente"><ChevronLeft className="size-4" aria-hidden /></Button>

            <div className="hidden items-center gap-1 sm:flex">
              {pages.map((numero, index) => (
                <span key={numero} className="flex items-center gap-1">
                  {index > 0 && numero - pages[index - 1] > 1 ? <span className="px-1 text-slate-400" aria-hidden>…</span> : null}
                  <Button
                    size="icon"
                    variant={numero === pageCourante ? "default" : "outline"}
                    className={`size-9 font-semibold tabular-nums shadow-none ${numero === pageCourante ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-white dark:bg-card"}`}
                    aria-label={`Aller à la page ${numero}`}
                    aria-current={numero === pageCourante ? "page" : undefined}
                    onClick={() => aller(numero)}
                  >{numero}</Button>
                </span>
              ))}
            </div>

            <Button variant="outline" size="icon" className="size-9 bg-white shadow-none dark:bg-card" disabled={pageCourante >= nombrePages} onClick={() => aller(pageCourante + 1)} aria-label="Page suivante"><ChevronRight className="size-4" aria-hidden /></Button>
            <Button variant="outline" size="icon" className="hidden size-9 bg-white shadow-none sm:inline-flex dark:bg-card" disabled={pageCourante >= nombrePages} onClick={() => aller(nombrePages)} aria-label="Dernière page"><ChevronsRight className="size-4" aria-hidden /></Button>
          </div>
        </nav>
      </div>
    </footer>
  );
}
