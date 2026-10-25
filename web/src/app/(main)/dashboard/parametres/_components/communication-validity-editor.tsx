"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Info, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { reglerValiditeInvitations } from "../parents/actions";

const PRESETS = [3, 7, 14, 30] as const;

export function CommunicationValidityEditor({ joursActuels }: { joursActuels: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jours, setJours] = useState(String(joursActuels));
  const [enCours, lancer] = useTransition();
  const entier = /^\d+$/.test(jours) ? Number(jours) : NaN;
  const valide = Number.isInteger(entier) && entier >= 1 && entier <= 30;
  const modifie = valide && entier !== joursActuels;



  function enregistrer() {
    if (!modifie || enCours) return;
    lancer(async () => {
      const resultat = await reglerValiditeInvitations(entier);
      if (resultat.ok) {
        toast.success(resultat.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(resultat.message);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm"
        className="h-9 shrink-0 gap-2 border-slate-200 bg-white font-semibold text-slate-700 shadow-none dark:border-border dark:bg-card dark:text-foreground"
        onClick={() => { setJours(String(joursActuels)); setOpen(true); }}>
        <Pencil className="size-3.5" aria-hidden /> Modifier
      </Button>
      <Sheet open={open} onOpenChange={(ouvert) => { if (!enCours) setOpen(ouvert); }}>
        <SheetContent side="right" className="w-full max-w-full gap-0 p-0 sm:max-w-[460px]">
          <SheetHeader className="border-b border-slate-200 px-5 py-5 dark:border-border">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Clock3 className="size-5" aria-hidden />
            </div>
            <SheetTitle className="text-xl font-bold">Durée des codes d’activation</SheetTitle>
            <SheetDescription className="mt-2 leading-relaxed">
              Choisissez pendant combien de jours un nouveau parent peut utiliser son code d’invitation.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => { event.preventDefault(); enregistrer(); }}
          >
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-border dark:bg-muted/40">
                <div>
                  <p className="text-xs text-slate-500 dark:text-muted-foreground">Durée enregistrée</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{joursActuels} jour{joursActuels > 1 ? "s" : ""}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Check className="size-3.5" aria-hidden /> Active
                </span>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Choisir une durée</legend>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((nombre) => (
                    <button
                      key={nombre}
                      type="button"
                      disabled={enCours}
                      aria-pressed={entier === nombre}
                      onClick={() => setJours(String(nombre))}
                      className={`flex h-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${entier === nombre
                        ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground"}`}
                    >
                      {nombre} j
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="communication-validite-jours">Ou saisir une durée personnalisée (1 à 30 jours)</Label>
                  <Input
                    id="communication-validite-jours"
                    type="number" min={1} max={30} step={1} required
                    value={jours}
                    disabled={enCours}
                    aria-invalid={!valide}
                    aria-describedby="communication-validite-message"
                    onChange={(event) => setJours(event.target.value)}
                    className="h-10 shadow-none"
                  />
                  <p id="communication-validite-message" className={`text-xs ${valide ? "text-slate-500" : "text-red-600"}`}>
                    {valide ? "La nouvelle durée s’applique après enregistrement." : "Indiquez un nombre entier entre 1 et 30."}
                  </p>
                </div>
              </fieldset>

              <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-foreground">
                <p className="flex items-center gap-2 font-semibold"><Info className="size-4 text-blue-700" aria-hidden /> Effet du changement</p>
                <p>Les invitations créées après la sauvegarde seront valables <strong>{valide ? entier : "—"} jour{valide && entier === 1 ? "" : "s"}</strong>.</p>
                <p>Les codes déjà émis conservent leur date d’expiration. Aucun nouveau code n’est envoyé par cette opération.</p>
              </div>
              <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Modification réservée aux rôles autorisés et enregistrée dans le journal d’audit.
              </p>
            </div>
            <SheetFooter className="flex-row gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-border dark:bg-card">
              <Button type="button" variant="outline" disabled={enCours}
                className="h-10 flex-1 border-slate-200" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!modifie || enCours}
                className="h-10 flex-1 bg-emerald-700 font-semibold text-white hover:bg-emerald-800">
                {enCours ? "Enregistrement…" : "Enregistrer le réglage"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
