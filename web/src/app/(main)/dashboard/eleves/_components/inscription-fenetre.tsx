"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Plus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormulaireInscription } from "../nouveau/_components/formulaire-inscription";

type ClasseInscription = {
  id: string; libelle: string; niveauLibelle: string; serieCode: string | null;
  effectif: number; capaciteMax: number;
};

export function InscriptionFenetre({
  annee, classes, ouvrirInitialement, peutPhoto,
}: {
  annee: string | null;
  classes: ClasseInscription[];
  ouvrirInitialement: boolean;
  peutPhoto: boolean;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const [open, setOpen] = useState(ouvrirInitialement);

  useEffect(() => {
    if (ouvrirInitialement) setOpen(true);
  }, [ouvrirInitialement]);

  const changer = (ouvert: boolean) => {
    setOpen(ouvert);
    if (!ouvert && query.has("inscription")) {
      const params = new URLSearchParams(query.toString());
      params.delete("inscription");
      router.replace(`/dashboard/eleves${params.size ? "?" + params.toString() : ""}`, { scroll: false });
    }
  };

  return <>
    <Button type="button" onClick={() => changer(true)}
      className="order-first h-10 w-full gap-2 bg-blue-600 px-4 font-semibold text-white shadow-sm hover:bg-blue-700 sm:order-last sm:w-auto">
      <Plus className="size-4" aria-hidden /> Inscrire un élève
    </Button>
    <Dialog open={open} onOpenChange={changer}>
      <DialogContent
        onInteractOutside={e => e.preventDefault()}
        className="flex h-[min(94dvh,960px)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[min(1240px,calc(100vw-2.5rem))] dark:border-border dark:bg-card">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-5 py-4 pr-12 dark:border-border dark:bg-muted/20 sm:px-7 sm:py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"><GraduationCap className="size-5" aria-hidden /></span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold tracking-tight sm:text-xl">Nouveau dossier élève</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed sm:text-sm">
                {annee ? `Année scolaire ${annee} · inscription complète en cinq étapes` : "Aucune année scolaire active"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7">
          {!annee ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Configurez l’année scolaire courante dans Paramètres avant de créer un dossier.
          </div> : !classes.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Aucune classe active pour l’année en cours. Ajoutez les classes avant de commencer les inscriptions.
          </div> : (
            <FormulaireInscription classes={classes} modeFenetre peutPhoto={peutPhoto} />
          )}
        </div>
        <p className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500 dark:border-border sm:px-7">
          <ShieldCheck className="size-3.5 shrink-0 text-blue-600" aria-hidden />
          Les dossiers et leurs responsables sont enregistrés de manière contrôlée. Aucune notification n’est envoyée sans demande explicite.
        </p>
      </DialogContent>
    </Dialog>
  </>;
}
