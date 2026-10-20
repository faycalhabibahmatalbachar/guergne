"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ListFilter, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
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
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors ${valeurs.rapide === r.id ? "bg-emerald-800 text-white shadow-sm hover:bg-emerald-900" : "bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-muted dark:text-foreground"}`}
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
  function aller(p: number, taille = parPage) {
    const q = new URLSearchParams(params.toString());
    q.set("page", String(p));
    q.set("parPage", String(taille));
    router.push(`/dashboard/eleves?${q.toString()}`);
  }
  const debut = total === 0 ? 0 : (page - 1) * parPage + 1;
  const fin = Math.min(page * parPage, total);
  const pages = [...new Set([1, Math.max(1, page - 1), page, Math.min(nbPages, page + 1), nbPages])].filter((v) => v >= 1 && v <= nbPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 text-sm dark:border-border">
      <p className="text-slate-600 dark:text-muted-foreground">Affichage de {debut} à {fin} sur {total} élèves</p>
      <nav aria-label="Pagination des élèves" className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => aller(page - 1)} aria-label="Page précédente">‹</Button>
        {pages.map((p, i) => <span key={p} className="flex items-center gap-1">{i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-slate-500">…</span> : null}<Button size="sm" variant={p === page ? "default" : "outline"} className={p === page ? "bg-emerald-700 text-white hover:bg-emerald-800" : ""} aria-current={p === page ? "page" : undefined} onClick={() => aller(p)}>{p}</Button></span>)}
        <Button variant="outline" size="sm" disabled={page >= nbPages} onClick={() => aller(page + 1)} aria-label="Page suivante">›</Button>
      </nav>
      <label className="flex items-center gap-2 text-slate-600 dark:text-muted-foreground">Élèves par page
        <select aria-label="Élèves par page" className="h-9 rounded-md border border-input bg-background px-3 font-medium text-foreground" value={parPage} onChange={(e) => aller(1, Number(e.target.value))}>
          {[8, 16, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}
