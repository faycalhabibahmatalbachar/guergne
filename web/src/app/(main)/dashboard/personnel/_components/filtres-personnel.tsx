"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const STATUTS = [
  ["PERMANENT","Permanent"], ["CONTRACTUEL","Contractuel"], ["VACATAIRE","Vacataire"],
  ["STAGIAIRE","Stagiaire"], ["SUSPENDU","Suspendu"],
  ["RETRAITE","Retraité"], ["DEMISSIONNAIRE","Démissionnaire"],
] as const;

/**
 * Un seul système de filtres, partagé par la liste et les KPI.
 * Les critères sont conservés dans l'URL (retour depuis la fiche, partage).
 * La recherche est lancée au clic/Entrée, sans navigation à chaque frappe.
 */
export function FiltresPersonnel({ matieres }: { matieres: Array<{id:string;libelle:string}> }) {
  const routeur = useRouter();
  const params = useSearchParams();
  const [recherche, setRecherche] = useState(params.get("q") ?? "");
  const q = params.get("q") ?? "";

  useEffect(() => { setRecherche(q); }, [q]);

  function naviguer(modifications: Record<string,string>) {
    const p = new URLSearchParams(params.toString());
    for(const [key,valeur] of Object.entries(modifications)) {
      if(valeur) p.set(key,valeur);
      else p.delete(key);
    }
    const chaine = p.toString();
    routeur.push("/dashboard/personnel" + (chaine ? "?"+chaine : ""));
  }
  const nombreActifs = ["q","statut","matiere","activite","souscharge"].filter(c=>params.get(c)).length;

  return (
    <section aria-label="Filtres du personnel enseignant" className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-border dark:bg-card">
      <form onSubmit={e=>{e.preventDefault();naviguer({q:recherche.trim()});}} className="flex min-w-[220px] flex-[1_1_280px] items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input className="h-10 rounded-lg border-slate-200 bg-white pl-9 shadow-none dark:border-border dark:bg-background" placeholder="Nom, prénom, matricule, spécialité…" aria-label="Rechercher un enseignant" value={recherche} onChange={e=>setRecherche(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-10 shrink-0 border-slate-200 px-3 shadow-none dark:border-border">Chercher</Button>
      </form>

      <NativeSelect aria-label="Filtrer par statut" className="h-10 w-full rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-background sm:w-44" value={params.get("statut") ?? ""} onChange={e=>naviguer({statut:e.target.value})}>
        <option value="">Tous les statuts</option>
        {STATUTS.map(([valeur,libelle])=><option key={valeur} value={valeur}>{libelle}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filtrer par matière" className="h-10 w-full rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-background sm:w-48" value={params.get("matiere") ?? ""} onChange={e=>naviguer({matiere:e.target.value})}>
        <option value="">Toutes les matières</option>
        {matieres.map(m=><option key={m.id} value={m.id}>{m.libelle}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filtrer par activité" className="h-10 w-full rounded-lg border-slate-200 bg-white shadow-none dark:border-border dark:bg-background sm:w-36" value={params.get("activite") ?? ""} onChange={e=>naviguer({activite:e.target.value})}>
        <option value="">Tous les comptes</option>
        <option value="actif">En activité</option>
        <option value="inactif">Retirés</option>
      </NativeSelect>
      <Button type="button" size="sm" variant={params.get("souscharge")?"default":"outline"} aria-pressed={Boolean(params.get("souscharge"))}
        className={"h-10 gap-1.5 shadow-none " + (params.get("souscharge")?"bg-emerald-700 text-white hover:bg-emerald-800":"border-slate-200 dark:border-border")}
        onClick={()=>naviguer({souscharge:params.get("souscharge")?"":"1"})}>
        <Filter className="size-3.5" aria-hidden/>Service incomplet
      </Button>
      {nombreActifs ? <Button type="button" variant="ghost" size="sm" className="h-10 gap-1.5 text-slate-600 dark:text-muted-foreground"
        onClick={()=>{setRecherche("");routeur.push("/dashboard/personnel");}}>
        <X className="size-3.5" aria-hidden/>Effacer ({nombreActifs})
      </Button> : null}
    </section>
  );
}
