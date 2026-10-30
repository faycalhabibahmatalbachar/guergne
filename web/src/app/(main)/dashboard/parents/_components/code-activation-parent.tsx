"use client";

import { useState } from "react";

import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Un code d'activation ne doit pas dépendre d'une notification fugace ou
 * d'une description Sonner à faible contraste. Il est montré une seule fois,
 * dans une fenêtre contrastée, et n'est ni sauvegardé ni inscrit aux logs.
 */
export function CodeActivationParent({
  code,
  nom,
  onFermer,
}: {
  code: string | null;
  nom: string;
  onFermer: () => void;
}) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopie(true);
      toast.success("Code copié.");
    } catch {
      toast.error("Copie impossible. Notez le code affiché.");
    }
  }

  function fermer() {
    setCopie(false);
    onFermer();
  }

  return (
    <Dialog
      open={code !== null}
      onOpenChange={(ouvert) => {
        if (!ouvert) fermer();
      }}
    >
      <DialogContent className="border-border bg-card text-foreground shadow-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-succes-doux text-succes">
            <KeyRound className="size-6" aria-hidden />
          </div>
          <DialogTitle className="text-left text-xl font-bold text-foreground">Code d’activation du parent</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-foreground">
            Nouveau code généré pour <strong className="font-semibold text-foreground">{nom}</strong>. Notez-le
            maintenant : il ne sera plus affiché après fermeture.
          </DialogDescription>
        </DialogHeader>

        <section
          aria-label="Code d'activation à usage unique"
          className="rounded-2xl border border-info-trait bg-primary p-5 text-primary-foreground shadow-inner"
        >
          <p className="text-sm font-semibold text-info">Code d’activation</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <code className="select-all font-mono text-[33px] font-extrabold leading-none tracking-[0.12em] text-primary-foreground tabular-nums sm:text-[39px]">
              {code}
            </code>
            <Button
              type="button"
              size="sm"
              onClick={copier}
              className="border border-white/40 font-semibold shadow-sm hover:bg-info-doux/90 hover:text-foreground"
              aria-label="Copier le code d'activation"
            >
              {copie ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copie ? "Copié" : "Copier"}
            </Button>
          </div>
        </section>

        <p className="flex items-start gap-2 rounded-xl border border-alerte-trait bg-alerte-doux p-3 text-xs font-medium leading-relaxed text-alerte">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Transmettez ce code uniquement au parent concerné, par un canal sûr. Ne le partagez pas dans un groupe.
        </p>

        <DialogFooter>
          <Button
            type="button"
            onClick={fermer}
            className="w-full bg-succes font-semibold text-primary-foreground hover:bg-succes/90"
          >
            <Check className="size-4" aria-hidden />
            J’ai noté le code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
