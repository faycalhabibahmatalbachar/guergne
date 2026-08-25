"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Check } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarreSelection, useSelection } from "@/components/ui/selection-lot";

import { justifierEnLot } from "../actions";

/**
 * Justification en masse des absences (E-52).
 *
 * UN CERTIFICAT COUVRE DES JOURS, PAS UNE HEURE
 * ----------------------------------------------
 * Un certificat médical de trois jours produit douze à dix-huit lignes dans la
 * base — une par cours manqué. Les justifier une par une, c'est recopier le
 * même motif dix-huit fois. En pratique le surveillant en fait trois et
 * abandonne : le dossier garde alors quinze absences non justifiées qu'un
 * certificat couvrait, et c'est ce chiffre qui remonte au bulletin et
 * déclenche la convocation.
 *
 * UN VRAI CHAMP, PAS UN `window.prompt`
 * --------------------------------------
 * Le motif finit dans le dossier de l'élève et sera relu en cas de litige. Une
 * boîte de dialogue du navigateur ne permet ni de le relire avant d'envoyer,
 * ni d'annuler proprement, ni d'indiquer la référence du certificat — et
 * certains navigateurs la bloquent purement et simplement.
 *
 * MOTIFS COURANTS EN UN CLIC
 * ---------------------------
 * Quatre motifs couvrent la quasi-totalité des cas réels. Les taper au clavier
 * quarante fois par semaine produit des libellés incohérents — « maladie »,
 * « Maladie », « malade » — qu'aucun comptage ne peut ensuite regrouper.
 */

const MOTIFS = [
  "Certificat médical",
  "Maladie signalée par la famille",
  "Raison familiale",
  "Convocation administrative",
];

export function JustificationLot() {
  const routeur = useRouter();
  const { selection, vider } = useSelection();

  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [enCours, demarrer] = useTransition();

  const ids = [...selection];

  function justifier(statut: "JUSTIFIEE" | "NON_JUSTIFIEE") {
    demarrer(async () => {
      const r = await justifierEnLot(ids, statut, motif);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) {
        setOuvert(false);
        setMotif("");
        vider();
        routeur.refresh();
      }
    });
  }

  return (
    <>
      <BarreSelection singulier="absence sélectionnée" pluriel="absences sélectionnées">
        <Button size="sm" variant="ghost" onClick={() => setOuvert(true)}>
          <Check aria-hidden />
          Justifier
        </Button>
      </BarreSelection>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Justifier {ids.length} absence(s)</DialogTitle>
            <DialogDescription>
              Le même motif est appliqué à toutes : c&apos;est le cas réel, un certificat couvre
              plusieurs cours. Il sera relu en cas de litige avec la famille.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="jl-motif">Motif</Label>
              <Input
                id="jl-motif"
                value={motif}
                maxLength={200}
                autoFocus
                placeholder="Certificat médical du 12 au 14 mars, Dr Abakar"
                onChange={(e) => setMotif(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MOTIFS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotif(m)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {/*
              Retirer une justification posée par erreur doit être aussi
              accessible que la poser. Sans ce bouton, la correction passerait
              par une modification en base — c'est-à-dire par personne.
            */}
            <Button
              variant="ghost"
              disabled={enCours}
              onClick={() => justifier("NON_JUSTIFIEE")}
              title="Repasser ces absences en non justifiées"
            >
              Retirer la justification
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => justifier("JUSTIFIEE")}
                disabled={enCours || motif.trim().length < 3}
              >
                {enCours ? "Enregistrement…" : `Justifier ${ids.length}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
