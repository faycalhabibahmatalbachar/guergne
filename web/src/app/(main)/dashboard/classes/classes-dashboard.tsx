"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Ellipsis,
  Eye,
  GraduationCap,
  Grid2X2,
  List,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  School,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EnTetePage } from "@/components/socle/en-tete-page";
import { RangeeStatistiques, Statistique } from "@/components/socle/statistique";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { LigneAnnee, LigneClasseParametre, LigneNiveau, LigneSerie } from "@/server/domain/parametres";

import { BoutonNotifier } from "../_components/bouton-notifier";
import { creerClasse, modifierClasse, supprimerClasse } from "../parametres/actions";
import { ElevesClassesTiroir } from "./eleves-tiroir";
import { urlImpressionClasses } from "./impression-url";
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
  peutImprimer: boolean;
};

const PALETTE = [
  { color: "blue", surface: "bg-info-doux", border: "border-info-trait", icon: "bg-primary", bar: "bg-primary" },
  { color: "green", surface: "bg-succes-doux", border: "border-succes-trait", icon: "bg-succes", bar: "bg-succes" },
  { color: "purple", surface: "bg-info-doux", border: "border-info-trait", icon: "bg-primary", bar: "bg-primary" },
  { color: "red", surface: "bg-danger-doux", border: "border-danger-trait", icon: "bg-danger", bar: "bg-danger" },
  { color: "amber", surface: "bg-alerte-doux", border: "border-alerte-trait", icon: "bg-alerte", bar: "bg-alerte" },
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

function ClasseCarte({
  classe,
  index,
  peutModifier,
  peutVoirPersonnel,
  peutNotifier,
  peutImprimer,
  anneeId,
  ouvrir,
  selectionne,
  basculer,
  ouvrirEleves,
}: {
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
  const taux = capacite > 0 ? Math.round((total / capacite) * 100) : 0;
  const tauxLimite = Math.min(taux, 100);
  const plein = capacite > 0 && total >= capacite;

  return (
    <article
      className={
        "classes-class-card flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md " +
        palette.border
      }
    >
      <div className={"flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 " + palette.surface}>
        <div className="flex min-w-0 items-center gap-3">
          <input
            type="checkbox"
            aria-label={"Sélectionner " + classe.libelle}
            checked={selectionne}
            onChange={() => basculer(classe.id)}
            className="size-4 shrink-0 accent-blue-600"
          />
          <span
            className={
              "flex size-10 shrink-0 items-center justify-center rounded-lg text-primary-foreground " + palette.icon
            }
          >
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold leading-5 text-foreground">{classe.libelle}</h3>
            <p className="truncate text-xs text-muted-foreground">{classe.niveauLibelle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-18 truncate rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
            {classe.code}
          </span>
          <span
            className={
              "rounded-full px-2.5 py-1 text-xs font-semibold " +
              (classe.active ? "bg-succes-doux text-succes" : "bg-muted text-muted-foreground")
            }
          >
            {classe.active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="flex items-center gap-2 pr-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-info-doux text-info">
              <Users className="size-4" />
            </span>
            <div>
              <strong className="block text-sm font-bold text-foreground">{total}</strong>
              <span className="text-xs text-muted-foreground">Élèves</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <School className="size-4" />
            </span>
            <div>
              <strong className="block text-sm font-bold text-foreground">{capacite || "—"}</strong>
              <span className="text-xs text-muted-foreground">Capacité</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pl-2">
            <span
              className={
                "flex size-8 items-center justify-center rounded-lg " +
                (plein
                  ? "bg-danger-doux text-danger"
                  : taux >= 90
                    ? "bg-alerte-doux text-alerte"
                    : "bg-succes-doux text-succes")
              }
            >
              <BarChart3 className="size-4" />
            </span>
            <div>
              <strong className="block text-sm font-bold text-foreground">{capacite ? taux + "%" : "—"}</strong>
              <span className="text-xs text-muted-foreground">Taux</span>
            </div>
          </div>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={"Taux de remplissage de " + classe.libelle}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={tauxLimite}
        >
          <div className={"h-full rounded-full transition-all " + palette.bar} style={{ width: tauxLimite + "%" }} />
        </div>
        {plein && <p className="text-xs font-medium text-alerte">Capacité atteinte : inscriptions complètes.</p>}
        <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-2.5">
          <Link
            href={`/dashboard/classes/${classe.id}?annee=${anneeId}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-info-trait bg-info-doux px-2 text-xs font-semibold text-info hover:bg-info-doux/90"
          >
            <Eye className="size-3.5" aria-hidden /> Détails
          </Link>
          <button
            type="button"
            onClick={() => ouvrirEleves([classe.id])}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold hover:bg-info-doux/90"
          >
            <Users className="size-3.5" aria-hidden /> Élèves
          </button>
          {peutImprimer && (
            <a
              href={urlImpressionClasses(anneeId, [classe.id])}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-info-trait bg-info-doux px-2 text-xs font-semibold text-info hover:bg-info-doux/90"
            >
              <Printer className="size-3.5" aria-hidden /> Imprimer
            </a>
          )}
          {peutModifier && (
            <button
              type="button"
              onClick={() => ouvrir(classe)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold hover:bg-info-doux/90"
            >
              <Pencil className="size-3.5" aria-hidden /> Modifier
            </button>
          )}
          {peutNotifier && (
            <div className="col-span-2 mt-0.5">
              {classe.active && total > 0 ? (
                <BoutonNotifier
                  cible={{ type: "classe", id: classe.id, nom: classe.libelle }}
                  variante="outline"
                  contexteClasses
                />
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Aucun responsable à prévenir pour cette classe"
                  className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground"
                >
                  <BellRing className="size-4" aria-hidden /> Aucun parent à prévenir
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function ClassesDashboard({
  annee,
  annees,
  classes,
  niveaux,
  series,
  enseignants,
  peutCreer,
  peutModifier,
  peutVoirPersonnel,
  peutNotifier,
  peutImprimer,
}: Props) {
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
  const moyenne = actives.length
    ? (total / actives.length).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : "0";
  const placesDisponibles = actives.reduce((s, c) => s + Math.max(0, Number(c.capaciteMax) - Number(c.effectif)), 0);
  const niveauxPresents = niveaux.filter((n) => classes.some((c) => c.niveauId === n.id));
  const visible = useMemo(
    () =>
      classes.filter((c) => {
        if (niveau !== "tous" && c.niveauId !== niveau) return false;
        if (statut === "actives" && !c.active) return false;
        if (statut === "inactives" && c.active) return false;
        const rechercheNormale = recherche.trim().toLocaleLowerCase("fr");
        return (
          !rechercheNormale ||
          [c.libelle, c.code, c.niveauLibelle].some((v) => v.toLocaleLowerCase("fr").includes(rechercheNormale))
        );
      }),
    [classes, recherche, niveau, statut],
  );

  const peutEditerCetteAnnee = annee.estCourante && !annee.estCloturee;
  // Un bouton Modifier de la fiche de classe ouvre directement le formulaire
  // existant, sans dupliquer sa logique ni changer ses contrôles serveur.
  useEffect(() => {
    if (!modifierDemande || !peutModifier || !peutEditerCetteAnnee) return;
    const cible = classes.find((c) => c.id === modifierDemande);
    if (!cible) return;
    setErreurs({});
    setForm({
      id: cible.id,
      niveauId: cible.niveauId,
      serieId: cible.serieId ?? "",
      libelle: cible.libelle,
      code: cible.code,
      capaciteMax: String(cible.capaciteMax),
    });
  }, [modifierDemande, peutModifier, peutEditerCetteAnnee, classes]);
  function fermerFormulaire() {
    setForm(null);
    if (modifierDemande) router.replace("/dashboard/classes?annee=" + encodeURIComponent(annee.id), { scroll: false });
  }
  function basculerSelection(id: string) {
    setSelection((l) => (l.includes(id) ? l.filter((v) => v !== id) : [...l, id]));
  }
  function ouvrirEleves(ids: string[]) {
    setTiroirInitial(ids);
    setTiroirOuvert(true);
  }
  const visiblesToutesSelectionnees = visible.length > 0 && visible.every((c) => selection.includes(c.id));
  function exporterSelection() {
    const lignes = classes.filter((c) => selection.includes(c.id));
    if (!lignes.length) return;
    const csv = [
      "Classe;Code;Niveau;Effectif;Capacité;Statut",
      ...lignes.map((c) =>
        [c.libelle, c.code, c.niveauLibelle, c.effectif, c.capaciteMax, c.active ? "Active" : "Inactive"]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(";"),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "classes-" + annee.libelle + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function ouvrir(c: LigneClasseParametre | null) {
    setErreurs({});
    setForm(
      c
        ? {
            id: c.id,
            niveauId: c.niveauId,
            serieId: c.serieId ?? "",
            libelle: c.libelle,
            code: c.code,
            capaciteMax: String(c.capaciteMax),
          }
        : { ...initial },
    );
  }
  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form || !peutEditerCetteAnnee) return;
    const payload = {
      anneeId: annee.id,
      niveauId: form.niveauId,
      serieId: form.serieId || null,
      libelle: form.libelle,
      code: form.code,
      capaciteMax: form.capaciteMax,
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
      } catch {
        toast.error("Suppression impossible.");
      }
    });
  }
  const niveauChoisi = niveaux.find((n) => n.id === form?.niveauId);

  return (
    <div className="classes-dashboard space-y-6 text-foreground">
      <EnTetePage
        titre="Classes"
        description="Gérez toutes les classes de l’établissement."
        actions={
          <>
            {/* Le sélecteur d’année reprend la hauteur et le rayon des autres
                contrôles : il mesurait 44 px quand les boutons voisins en font 36. */}
            <label className="relative flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-foreground text-sm">
              <CalendarDays className="size-4" aria-hidden />
              <span className="sr-only">Année scolaire</span>
              <select
                aria-label="Année scolaire"
                value={annee.id}
                onChange={(e) => router.push("/dashboard/classes?annee=" + encodeURIComponent(e.target.value))}
                className="max-w-40 cursor-pointer appearance-none bg-transparent pr-5 font-medium outline-none"
              >
                {annees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 size-4" aria-hidden />
            </label>
            {peutCreer && peutEditerCetteAnnee && (
              <Button type="button" onClick={() => ouvrir(null)}>
                <Plus aria-hidden /> Ajouter une classe
              </Button>
            )}
          </>
        }
      />
      <RangeeStatistiques colonnes={4}>
        <Statistique icone={Users} valeur={actives.length} libelle="Classes" aide={"Année " + annee.libelle} />
        <Statistique icone={GraduationCap} valeur={total} libelle="Élèves" aide="Inscriptions actives" />
        <Statistique
          icone={School}
          valeur={placesDisponibles}
          libelle="Places disponibles"
          aide="Capacité libre dans les classes actives"
        />
        <Statistique icone={BarChart3} valeur={moyenne} libelle="Moyenne d’effectif" aide="Par classe active" />
      </RangeeStatistiques>

      {enseignants !== null && (
        <p className="text-muted-foreground text-xs">
          Enseignants actifs accessibles : <strong className="text-foreground">{enseignants}</strong> ·{" "}
          <Link href="/dashboard/personnel" className="font-semibold text-info hover:underline">
            Gestion du personnel
          </Link>
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="classes-levels flex gap-2 overflow-x-auto pb-3" role="group" aria-label="Filtrer par niveau">
          <button
            type="button"
            onClick={() => setNiveau("tous")}
            aria-pressed={niveau === "tous"}
            className={"classes-filter-chip " + (niveau === "tous" ? "classes-filter-chip-active" : "")}
          >
            Toutes les classes <span>{classes.length}</span>
          </button>
          {niveauxPresents.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNiveau(n.id)}
              aria-pressed={niveau === n.id}
              className={"classes-filter-chip " + (niveau === n.id ? "classes-filter-chip-active" : "")}
            >
              {n.libelle}
              <span>{classes.filter((c) => c.niveauId === n.id).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 text-muted-foreground">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Rechercher une classe</span>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une classe..."
              className="min-w-0 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {recherche && (
              <button onClick={() => setRecherche("")} type="button" aria-label="Effacer la recherche">
                <X className="size-4" />
              </button>
            )}
          </label>
          <label className="classes-select">
            <span className="sr-only">Niveau</span>
            <select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
              <option value="tous">Tous les niveaux</option>
              {niveauxPresents.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.libelle}
                </option>
              ))}
            </select>
            <ChevronDown className="size-4" />
          </label>
          <label className="classes-select">
            <span className="sr-only">Statut</span>
            <select value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="tous">Tous les statuts</option>
              <option value="actives">Actives</option>
              <option value="inactives">Inactives</option>
            </select>
            <ChevronDown className="size-4" />
          </label>
          <div
            className="ml-auto flex h-11 overflow-hidden rounded-lg border border-border"
            role="group"
            aria-label="Mode d’affichage"
          >
            <button
              type="button"
              aria-label="Vue en grille"
              aria-pressed={vue === "grille"}
              onClick={() => setVue("grille")}
              className={
                "flex w-11 items-center justify-center " +
                (vue === "grille" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground")
              }
            >
              <Grid2X2 className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Vue en liste"
              aria-pressed={vue === "liste"}
              onClick={() => setVue("liste")}
              className={
                "flex w-11 items-center justify-center " +
                (vue === "liste" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground")
              }
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2 font-semibold text-foreground">
          <input
            type="checkbox"
            aria-label="Sélectionner toutes les classes filtrées"
            className="size-4 accent-blue-600"
            checked={visiblesToutesSelectionnees}
            onChange={(e) =>
              setSelection((l) =>
                e.target.checked
                  ? [...new Set([...l, ...visible.map((c) => c.id)])]
                  : l.filter((id) => !visible.some((c) => c.id === id)),
              )
            }
          />
          Sélectionner les {visible.length} classes affichées
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {selection.length > 0 && (
            <>
              <span className="rounded-full bg-info-doux px-2.5 py-1 font-bold text-info">
                {selection.length} sélectionnée(s)
              </span>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setSelection([])}>
                Effacer
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={exporterSelection}>
                Exporter CSV
              </Button>
              {peutImprimer && (
                <a
                  href={urlImpressionClasses(annee.id, selection)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-info-trait bg-info-doux px-3 font-semibold text-info hover:bg-info-doux/90"
                >
                  <Printer className="size-3.5" aria-hidden />
                  Imprimer les listes ({selection.length})
                </a>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => ouvrirEleves(selection)}
              >
                <Users className="size-3.5" />
                Élèves des classes choisies
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => ouvrirEleves([])}>
            <School className="size-3.5" />
            Tous les élèves du lycée
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <BookOpen className="mx-auto mb-3 size-9 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Aucune classe trouvée</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajustez les filtres ou la recherche pour afficher les classes.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setNiveau("tous");
              setStatut("tous");
              setRecherche("");
            }}
          >
            Effacer les filtres
          </Button>
        </div>
      ) : vue === "grille" ? (
        <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((c) => (
            <ClasseCarte
              key={c.id}
              classe={c}
              index={classes.findIndex((v) => v.id === c.id)}
              peutModifier={peutModifier && peutEditerCetteAnnee}
              peutVoirPersonnel={peutVoirPersonnel}
              peutNotifier={peutNotifier}
              peutImprimer={peutImprimer}
              anneeId={annee.id}
              ouvrir={ouvrir}
              selectionne={selection.includes(c.id)}
              basculer={basculerSelection}
              ouvrirEleves={ouvrirEleves}
            />
          ))}
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
      <p className="text-right text-xs text-muted-foreground">
        {etiquette(visible.length, "classe affichée", "classes affichées")} sur {classes.length}
      </p>
      <ElevesClassesTiroir
        ouvert={tiroirOuvert}
        surFermeture={() => setTiroirOuvert(false)}
        anneeId={annee.id}
        anneeLibelle={annee.libelle}
        classes={classes}
        initiales={tiroirInitial}
        peutImprimer={peutImprimer}
      />

      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open && !enCours) fermerFormulaire();
        }}
      >
        <DialogContent className="flex h-[min(92dvh,840px)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-[min(850px,calc(100vw-2.5rem))]">
          <DialogHeader className="shrink-0 border-b border-border bg-card px-5 py-4 pr-14 sm:px-6">
            <div className="mb-1 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                {form?.id ? <Pencil className="size-5" /> : <Plus className="size-5" />}
              </span>
              <span className="rounded-full bg-info-doux px-3 py-1 text-xs font-semibold text-info">
                Gestion des classes · {annee.libelle}
              </span>
            </div>
            <DialogTitle className="text-left text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {form?.id ? "Modifier la classe" : "Ajouter une classe"}
            </DialogTitle>
            <DialogDescription className="pt-1 text-left text-sm text-muted-foreground">
              {form?.id
                ? "Mettez à jour les informations sans affecter les élèves inscrits."
                : "Créez une nouvelle classe dans le registre scolaire de l’établissement."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={enregistrer} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5">
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <GraduationCap className="size-4 text-info" />
                    <h3 className="text-sm font-semibold text-foreground">Structure pédagogique</h3>
                  </div>
                  <div className="grid gap-3 min-[550px]:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="classe-niveau" className="font-semibold text-foreground">
                        Niveau <span className="text-info">*</span>
                      </Label>
                      <NativeSelect
                        id="classe-niveau"
                        className="w-full rounded-xl border-border bg-muted/40"
                        value={form.niveauId}
                        onChange={(e) => setForm({ ...form, niveauId: e.target.value, serieId: "" })}
                        required
                      >
                        <option value="">Sélectionner un niveau</option>
                        {niveaux.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.libelle}
                          </option>
                        ))}
                      </NativeSelect>
                      {erreurs.niveauId && <p className="text-xs text-danger">{erreurs.niveauId}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="classe-serie" className="font-semibold text-foreground">
                        Série <span className="font-normal text-muted-foreground">(si applicable)</span>
                      </Label>
                      <NativeSelect
                        id="classe-serie"
                        className="w-full rounded-xl border-border bg-muted/40 disabled:opacity-60"
                        value={niveauChoisi?.seriesApplicables ? form.serieId : ""}
                        onChange={(e) => setForm({ ...form, serieId: e.target.value })}
                        disabled={!niveauChoisi?.seriesApplicables}
                      >
                        <option value="">{niveauChoisi?.seriesApplicables ? "Sans série" : "Non applicable"}</option>
                        {series
                          .filter((s) => s.active)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code} — {s.libelle}
                            </option>
                          ))}
                      </NativeSelect>
                      {erreurs.serieId && <p className="text-xs text-danger">{erreurs.serieId}</p>}
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <BookOpen className="size-4 text-info" />
                    <h3 className="text-sm font-semibold text-foreground">Identification de la classe</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="classe-libelle" className="font-semibold text-foreground">
                        Nom de la classe <span className="text-info">*</span>
                      </Label>
                      <Input
                        id="classe-libelle"
                        className="rounded-xl border-border bg-muted/40"
                        required
                        value={form.libelle}
                        onChange={(e) => setForm({ ...form, libelle: e.target.value })}
                        placeholder="Ex. : 6ème A"
                      />
                      {erreurs.libelle && <p className="text-xs text-danger">{erreurs.libelle}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="classe-code" className="font-semibold text-foreground">
                        Code <span className="text-info">*</span>
                      </Label>
                      <Input
                        id="classe-code"
                        className="rounded-xl border-border bg-muted/40 font-mono uppercase"
                        required
                        maxLength={10}
                        value={form.code}
                        onChange={(e) =>
                          setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                        }
                        placeholder="Ex. : 6A"
                      />
                      {erreurs.code && <p className="text-xs text-danger">{erreurs.code}</p>}
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <Users className="size-4 text-info" />
                    <h3 className="text-sm font-semibold text-foreground">Capacité d’accueil</h3>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="classe-capacite" className="font-semibold text-foreground">
                      Nombre maximal d’élèves <span className="text-info">*</span>
                    </Label>
                    <Input
                      id="classe-capacite"
                      className="rounded-xl border-border bg-muted/40"
                      type="number"
                      min={1}
                      max={200}
                      required
                      value={form.capaciteMax}
                      onChange={(e) => setForm({ ...form, capaciteMax: e.target.value })}
                    />
                    {erreurs.capaciteMax && <p className="text-xs text-danger">{erreurs.capaciteMax}</p>}
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-info-trait bg-info-doux px-3.5 py-3 text-xs leading-relaxed text-info">
                    <School className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Une classe ne peut pas accueillir plus d’élèves que sa capacité. La capacité ne peut pas être
                      réduite sous l’effectif déjà inscrit.
                    </span>
                  </div>
                </section>
                {form.id && peutModifier && classes.find((c) => c.id === form.id)?.effectif === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const c = classes.find((v) => v.id === form.id);
                      if (c) supprimer(c);
                    }}
                    disabled={enCours}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-danger hover:underline"
                  >
                    <Trash2 className="size-4" /> Supprimer cette classe vide
                  </button>
                )}
              </div>
              <DialogFooter className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
                <Button type="button" variant="outline" disabled={enCours} onClick={() => setForm(null)}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  disabled={enCours}
                >
                  {enCours ? (
                    "Enregistrement…"
                  ) : (
                    <>
                      {form.id ? <Check className="size-4" /> : <Plus className="size-4" />}{" "}
                      {form.id ? "Enregistrer les modifications" : "Créer la classe"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
