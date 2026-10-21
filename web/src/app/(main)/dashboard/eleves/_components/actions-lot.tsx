"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import Link from "next/link";

import { AlertCircle, ArrowRightLeft, Check, ChevronDown, Copy, Download, ExternalLink, FileText, MoreHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSelection } from "@/components/ui/selection-lot";

import { BoutonNotifier } from "../../_components/bouton-notifier";
import { changerClasseEnLot } from "../actions-lot";

/**
 * Ce qu'on peut faire d'une sélection d'élèves (E-38).
 *
 * DEUX ACTIONS, PAS DIX
 * ----------------------
 * Déplacer vers une classe, et prévenir les familles. Ce sont les deux gestes
 * qui se font réellement sur un groupe : un dédoublement de classe, une
 * convocation de parents. Le reste — suspendre, exclure, transférer — est
 * individuel par nature : chacune de ces décisions exige un motif propre à
 * l'élève et se prend une par une, jamais sur vingt cases cochées.
 *
 * Offrir « exclure la sélection » serait mettre à portée d'un clic une action
 * qu'aucun règlement intérieur n'autorise à prendre collectivement.
 */
export function ActionsLotEleves({
  classes,
  peutAffecter,
  peutEnvoyer,
  selectionDonnees,
}: {
  classes: Array<{ id: string; libelle: string; effectif: number; capaciteMax: number }>;
  peutAffecter: boolean;
  peutEnvoyer: boolean;
  selectionDonnees: Array<{ id: string; nom: string; prenom: string; matricule: string; classeLibelle: string | null; statut: string; statutDossier: string | null }>;
}) {
  const { selection, vider } = useSelection();
  const routeur = useRouter();

  const [ouvert, setOuvert] = useState(false);
  const [classeId, setClasseId] = useState("");
  const [motif, setMotif] = useState("");
  const [erreurDeplacement, setErreurDeplacement] = useState("");
  const [enCours, demarrer] = useTransition();

  const ids = [...selection];
  const selectionnees = selectionDonnees.filter((eleve) => selection.has(eleve.id));
  const destination = classes.find((c) => c.id === classeId);
  const placesDisponibles = destination ? Math.max(0, destination.capaciteMax - destination.effectif) : null;
  const libelleNombre = `${ids.length} élève${ids.length > 1 ? "s" : ""} sélectionné${ids.length > 1 ? "s" : ""}`;

  function exporterSelection() {
    if (selectionnees.length === 0) return;
    const cellule = (valeur: string | null) => {
      const texte = String(valeur ?? "").replace(/^([=+@-])/, "'$1");
      return `"${texte.replace(/"/g, '""')}"`;
    };
    const colonnes = ["Matricule", "Nom", "Prénom", "Classe", "Statut", "État du dossier"];
    const lignes = selectionnees.map((e) => [e.matricule, e.nom, e.prenom, e.classeLibelle, e.statut, e.statutDossier].map(cellule).join(";"));
    const fichier = new Blob(["\uFEFF" + [colonnes.join(";"), ...lignes].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(fichier);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "eleves-selection.csv";
    lien.click();
    URL.revokeObjectURL(url);
  }

  async function copierSelection(mode: "matricules" | "noms" | "liste") {
    const lignes = selectionnees.map((e) =>
      mode === "matricules" ? e.matricule :
      mode === "noms" ? `${e.prenom} ${e.nom}` :
      `${e.matricule} — ${e.prenom} ${e.nom} — ${e.classeLibelle ?? "Sans classe"}`,
    );
    try {
      await navigator.clipboard.writeText(lignes.join("\n"));
      toast.success(`${lignes.length} ligne(s) copiée(s) dans le presse-papiers.`);
    } catch {
      toast.error("Copie indisponible dans ce navigateur.");
    }
  }

  function deplacer() {
    setErreurDeplacement("");
    demarrer(async () => {
      try {
        const resultat = await changerClasseEnLot({ eleveIds: ids, classeId, motif });
        if (resultat.ok) {
          toast.success(resultat.message ?? "Déplacement effectué.");
          setOuvert(false);
          setMotif("");
          setClasseId("");
          setErreurDeplacement("");
          vider();
          routeur.refresh();
        } else {
          const message = resultat.message ?? "Le déplacement a échoué."; 
          setErreurDeplacement(message);
          toast.error(message);
        }
      } catch {
        const message = "La connexion a été interrompue. Vérifiez la classe avant de recommencer."; 
        setErreurDeplacement(message);
        toast.error(message);
      }
    });
  }
  if (selection.size === 0) return null;

  return (
    <div role="toolbar" aria-label="Actions sur la sélection" className="mx-3 my-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100 sm:px-4">
      <div className="mr-auto flex min-w-0 items-center gap-2.5 sm:mr-4">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="size-4.5" strokeWidth={3} /></span>
        <span className="whitespace-nowrap text-sm font-semibold" role="status" aria-live="polite">{libelleNombre}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {peutEnvoyer ? (
          <BoutonNotifier
            cible={{ type: "selection", ids, nom: libelleNombre }}
            contexteEleves
            variante="ghost"
            libelle="Prévenir les parents"
          />
        ) : null}

        {peutAffecter ? (
          <Dialog open={ouvert} onOpenChange={(prochain) => { setOuvert(prochain); if (!prochain) setErreurDeplacement(""); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-emerald-200 bg-white px-3 text-slate-800 shadow-none hover:bg-emerald-100 dark:border-border dark:bg-card dark:text-foreground">
                <ArrowRightLeft className="size-4" aria-hidden /> Changer de classe
              </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-2xl border border-slate-200 p-0 shadow-2xl sm:max-w-xl dark:border-border">
              <DialogHeader className="border-b border-slate-100 bg-slate-50/60 px-6 py-6 pr-14 dark:border-border dark:bg-muted/15">
                <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
                  <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><ArrowRightLeft className="size-[19px]" /></span>
                  Changer de classe
                </DialogTitle>
                <DialogDescription className="pt-1 leading-relaxed">
                  Choisissez la nouvelle classe et indiquez le motif. Le changement concerne les {libelleNombre} et sera enregistré dans leur historique.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm dark:border-border dark:bg-muted/20">
                  <span className="font-semibold">{libelleNombre}</span>
                  <span className="ml-2 text-slate-500 dark:text-muted-foreground">· classe actuelle : {[...new Set(selectionnees.map((e) => e.classeLibelle ?? "Non affecté"))].join(", ")}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lot-classe" className="text-sm font-semibold">Classe de destination <span className="text-red-600" aria-hidden>*</span></Label>
                  <Select value={classeId} onValueChange={(value) => { setClasseId(value); setErreurDeplacement(""); }}>
                    <SelectTrigger id="lot-classe" className="h-11 w-full rounded-lg border-slate-200 bg-white text-sm dark:bg-background" aria-label="Classe de destination">
                      <SelectValue placeholder="Sélectionner une classe" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.libelle} · {Math.max(0, c.capaciteMax - c.effectif)} place(s) libre(s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {destination ? (
                    <p className={`text-xs ${placesDisponibles !== null && placesDisponibles < ids.length ? "text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-muted-foreground"}`}>
                      {destination.effectif} / {destination.capaciteMax} inscrits · {placesDisponibles} place(s) disponible(s)
                      {placesDisponibles !== null && placesDisponibles < ids.length ? " — capacité insuffisante pour cette sélection" : ""}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lot-motif" className="text-sm font-semibold">Motif du changement <span className="text-red-600" aria-hidden>*</span></Label>
                  <Textarea id="lot-motif" value={motif} onChange={(event) => { setMotif(event.target.value); setErreurDeplacement(""); }} rows={3} maxLength={500} placeholder="Ex. : Réorganisation des effectifs, changement d’orientation…" className="min-h-[100px] resize-y rounded-lg border-slate-200 bg-white dark:bg-background" />
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-muted-foreground">
                    <span>Le motif sera conservé dans l’historique scolaire de chaque élève.</span>
                    <span className="shrink-0 tabular-nums">{motif.length}/500</span>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                  Le transfert est effectué en une seule opération : si un élève ne peut pas être déplacé, aucun dossier ne sera modifié.
                </div>
                {erreurDeplacement ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erreurDeplacement}</div> : null}
              </div>

              <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-border dark:bg-muted/10">
                <Button variant="outline" className="h-10 rounded-lg bg-white px-4 dark:bg-card" onClick={() => setOuvert(false)} disabled={enCours}>Annuler</Button>
                <Button className="h-10 gap-2 rounded-lg bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800" onClick={deplacer} disabled={enCours || !classeId || motif.trim().length < 3 || (placesDisponibles !== null && placesDisponibles < ids.length)}>
                  <ArrowRightLeft className="size-4" aria-hidden /> {enCours ? "Déplacement en cours…" : `Confirmer pour ${ids.length} élève${ids.length > 1 ? "s" : ""}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-emerald-200 bg-white px-3 text-slate-800 shadow-none hover:bg-emerald-100 dark:border-border dark:bg-card dark:text-foreground" onClick={exporterSelection}>
          <Download className="size-4" aria-hidden /> Exporter
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg border-emerald-200 bg-white px-3 text-slate-800 shadow-none hover:bg-emerald-100 dark:border-border dark:bg-card dark:text-foreground" aria-label="Plus d’actions sur les élèves sélectionnés">
              <MoreHorizontal className="size-4" aria-hidden /> Plus <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1.5">
            <DropdownMenuLabel className="px-2 py-1.5 text-xs text-slate-500">Autres actions</DropdownMenuLabel>
            {ids.length === 1 ? <DropdownMenuItem asChild className="gap-2.5 px-2.5 py-2"><Link href={`/dashboard/eleves/${ids[0]}`}><ExternalLink className="size-4" aria-hidden /> Ouvrir le dossier</Link></DropdownMenuItem> : null}
            <DropdownMenuItem className="gap-2.5 px-2.5 py-2" onSelect={() => void copierSelection("matricules")}><Copy className="size-4" aria-hidden /> Copier les matricules</DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 px-2.5 py-2" onSelect={() => void copierSelection("noms")}><Copy className="size-4" aria-hidden /> Copier les noms</DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 px-2.5 py-2" onSelect={() => void copierSelection("liste")}><FileText className="size-4" aria-hidden /> Copier la liste complète</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2.5 px-2.5 py-2" onSelect={exporterSelection}><Download className="size-4" aria-hidden /> Exporter en CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button variant="ghost" size="icon" className="ml-auto size-9 shrink-0 rounded-lg text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 sm:ml-0" aria-label="Annuler la sélection" onClick={vider}><X className="size-4" aria-hidden /></Button>
    </div>
  );
}
