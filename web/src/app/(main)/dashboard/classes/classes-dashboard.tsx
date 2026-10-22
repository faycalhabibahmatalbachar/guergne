"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, BookOpen, CalendarDays, Check, ChevronDown,
  Ellipsis, GraduationCap, Grid2X2, List, Mail, MoreHorizontal,
  Pencil, Plus, School, Search, SlidersHorizontal, Trash2, Users,
  UserRound, X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  LigneAnnee, LigneClasseParametre, LigneNiveau, LigneSerie,
} from "@/server/domain/parametres";
import { creerClasse, modifierClasse, supprimerClasse } from "../parametres/actions";
import { BoutonNotifier } from "../_components/bouton-notifier";
import { ListeClasses } from "./liste-classes";

type Props = {
  annee: LigneAnnee;
  annees: LigneAnnee[];
  classes: LigneClasseParametre[];
  niveaux: LigneNiveau[];
  series: LigneSerie[];
  enseignants: number | null;
  peutCreer: boolean;
  peutModifier: boolean;
  peutVoirPersonnel: boolean;
  peutNotifier: boolean;
};

const PALETTE = [
  { color: "blue", surface: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/30", icon: "bg-blue-600", bar: "bg-blue-600" },
  { color: "green", surface: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/30", icon: "bg-emerald-500", bar: "bg-emerald-500" },
  { color: "purple", surface: "bg-violet-50 dark:bg-violet-500/10", border: "border-violet-200 dark:border-violet-500/30", icon: "bg-violet-500", bar: "bg-violet-500" },
  { color: "red", surface: "bg-rose-50 dark:bg-rose-500/10", border: "border-rose-200 dark:border-rose-500/30", icon: "bg-rose-500", bar: "bg-rose-500" },
  { color: "amber", surface: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30", icon: "bg-amber-500", bar: "bg-amber-500" },
] as const;

type Formulaire = {
  id?: string;
  niveauId: string;
  serieId: string;
  libelle: string;
  code: string;
  capaciteMax: string;
};
const initial: Formulaire = { niveauId: "", serieId: "", libelle: "", code: "", capaciteMax: "55" };
const etiquette = (nombre: number, singulier: string, pluriel: string) =>
  nombre + " " + (nombre > 1 ? pluriel : singulier);

function Statistique({ icon: Icon, valeur, libelle, note, couleur }: {
  icon: typeof Users; valeur: string | number; libelle: string; note: string; couleur: string;
}) {
  return (
    <div className="classes-stat min-w-0 rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-4">
        <div className={"flex size-13 shrink-0 items-center justify-center rounded-xl text-white shadow-sm " + couleur}>
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none tracking-tight text-slate-950 dark:text-white">{valeur}</div>
          <div className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{libelle}</div>
          <div className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">{note}</div>
        </div>
      </div>
    </div>
  );
}

function ClasseCarte({ classe, index, peutModifier, peutVoirPersonnel, peutNotifier, ouvrir }: {
  classe: LigneClasseParametre;
  index: number;
  peutModifier: boolean;
  peutVoirPersonnel: boolean;
  peutNotifier: boolean;
  ouvrir: (c: LigneClasseParametre | null) => void;
}) {
  const palette = PALETTE[index % PALETTE.length];
  const total = Number(classe.effectif);
  const capacite = Number(classe.capaciteMax);
  const taux = capacite > 0 ? Math.round(total / capacite * 100) : 0;
  const tauxLimite = Math.min(taux, 100);
  const plein = capacite > 0 && total >= capacite;

  return (
    <article className={"classes-class-card flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900 " + palette.border}>
      <div className={"flex items-center justify-between gap-3 border-b border-slate-100/70 px-4 py-3.5 dark:border-slate-800 " + palette.surface}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={"flex size-12 shrink-0 items-center justify-center rounded-xl text-white " + palette.icon}>
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-bold leading-6 text-slate-950 dark:text-white">{classe.libelle}</h3>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{classe.niveauLibelle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-18 truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{classe.code}</span>
          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (classe.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300")}>
            {classe.active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-4 py-4">
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-2 pr-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10"><Users className="size-4" /></span>
            <div><strong className="block text-sm font-bold text-slate-950 dark:text-white">{total}</strong><span className="text-[11px] text-slate-500">Élèves</span></div>
          </div>
          <div className="flex items-center justify-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><School className="size-4" /></span>
            <div><strong className="block text-sm font-bold text-slate-950 dark:text-white">{capacite || "—"}</strong><span className="text-[11px] text-slate-500">Capacité</span></div>
          </div>
          <div className="flex items-center justify-end gap-2 pl-2">
            <span className={"flex size-8 items-center justify-center rounded-lg " + (plein ? "bg-rose-50 text-rose-600" : taux >= 90 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
              <BarChart3 className="size-4" />
            </span>
            <div><strong className="block text-sm font-bold text-slate-950 dark:text-white">{capacite ? taux + "%" : "—"}</strong><span className="text-[11px] text-slate-500">Taux</span></div>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label={"Taux de remplissage de " + classe.libelle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={tauxLimite}>
          <div className={"h-full rounded-full transition-all " + palette.bar} style={{ width: tauxLimite + "%" }} />
        </div>
        <div className="flex min-h-10 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"><UserRound className="size-4" /></span>
            <span className="leading-snug">Professeur principal<br/><strong className="font-medium text-slate-700 dark:text-slate-300">Non renseigné</strong></span>
          </div>
          {peutVoirPersonnel && (
            <Link href="/dashboard/personnel" title="Consulter les enseignants" aria-label={"Consulter les enseignants pour " + classe.libelle} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50 dark:border-slate-700"><ArrowRight className="size-4" /></Link>
          )}
        </div>
        {plein && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Capacité atteinte : inscriptions complètes.</p>}
        <div className="mt-auto space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2">
            <Link href={"/dashboard/eleves?classe=" + encodeURIComponent(classe.id)} className={"inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 " + (!peutModifier ? "col-span-2" : "")}>
              <Users className="size-4 shrink-0" /> Voir les élèves
            </Link>
            {peutModifier && (
              <button type="button" onClick={() => ouvrir(classe)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                <Pencil className="size-4 shrink-0" /> Modifier la classe
              </button>
            )}
          </div>
          {peutNotifier && classe.active && total > 0 ? (
            <BoutonNotifier cible={{ type: "classe", id: classe.id, nom: classe.libelle }} variante="outline" contexteClasses />
          ) : (
            <p className="flex h-9 items-center justify-center rounded-lg bg-slate-50 px-2 text-center text-xs text-slate-400 dark:bg-slate-800">
              {total === 0 ? "Aucun parent à prévenir pour le moment" : "Notifications indisponibles"}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function ClassesDashboard({ annee, annees, classes, niveaux, series, enseignants, peutCreer, peutModifier, peutVoirPersonnel, peutNotifier }: Props) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const [niveau, setNiveau] = useState("tous");
  const [statut, setStatut] = useState("tous");
  const [vue, setVue] = useState<"grille" | "liste">("grille");
  const [form, setForm] = useState<Formulaire | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const actives = classes.filter((c) => c.active);
  const total = actives.reduce((s, c) => s + Number(c.effectif), 0);
  const moyenne = actives.length ? (total / actives.length).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0";
  const niveauxPresents = niveaux.filter((n) => classes.some((c) => c.niveauId === n.id));
  const visible = useMemo(() => classes.filter((c) => {
    if (niveau !== "tous" && c.niveauId !== niveau) return false;
    if (statut === "actives" && !c.active) return false;
    if (statut === "inactives" && c.active) return false;
    const rechercheNormale = recherche.trim().toLocaleLowerCase("fr");
    return !rechercheNormale || [c.libelle, c.code, c.niveauLibelle].some((v) => v.toLocaleLowerCase("fr").includes(rechercheNormale));
  }), [classes, recherche, niveau, statut]);

  const peutEditerCetteAnnee = annee.estCourante && !annee.estCloturee;
  function ouvrir(c: LigneClasseParametre | null) {
    setErreurs({});
    setForm(c ? {
      id: c.id, niveauId: c.niveauId, serieId: c.serieId ?? "",
      libelle: c.libelle, code: c.code, capaciteMax: String(c.capaciteMax),
    } : { ...initial });
  }
  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form || !peutEditerCetteAnnee) return;
    const payload = {
      anneeId: annee.id, niveauId: form.niveauId, serieId: form.serieId || null,
      libelle: form.libelle, code: form.code, capaciteMax: form.capaciteMax,
    };
    demarrer(async () => {
      try {
        const res = form.id ? await modifierClasse(form.id, payload) : await creerClasse(payload);
        if (res.ok) {
          toast.success(form.id ? "Classe mise à jour." : "Classe créée.");
          setForm(null);
          router.refresh();
        } else {
          setErreurs(res.erreurs ?? {});
          toast.error(res.message ?? Object.values(res.erreurs ?? {})[0] ?? "Enregistrement impossible.");
        }
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
      }
    });
  }
  function supprimer(c: LigneClasseParametre) {
    if (!peutModifier || !peutEditerCetteAnnee || c.effectif > 0) return;
    if (!window.confirm("Supprimer définitivement la classe " + c.libelle + " ?")) return;
    demarrer(async () => {
      try {
        const res = await supprimerClasse(c.id);
        toast[res.ok ? "success" : "error"](res.ok ? "Classe supprimée." : (res.message ?? "Suppression impossible."));
        if (res.ok) router.refresh();
      } catch { toast.error("Suppression impossible."); }
    });
  }
  const niveauChoisi = niveaux.find((n) => n.id === form?.niveauId);

  return (
    <div className="classes-dashboard space-y-4 rounded-3xl text-slate-950 dark:text-white">
      <nav aria-label="Fil d’Ariane" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/dashboard/default" aria-label="Tableau de bord" className="hover:text-blue-600"><School className="size-4" /></Link>
        <span aria-hidden>/</span><span>Classes</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0d1d3a] dark:text-white">Classes</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gérez toutes les classes de l’établissement</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <CalendarDays className="size-4" aria-hidden />
            <span className="sr-only">Année scolaire</span>
            <select aria-label="Année scolaire" value={annee.id} onChange={(e) => router.push("/dashboard/classes?annee=" + encodeURIComponent(e.target.value))} className="max-w-40 cursor-pointer appearance-none bg-transparent pr-5 font-medium outline-none">
              {annees.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-4" aria-hidden />
          </label>
          {peutCreer && peutEditerCetteAnnee && <Button type="button" onClick={() => ouvrir(null)} className="h-11 rounded-xl bg-blue-600 px-4 font-semibold text-white shadow-sm hover:bg-blue-700"><Plus className="size-4" /> Ajouter une classe</Button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Statistique icon={Users} valeur={actives.length} libelle="Classes" note={"Année " + annee.libelle} couleur="bg-blue-600" />
        <Statistique icon={GraduationCap} valeur={total} libelle="Élèves" note="Inscriptions actives" couleur="bg-emerald-500" />
        <Statistique icon={Users} valeur={enseignants === null ? "—" : enseignants} libelle="Enseignants" note={enseignants === null ? "Accès non autorisé" : "Personnel actif"} couleur="bg-violet-500" />
        <Statistique icon={BarChart3} valeur={moyenne} libelle="Moyenne d’effectif" note="Par classe active" couleur="bg-orange-500" />
      </div>

      <div className="rounded-2xl border border-slate-200/75 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="classes-levels flex gap-2 overflow-x-auto pb-3" role="group" aria-label="Filtrer par niveau">
          <button type="button" onClick={() => setNiveau("tous")} aria-pressed={niveau === "tous"} className={"classes-filter-chip " + (niveau === "tous" ? "classes-filter-chip-active" : "")}>Toutes les classes <span>{classes.length}</span></button>
          {niveauxPresents.map((n) => <button key={n.id} type="button" onClick={() => setNiveau(n.id)} aria-pressed={niveau === n.id} className={"classes-filter-chip " + (niveau === n.id ? "classes-filter-chip-active" : "")}>{n.libelle}<span>{classes.filter((c) => c.niveauId === n.id).length}</span></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Rechercher une classe</span>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une classe..." className="min-w-0 w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white" />
            {recherche && <button onClick={() => setRecherche("")} type="button" aria-label="Effacer la recherche"><X className="size-4" /></button>}
          </label>
          <label className="classes-select"><span className="sr-only">Niveau</span><select value={niveau} onChange={(e) => setNiveau(e.target.value)}><option value="tous">Tous les niveaux</option>{niveauxPresents.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}</select><ChevronDown className="size-4" /></label>
          <label className="classes-select"><span className="sr-only">Statut</span><select value={statut} onChange={(e) => setStatut(e.target.value)}><option value="tous">Tous les statuts</option><option value="actives">Actives</option><option value="inactives">Inactives</option></select><ChevronDown className="size-4" /></label>
          <div className="ml-auto flex h-11 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" role="group" aria-label="Mode d’affichage">
            <button type="button" aria-label="Vue en grille" aria-pressed={vue === "grille"} onClick={() => setVue("grille")} className={"flex w-11 items-center justify-center " + (vue === "grille" ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-white")}><Grid2X2 className="size-4" /></button>
            <button type="button" aria-label="Vue en liste" aria-pressed={vue === "liste"} onClick={() => setVue("liste")} className={"flex w-11 items-center justify-center " + (vue === "liste" ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-white")}><List className="size-4" /></button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900"><BookOpen className="mx-auto mb-3 size-9 text-slate-400" /><h2 className="text-lg font-semibold">Aucune classe trouvée</h2><p className="mt-1 text-sm text-slate-500">Ajustez les filtres ou la recherche pour afficher les classes.</p><Button variant="outline" className="mt-4" onClick={() => {setNiveau("tous");setStatut("tous");setRecherche("");}}>Effacer les filtres</Button></div> : vue === "grille" ? (
        <div className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((c, i) => <ClasseCarte key={c.id} classe={c} index={classes.findIndex((v) => v.id === c.id)} peutModifier={peutModifier && peutEditerCetteAnnee} peutVoirPersonnel={peutVoirPersonnel} peutNotifier={peutNotifier} ouvrir={ouvrir} />)}
        </div>
      ) : (
        <ListeClasses
          classes={visible}
          peutModifier={peutModifier && peutEditerCetteAnnee}
          peutNotifier={peutNotifier}
          ouvrir={ouvrir}
        />
      )}
      <p className="text-right text-xs text-slate-500 dark:text-slate-400">{etiquette(visible.length, "classe affichée", "classes affichées")} sur {classes.length}</p>

      <Dialog open={form !== null} onOpenChange={(open) => { if (!open && !enCours) setForm(null); }}>
        <DialogContent className="max-h-[min(90dvh,780px)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[620px] dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-white px-6 py-6 pr-14 dark:border-slate-800 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">{form?.id ? <Pencil className="size-5" /> : <Plus className="size-5" />}</span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Gestion des classes · {annee.libelle}</span>
            </div>
            <DialogTitle className="text-left text-xl font-bold tracking-tight text-slate-950 dark:text-white">{form?.id ? "Modifier la classe" : "Ajouter une classe"}</DialogTitle>
            <DialogDescription className="pt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              {form?.id ? "Mettez à jour les informations sans affecter les élèves inscrits." : "Créez une nouvelle classe dans le registre scolaire de l’établissement."}
            </DialogDescription>
          </DialogHeader>
          {form && <form onSubmit={enregistrer} className="flex flex-col">
            <div className="space-y-6 px-6 py-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"><GraduationCap className="size-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Structure pédagogique</h3></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2"><Label htmlFor="classe-niveau" className="font-semibold text-slate-800 dark:text-slate-100">Niveau <span className="text-blue-600">*</span></Label><NativeSelect id="classe-niveau" className="h-11 w-full rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" value={form.niveauId} onChange={(e) => setForm({ ...form, niveauId: e.target.value, serieId: "" })} required><option value="">Sélectionner un niveau</option>{niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}</NativeSelect>{erreurs.niveauId && <p className="text-xs text-red-600">{erreurs.niveauId}</p>}</div>
                  <div className="grid gap-2"><Label htmlFor="classe-serie" className="font-semibold text-slate-800 dark:text-slate-100">Série <span className="font-normal text-slate-400">(si applicable)</span></Label><NativeSelect id="classe-serie" className="h-11 w-full rounded-xl border-slate-200 bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" value={niveauChoisi?.seriesApplicables ? form.serieId : ""} onChange={(e) => setForm({ ...form, serieId: e.target.value })} disabled={!niveauChoisi?.seriesApplicables}><option value="">{niveauChoisi?.seriesApplicables ? "Sans série" : "Non applicable"}</option>{series.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>)}</NativeSelect>{erreurs.serieId && <p className="text-xs text-red-600">{erreurs.serieId}</p>}</div>
                </div>
              </section>
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"><BookOpen className="size-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Identification de la classe</h3></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2"><Label htmlFor="classe-libelle" className="font-semibold text-slate-800 dark:text-slate-100">Nom de la classe <span className="text-blue-600">*</span></Label><Input id="classe-libelle" className="h-11 rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" required value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Ex. : 6ème A" />{erreurs.libelle && <p className="text-xs text-red-600">{erreurs.libelle}</p>}</div>
                  <div className="grid gap-2"><Label htmlFor="classe-code" className="font-semibold text-slate-800 dark:text-slate-100">Code <span className="text-blue-600">*</span></Label><Input id="classe-code" className="h-11 rounded-xl border-slate-200 bg-slate-50 font-mono uppercase dark:border-slate-700 dark:bg-slate-800" required maxLength={10} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Ex. : 6A" />{erreurs.code && <p className="text-xs text-red-600">{erreurs.code}</p>}</div>
                </div>
              </section>
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"><Users className="size-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Capacité d’accueil</h3></div>
                <div className="grid gap-2"><Label htmlFor="classe-capacite" className="font-semibold text-slate-800 dark:text-slate-100">Nombre maximal d’élèves <span className="text-blue-600">*</span></Label><Input id="classe-capacite" className="h-11 rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" type="number" min={1} max={200} required value={form.capaciteMax} onChange={(e) => setForm({ ...form, capaciteMax: e.target.value })} />{erreurs.capaciteMax && <p className="text-xs text-red-600">{erreurs.capaciteMax}</p>}</div>
                <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-3 text-xs leading-relaxed text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                  <School className="mt-0.5 size-4 shrink-0" /><span>Une classe ne peut pas accueillir plus d’élèves que sa capacité. La capacité ne peut pas être réduite sous l’effectif déjà inscrit.</span>
                </div>
              </section>
              {form.id && peutModifier && classes.find((c) => c.id === form.id)?.effectif === 0 && <button type="button" onClick={() => {const c = classes.find((v) => v.id === form.id);if (c) supprimer(c);}} disabled={enCours} className="inline-flex items-center gap-2 text-xs font-semibold text-red-600 hover:underline"><Trash2 className="size-4" /> Supprimer cette classe vide</button>}
            </div>
            <DialogFooter className="flex gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/80">
              <Button type="button" variant="outline" className="h-11 rounded-xl border-slate-200 px-5 dark:border-slate-700" disabled={enCours} onClick={() => setForm(null)}>Annuler</Button>
              <Button type="submit" className="h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700" disabled={enCours}>{enCours ? "Enregistrement…" : <>{form.id ? <Check className="size-4" /> : <Plus className="size-4" />} {form.id ? "Enregistrer les modifications" : "Créer la classe"}</>}</Button>
            </DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
