"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  Printer,
  School,
  Search,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LigneClasseParametre } from "@/server/domain/parametres";

import { type ResultatElevesClasses, rechercherElevesClasses } from "./eleves-actions";
import { urlImpressionClasses } from "./impression-url";

type Props = {
  ouvert: boolean;
  surFermeture: () => void;
  anneeId: string;
  anneeLibelle: string;
  peutImprimer: boolean;
  classes: LigneClasseParametre[];
  initiales: string[];
};

export function ElevesClassesTiroir({
  ouvert,
  surFermeture,
  anneeId,
  anneeLibelle,
  classes,
  initiales,
  peutImprimer,
}: Props) {
  const [mode, setMode] = useState<"choix" | "tous">("choix");
  const [ids, setIds] = useState<string[]>(initiales);
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const [etat, setEtat] = useState<ResultatElevesClasses | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    setIds(initiales);
    setMode(initiales.length ? "choix" : "tous");
    setRecherche("");
    setPage(1);
    setEtat(null);
    // Resets only when drawer is opened; selections inside stay user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, initiales.join(",")]);

  useEffect(() => {
    if (!ouvert) return;
    let actif = true;
    setCharge(true);
    setErreur(false);
    const handle = setTimeout(async () => {
      try {
        const resultat = await rechercherElevesClasses({
          anneeId,
          classesIds: mode === "tous" ? [] : ids,
          page,
          recherche,
        });
        if (actif) setEtat(resultat);
      } catch {
        if (actif) {
          setEtat(null);
          setErreur(true);
        }
      } finally {
        if (actif) setCharge(false);
      }
    }, 250);
    return () => {
      actif = false;
      clearTimeout(handle);
    };
  }, [ouvert, anneeId, mode, ids, page, recherche]);

  function changerClasse(id: string) {
    if (id === "multiple") return;
    setPage(1);
    setMode(id ? "choix" : "tous");
    setIds(id ? [id] : []);
  }

  const selection =
    mode === "tous"
      ? "Tous les élèves du lycée"
      : ids.length === 1
        ? (classes.find((c) => c.id === ids[0])?.libelle ?? "Classe")
        : `${ids.length} classes sélectionnées`;
  const pages = Math.max(1, Math.ceil((etat?.total ?? 0) / 25));
  return (
    <Sheet
      open={ouvert}
      onOpenChange={(v) => {
        if (!v) surFermeture();
      }}
    >
      <SheetContent
        side="right"
        className="flex h-dvh w-full max-w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 sm:w-[min(94vw,1080px)] sm:max-w-[min(94vw,1080px)] xl:w-[1080px] xl:max-w-[1080px]"
      >
        <SheetHeader className="shrink-0 border-b border-border bg-muted/40 px-5 py-5 dark:bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Users className="size-5" aria-hidden />
            </span>
            <div>
              <SheetTitle className="text-lg font-bold">Répertoire des élèves</SheetTitle>
              <SheetDescription className="mt-1 text-xs">Lycée La Renaissance · {anneeLibelle}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("choix");
                if (!ids.length) setIds(classes[0] ? [classes[0].id] : []);
                setPage(1);
              }}
              aria-pressed={mode === "choix"}
              className={`rounded-lg border px-3 py-2.5 text-left text-xs font-semibold ${mode === "choix" ? "border-info-trait bg-info-doux text-info" : "border-border hover:bg-muted/40"}`}
            >
              <GraduationCap className="mr-1 inline size-4" aria-hidden /> Par classe
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("tous");
                setIds([]);
                setPage(1);
              }}
              aria-pressed={mode === "tous"}
              className={`rounded-lg border px-3 py-2.5 text-left text-xs font-semibold ${mode === "tous" ? "border-info-trait bg-info-doux text-info" : "border-border hover:bg-muted/40"}`}
            >
              <School className="mr-1 inline size-4" aria-hidden /> Tout le lycée
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold">Classe</span>
              <select
                value={mode === "tous" ? "" : ids.length === 1 ? ids[0] : "multiple"}
                onChange={(e) => changerClasse(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="">Toutes les classes</option>
                {ids.length > 1 && (
                  <option value="multiple" disabled>
                    Sélection multiple ({ids.length})
                  </option>
                )}
                {classes.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.libelle} ({c.effectif})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold">Recherche</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={recherche}
                  onChange={(e) => {
                    setRecherche(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 pl-9"
                  placeholder="Nom ou matricule"
                />
              </div>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-info-doux px-3 py-2.5">
            <span className="flex items-center gap-2 text-xs font-semibold text-info">
              <BookOpen className="size-4" aria-hidden />
              {selection}
            </span>
            <span className="text-xs font-semibold tabular-nums text-info">
              {etat ? etat.total.toLocaleString("fr-FR") + " élève(s)" : "—"}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,.65fr)_auto] gap-3 border-b border-border bg-muted/40 px-3 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground dark:bg-muted/30">
              <span>Élève</span>
              <span>Classe</span>
              <span>Action</span>
            </div>
            {charge && (
              <p role="status" className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Chargement des dossiers…
              </p>
            )}
            {!charge && erreur && (
              <p role="alert" className="p-5 text-xs text-alerte">
                Chargement impossible. Fermez puis rouvrez le répertoire.
              </p>
            )}
            {!charge &&
              !erreur &&
              etat?.lignes.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,.65fr)_auto] items-center gap-3 border-b border-border px-3 py-3 last:border-b-0 hover:bg-info-doux/90"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {e.prenom} {e.nom}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.matricule} · {e.dossier.replaceAll("_", " ").toLowerCase()}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-info">{e.classeLibelle}</span>
                  <Link
                    href={`/dashboard/eleves/${e.id}`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold text-foreground hover:border-info-trait hover:text-info"
                  >
                    Dossier <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </div>
              ))}
            {!charge && !erreur && etat?.lignes.length === 0 && (
              <p className="p-8 text-center text-xs text-muted-foreground">Aucun élève pour ces critères.</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{etat ? `Page ${etat.page} / ${pages}` : "—"}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={charge || page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" aria-hidden />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={charge || page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
          <p className="rounded-lg border border-border p-3 text-xs leading-5 text-muted-foreground">
            Les salles physiques sont attribuées par créneau dans l'emploi du temps. Elles ne constituent pas une
            affectation permanente des élèves. Ici, la liste est organisée par groupe pédagogique.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border p-4">
          {peutImprimer && mode === "choix" && ids.length > 0 && (
            <a
              href={urlImpressionClasses(anneeId, ids)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              title="Imprime tous les inscrits des classes sélectionnées, sans limiter à la page affichée"
            >
              <Printer className="size-4" aria-hidden /> Imprimer {ids.length === 1 ? "la classe" : "les classes"}
            </a>
          )}
          <Button type="button" variant="outline" onClick={surFermeture}>
            Fermer le répertoire
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
