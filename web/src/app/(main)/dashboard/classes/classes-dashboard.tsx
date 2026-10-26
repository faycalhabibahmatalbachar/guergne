"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, BarChart3, BellRing, BookOpen, CalendarDays, Check, ChevronDown,
  Ellipsis, GraduationCap, Grid2X2, List, Mail, MoreHorizontal,
  Pencil, Plus, School, Search, SlidersHorizontal, Trash2, Users, ClipboardList,
  UserRound, X, Printer, Eye,
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
import { ElevesClassesTiroir } from "./eleves-tiroir";
import { urlImpressionClasses } from "./impression-url";

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
  peutImprimer: boolean;
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
          <Icon className="size-5" aria-hidden />
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

function ClasseCarte({ classe, index, peutModifier, peutVoirPersonnel, peutNotifier, peutImprimer, anneeId, ouvrir, selectionne, basculer, ouvrirEleves }: {
  classe: LigneClasseParametre;
  index: number;
  peutModifier: boolean;
  peutVoirPersonnel: boolean;
  peutNotifier: boolean;
  ouvrir: (c: LigneClasseParametre | null) => void;
  peutImprimer: boolean;
  anneeId: string;
  selectionne: boolean;
  basculer: (id: string) => void;
  ouvrirEleves: (ids: string[]) => void;
}) {
  const palette = PALETTE[index % PALETTE.length];
  const total = Number(classe.effectif);
  const capacite = Number(classe.capaciteMax);
  const taux = capacite > 0 ? Math.round(total / capacite * 100) : 0;
  const tauxLimite = Math.min(taux, 100);
  const plein = capacite > 0 && total >= capacite;

  return (
    <article className={"classes-class-card flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900 " + palette.border}>
      <div className={"flex items-center justify-between gap-2 border-b border-slate-100/70 px-3 py-2.5 dark:border-slate-800 " + palette.surface}>
        <div className="flex min-w-0 items-center gap-3">
          <input type="checkbox" aria-label={"Sélectionner " + classe.libelle} checked={selectionne} onChange={() => basculer(classe.id)} className="size-4 shrink-0 accent-blue-600" />
          <span className={"flex size-10 shrink-0 items-center justify-center rounded-lg text-white " + palette.icon}>
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold leading-5 text-slate-950 dark:text-white">{classe.libelle}</h3>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{classe.niveauLibelle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-18 truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{classe.code}</span>
          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (classe.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300")}>
            {classe.active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-2 pr-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10"><Users className="size-4" /></span>
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
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label={"Taux de remplissage de " + classe.libelle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={tauxLimite}>
          <div className={"h-full rounded-full transition-all " + palette.bar} style={{ width: tauxLimite + "%" }} />
        </div>
        {plein && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Capacité atteinte : inscriptions complètes.</p>}
        <div className="grid grid-cols-2 gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <Link href={`/dashboard/classes/${classe.id}?annee=${anneeId}`} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <Eye className="size-3.5" aria-hidden /> Détails
          </Link>
          <button type="button" onClick={() => ouvrirEleves([classe.id])} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs font-semibold hover:bg-blue-50 dark:border-slate-700">
            <Users className="size-3.5" aria-hidden /> Élèves
          </button>
          {peutImprimer && <a href={urlImpressionClasses(anneeId, [classe.id])} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <Printer className="size-3.5" aria-hidden /> Imprimer
          </a>}
          {peutModifier && <button type="button" onClick={() => ouvrir(classe)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs font-semibold hover:bg-blue-50 dark:border-slate-700">
            <Pencil className="size-3.5" aria-hidden /> Modifier
          </button>}
          {peutNotifier && <div className="col-span-2 mt-0.5">
            {classe.active && total > 0
              ? <BoutonNotifier cible={{ type: "classe", id: classe.id, nom: classe.libelle }} variante="outline" contexteClasses />
              : <button type="button" disabled aria-disabled="true" title="Aucun responsable à prévenir pour cette classe"
                  className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                  <BellRing className="size-4" aria-hidden /> Aucun parent à prévenir
                </button>}
          </div>}
        </div>
      </div>
    </article>
  );
}

export function ClassesDashboard({ annee, annees, classes, niveaux, series, enseignants, peutCreer, peutModifier, peutVoirPersonnel, peutNotifier, peutImprimer }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modifierDemande = searchParams.get("modifier");
  const [recherche, setRecherche] = useState("");
  const [niveau, setNiveau] = useState("tous");
  const [statut, setStatut] = useState("tous");
  const [vue, setVue] = useState<"grille" | "liste">("liste");
  const [selection, setSelection] = useState<string[]>([]);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const [tiroirInitial, setTiroirInitial] = useState<string[]>([]);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const actives = classes.filter((c) => c.active);
  const total = actives.reduce((s, c) => s + Number(c.effectif), 0);
  const moyenne = actives.length ? (total / actives.length).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0";
  const placesDisponibles = actives.reduce((s, c) => s + Math.max(0, Number(c.capaciteMax) - Number(c.effectif)), 0);
  const niveauxPresents = niveaux.filter((n) => classes.some((c) => c.niveauId === n.id));
  const visible = useMemo(() => classes.filter((c) => {
    if (niveau !== "tous" && c.niveauId !== niveau) return false;
    if (statut === "actives" && !c.active) return false;
    if (statut === "inactives" && c.active) return false;
    const rechercheNormale = recherche.trim().toLocaleLowerCase("fr");
    return !rechercheNormale || [c.libelle, c.code, c.niveauLibelle].some((v) => v.toLocaleLowerCase("fr").includes(rechercheNormale));
  }), [classes, recherche, niveau, statut]);

  const peutEditerCetteAnnee = annee.estCourante && !annee.estCloturee;
  // Un bouton Modifier de la fiche de classe ouvre directement le formulaire
  // existant, sans dupliquer sa logique ni changer ses contrôles serveur.
  useEffect(() => {
    if (!modifierDemande || !peutModifier || !peutEditerCetteAnnee) return;
    const cible = classes.find(c => c.id === modifierDemande);
    if (!cible) return;
    setErreurs({});
    setForm({
      id: cible.id, niveauId: cible.niveauId, serieId: cible.serieId ?? "",
      libelle: cible.libelle, code: cible.code, capaciteMax: String(cible.capaciteMax),
    });
  }, [modifierDemande, peutModifier, peutEditerCetteAnnee, classes]);
  function fermerFormulaire() {
    setForm(null);
    if (modifierDemande) router.replace("/dashboard/classes?annee=" + encodeURIComponent(annee.id), { scroll: false });
  }
  function basculerSelection(id: string) { setSelection(l => l.includes(id) ? l.filter(v => v !== id) : [...l, id]); }
  function ouvrirEleves(ids: string[]) { setTiroirInitial(ids); setTiroirOuvert(true); }
  const visiblesToutesSelectionnees = visible.length > 0 && visible.every(c => selection.includes(c.id));
  function exporterSelection() {
    const lignes = classes.filter(c => selection.includes(c.id));
    if (!lignes.length) return;
    const csv = ["Classe;Code;Niveau;Effectif;Capacité;Statut", ...lignes.map(c => [c.libelle, c.code, c.niveauLibelle, c.effectif, c.capaciteMax, c.active ? "Active" : "Inactive"].map(v => `"${String(v).replaceAll('"', '""')}"`).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "classes-" + annee.libelle + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
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
          fermerFormulaire();
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
        <Statistique icon={School} valeur={placesDisponibles} libelle="Places disponibles" note="Capacité libre dans les classes actives" couleur="bg-violet-500" />
        <Statistique icon={BarChart3} valeur={moyenne} libelle="Moyenne d’effectif" note="Par classe active" couleur="bg-orange-500" />
        {enseignants !== null && <div className="sm:col-span-2 xl:col-span-4"><p className="text-xs text-slate-500">Enseignants actifs accessibles : <strong className="text-slate-900 dark:text-white">{enseignants}</strong> · <Link href="/dashboard/personnel" className="font-semibold text-blue-700 hover:underline">Gestion du personnel</Link></p></div>}
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900">
        <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-700 dark:text-white"><input type="checkbox" aria-label="Sélectionner toutes les classes filtrées" className="size-4 accent-blue-600" checked={visiblesToutesSelectionnees} onChange={e => setSelection(l => e.target.checked ? [...new Set([...l, ...visible.map(c => c.id)])] : l.filter(id => !visible.some(c => c.id === id)))} />Sélectionner les {visible.length} classes affichées</label>
        <div className="flex flex-wrap items-center gap-2">
          {selection.length > 0 && <><span className="rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-700">{selection.length} sélectionnée(s)</span><Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setSelection([])}>Effacer</Button><Button type="button" variant="outline" size="sm" className="h-8" onClick={exporterSelection}>Exporter CSV</Button>{peutImprimer && <a href={urlImpressionClasses(annee.id, selection)} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <Printer className="size-3.5" aria-hidden />Imprimer les listes ({selection.length})
          </a>}<Button type="button" size="sm" className="h-8 bg-blue-600 text-white hover:bg-blue-700" onClick={() => ouvrirEleves(selection)}><Users className="size-3.5" />Élèves des classes choisies</Button></>}
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => ouvrirEleves([])}><School className="size-3.5" />Tous les élèves du lycée</Button>
        </div>
      </div>
      {visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900"><BookOpen className="mx-auto mb-3 size-9 text-slate-400" /><h2 className="text-lg font-semibold">Aucune classe trouvée</h2><p className="mt-1 text-sm text-slate-500">Ajustez les filtres ou la recherche pour afficher les classes.</p><Button variant="outline" className="mt-4" onClick={() => {setNiveau("tous");setStatut("tous");setRecherche("");}}>Effacer les filtres</Button></div> : vue === "grille" ? (
        <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((c) => <ClasseCarte key={c.id} classe={c} index={classes.findIndex((v) => v.id === c.id)} peutModifier={peutModifier && peutEditerCetteAnnee} peutVoirPersonnel={peutVoirPersonnel} peutNotifier={peutNotifier} peutImprimer={peutImprimer} anneeId={annee.id} ouvrir={ouvrir} selectionne={selection.includes(c.id)} basculer={basculerSelection} ouvrirEleves={ouvrirEleves} />)}
        </div>
      ) : (
        <ListeClasses
          classes={visible}
          toutesClasses={classes}
          selection={selection}
          basculerSelection={basculerSelection}
          ouvrirEleves={ouvrirEleves}
          peutModifier={peutModifier && peutEditerCetteAnnee}
          peutNotifier={peutNotifier}
          peutImprimer={peutImprimer}
          anneeId={annee.id}
          ouvrir={ouvrir}
        />
      )}
      <p className="text-right text-xs text-slate-500 dark:text-slate-400">{etiquette(visible.length, "classe affichée", "classes affichées")} sur {classes.length}</p>
      <ElevesClassesTiroir ouvert={tiroirOuvert} surFermeture={() => setTiroirOuvert(false)} anneeId={annee.id} anneeLibelle={annee.libelle} classes={classes} initiales={tiroirInitial} peutImprimer={peutImprimer} />

      <Dialog open={form !== null} onOpenChange={(open) => { if (!open && !enCours) fermerFormulaire(); }}>
        <DialogContent className="flex h-[min(92dvh,840px)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[min(850px,calc(100vw-2.5rem))] dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-white px-5 py-4 pr-14 dark:border-slate-800 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 sm:px-6">
            <div className="mb-1 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">{form?.id ? <Pencil className="size-5" /> : <Plus className="size-5" />}</span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Gestion des classes · {annee.libelle}</span>
            </div>
            <DialogTitle className="text-left text-lg font-bold tracking-tight text-slate-950 dark:text-white sm:text-xl">{form?.id ? "Modifier la classe" : "Ajouter une classe"}</DialogTitle>
            <DialogDescription className="pt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              {form?.id ? "Mettez à jour les informations sans affecter les élèves inscrits." : "Créez une nouvelle classe dans le registre scolaire de l’établissement."}
            </DialogDescription>
          </DialogHeader>
          {form && <form onSubmit={enregistrer} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"><GraduationCap className="size-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Structure pédagogique</h3></div>
                <div className="grid gap-3 min-[550px]:grid-cols-2">
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
            <DialogFooter className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
              <Button type="button" variant="outline" className="h-10 rounded-lg border-slate-200 px-4 dark:border-slate-700" disabled={enCours} onClick={() => setForm(null)}>Annuler</Button>
              <Button type="submit" className="h-10 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700" disabled={enCours}>{enCours ? "Enregistrement…" : <>{form.id ? <Check className="size-4" /> : <Plus className="size-4" />} {form.id ? "Enregistrer les modifications" : "Créer la classe"}</>}</Button>
            </DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
