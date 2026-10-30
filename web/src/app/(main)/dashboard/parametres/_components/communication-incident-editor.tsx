"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { definirSeuilIncident } from "../notifications/actions";

const GRAVITES = [
  { id: "MINEURE", titre: "Mineure", detail: "Tous les incidents sont signalés." },
  { id: "MOYENNE", titre: "Moyenne", detail: "Signaler les incidents moyens, graves et très graves." },
  { id: "GRAVE", titre: "Grave", detail: "Uniquement les incidents graves et très graves." },
  { id: "TRES_GRAVE", titre: "Très grave", detail: "Uniquement les incidents les plus graves." },
] as const;

export function libelleGravite(gravite: string) {
  return GRAVITES.find((g) => g.id === gravite)?.titre ?? gravite;
}

export function CommunicationIncidentEditor({ actuel }: { actuel: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(actuel);
  const [enCours, lancer] = useTransition();

  function enregistrer() {
    if (choix === actuel || enCours) return;
    lancer(async () => {
      const resultat = await definirSeuilIncident(choix);
      toast[resultat.ok ? "success" : "error"](resultat.message ?? "Modification impossible.");
      if (resultat.ok) {
        setOuvert(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-[104px] text-xs font-semibold"
        onClick={() => {
          setChoix(actuel);
          setOuvert(true);
        }}
      >
        Modifier
      </Button>
      <Sheet
        open={ouvert}
        onOpenChange={(v) => {
          if (!enCours) setOuvert(v);
        }}
      >
        <SheetContent side="right" className="w-full max-w-full gap-0 p-0 sm:max-w-[470px]">
          <SheetHeader className="border-b border-border px-5 py-5">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-alerte-doux text-alerte">
              <AlertTriangle className="size-5" aria-hidden />
            </div>
            <SheetTitle className="text-xl font-bold">Seuil de notification des incidents</SheetTitle>
            <SheetDescription className="mt-2 leading-relaxed">
              Définissez à partir de quelle gravité un incident peut déclencher une notification aux familles.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              enregistrer();
            }}
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
              <p className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm dark:bg-muted/40">
                <Check className="size-4 text-succes" aria-hidden />
                Seuil actuel : <strong>{libelleGravite(actuel)}</strong>
              </p>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">Gravité minimale à notifier</legend>
                {GRAVITES.map((item) => (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                      choix === item.id
                        ? "border-succes-trait bg-succes-doux"
                        : "border-border hover:bg-muted/40 dark:hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="seuil-incident"
                      className="mt-1 accent-emerald-700"
                      checked={choix === item.id}
                      disabled={enCours}
                      onChange={() => setChoix(item.id)}
                    />
                    <span>
                      <span className="block text-sm font-semibold">{item.titre}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="flex items-start gap-2 rounded-lg border border-alerte-trait bg-alerte-doux p-3 text-xs leading-relaxed text-alerte">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Le choix modifie les prochaines alertes d’incident. Il n’envoie aucun message et ne réexpédie pas les
                alertes déjà créées.
              </p>
            </div>
            <SheetFooter className="flex-row gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setOuvert(false)}
                disabled={enCours}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-succes text-primary-foreground hover:bg-succes/90"
                disabled={choix === actuel || enCours}
              >
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
