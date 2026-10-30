"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { ClipboardCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { enregistrerExamenDoublon } from "../../actions";

export function ExamenDoublon({
  tuteurId,
  autreTuteurId,
  nom,
}: {
  tuteurId: string;
  autreTuteurId: string;
  nom: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState<"DISTINCTS" | "MEME_PERSONNE_A_VERIFIER" | null>(null);
  const [motif, setMotif] = useState("");
  const [accord, setAccord] = useState(false);
  const [enCours, commencer] = useTransition();

  function enregistrer() {
    if (!ouvert || !accord || motif.trim().length < 15) return;
    const decision = ouvert;
    commencer(async () => {
      const r = await enregistrerExamenDoublon({
        tuteurId,
        autreTuteurId,
        decision,
        motif: motif.trim(),
        justificatifsVerifies: true,
      });
      toast[r.ok ? "success" : "error"](r.message);
      if (r.ok) {
        setOuvert(null);
        setMotif("");
        setAccord(false);
        router.refresh();
      }
    });
  }
  const choisir = (v: "DISTINCTS" | "MEME_PERSONNE_A_VERIFIER") => {
    setOuvert(v);
    setMotif("");
    setAccord(false);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => choisir("DISTINCTS")}>
          Personnes distinctes
        </Button>
        <Button
          size="sm"
          className="bg-alerte font-semibold text-primary-foreground hover:bg-alerte/90"
          onClick={() => choisir("MEME_PERSONNE_A_VERIFIER")}
        >
          Même personne suspectée
        </Button>
      </div>
      <Dialog
        open={ouvert !== null}
        onOpenChange={(v) => {
          if (!v && !enCours) setOuvert(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl bg-alerte-doux text-alerte">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <DialogTitle>Consigner l'examen du doublon</DialogTitle>
            <DialogDescription>
              Comparaison avec <strong>{nom}</strong>. Décision :{" "}
              <strong>
                {ouvert === "DISTINCTS"
                  ? "Deux personnes distinctes"
                  : "Même personne potentielle, à rapprocher plus tard"}
              </strong>
              . Aucune fusion, suppression ou transmission d'accès ne sera effectuée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="examen-motif">Justification (15 caractères minimum)</Label>
              <Textarea
                id="examen-motif"
                rows={4}
                maxLength={400}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Indiquez les documents examinés et les éléments permettant de distinguer ou rapprocher ces deux personnes…"
              />
              <p className="text-right text-xs text-muted-foreground">{motif.length}/400</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-alerte-trait bg-alerte-doux p-3 text-xs leading-relaxed text-alerte">
              <Checkbox checked={accord} onCheckedChange={(v) => setAccord(v === true)} className="mt-0.5" />
              <span>
                J'atteste avoir vérifié les éléments justifiant cette décision. Elle sera conservée dans le journal
                d'audit.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={enCours} onClick={() => setOuvert(null)}>
              Annuler
            </Button>
            <Button
              className="bg-succes text-primary-foreground hover:bg-succes/90"
              disabled={enCours || motif.trim().length < 15 || !accord}
              onClick={enregistrer}
            >
              <ClipboardCheck className="size-4" aria-hidden />
              {enCours ? "Enregistrement…" : "Consigner la décision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
