"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Check, Clock3, Info, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 font-semibold"
        onClick={() => {
          setJours(String(joursActuels));
          setOpen(true);
        }}
      >
        <Pencil className="size-3.5" aria-hidden /> Modifier
      </Button>
      <Sheet
        open={open}
        onOpenChange={(ouvert) => {
          if (!enCours) setOpen(ouvert);
        }}
      >
        <SheetContent side="right" className="w-full max-w-full gap-0 p-0 sm:max-w-[460px]">
          <SheetHeader className="border-b border-border px-5 py-5">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-succes-doux text-succes">
              <Clock3 className="size-5" aria-hidden />
            </div>
            <SheetTitle className="text-xl font-bold">Durée des codes d’activation</SheetTitle>
            <SheetDescription className="mt-2 leading-relaxed">
              Choisissez pendant combien de jours un nouveau parent peut utiliser son code d’invitation.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              enregistrer();
            }}
          >
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3 dark:bg-muted/40">
                <div>
                  <p className="text-xs text-muted-foreground">Durée enregistrée</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {joursActuels} jour{joursActuels > 1 ? "s" : ""}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-succes-doux px-2.5 py-1 text-xs font-semibold text-succes">
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
                      className={`flex h-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                        entier === nombre
                          ? "border-succes-trait bg-succes-doux text-succes"
                          : "border-border bg-card text-foreground hover:bg-muted/40"
                      }`}
                    >
                      {nombre} j
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="communication-validite-jours">Ou saisir une durée personnalisée (1 à 30 jours)</Label>
                  <Input
                    id="communication-validite-jours"
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    required
                    value={jours}
                    disabled={enCours}
                    aria-invalid={!valide}
                    aria-describedby="communication-validite-message"
                    onChange={(event) => setJours(event.target.value)}
                    className="h-10 shadow-none"
                  />
                  <p
                    id="communication-validite-message"
                    className={`text-xs ${valide ? "text-muted-foreground" : "text-danger"}`}
                  >
                    {valide
                      ? "La nouvelle durée s’applique après enregistrement."
                      : "Indiquez un nombre entier entre 1 et 30."}
                  </p>
                </div>
              </fieldset>

              <div className="space-y-3 rounded-lg border border-info-trait bg-info-doux p-4 text-sm text-foreground">
                <p className="flex items-center gap-2 font-semibold">
                  <Info className="size-4 text-info" aria-hidden /> Effet du changement
                </p>
                <p>
                  Les invitations créées après la sauvegarde seront valables{" "}
                  <strong>
                    {valide ? entier : "—"} jour{valide && entier === 1 ? "" : "s"}
                  </strong>
                  .
                </p>
                <p>
                  Les codes déjà émis conservent leur date d’expiration. Aucun nouveau code n’est envoyé par cette
                  opération.
                </p>
              </div>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Modification réservée aux rôles autorisés et enregistrée dans le journal d’audit.
              </p>
            </div>
            <SheetFooter className="flex-row gap-2 border-t border-border bg-card px-5 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={enCours}
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={!modifie || enCours}
                className="flex-1 bg-succes font-semibold text-primary-foreground hover:bg-succes/90"
              >
                {enCours ? "Enregistrement…" : "Enregistrer le réglage"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
