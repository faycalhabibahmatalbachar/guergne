"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ReglageBlocage } from "@/server/domain/caisse";
import { definirReglageBlocage } from "@/app/(main)/dashboard/bulletins/actions-blocage";

export function ReglageBulletinsImpayes({ reglage }: { reglage: ReglageBlocage }) {
  const routeur = useRouter();
  const [actif, setActif] = useState(reglage.actif);
  const [seuilTexte, setSeuilTexte] = useState(String(reglage.seuilFcfa));
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, demarrer] = useTransition();
  const seuil = Number(seuilTexte);
  const valide = /^\d+$/.test(seuilTexte) && Number.isInteger(seuil) && seuil >= 0 && seuil <= 1_000_000;
  const modifie = actif !== reglage.actif || seuil !== reglage.seuilFcfa;

  function enregistrer() {
    if (!valide || !modifie) return;
    demarrer(async () => {
      const resultat = await definirReglageBlocage(actif, seuil);
      toast[resultat.ok ? "success" : "error"](resultat.message ?? "Impossible d'enregistrer les modifications.");
      if (resultat.ok) {
        setConfirmer(false);
        routeur.refresh();
      }
    });
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="retenue-bulletins" className="font-medium">Retenir la publication des bulletins impayés</Label>
            <p className="max-w-xl text-muted-foreground text-xs">
              La retenue ne s'applique qu'aux bulletins non encore publiés. Elle peut être levée
              individuellement avec les permissions financières appropriées.
            </p>
          </div>
          <Switch id="retenue-bulletins" checked={actif} onCheckedChange={setActif} disabled={enCours} />
        </div>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="seuil-retenue">Tolérance sur le reste à payer (FCFA)</Label>
          <Input
            id="seuil-retenue"
            type="number"
            min={0}
            max={1000000}
            step={1}
            value={seuilTexte}
            onChange={(e) => setSeuilTexte(e.target.value)}
            aria-describedby="aide-retenue"
            aria-invalid={!valide}
            disabled={enCours}
          />
          <p id="aide-retenue" className="text-muted-foreground text-xs">
            De 0 à 1 000 000 FCFA. Un solde supérieur au seuil peut entraîner une retenue si la règle est activée.
          </p>
        </div>
        <Button type="button" disabled={!valide || !modifie || enCours} onClick={() => setConfirmer(true)}>
          Enregistrer les règles
        </Button>
      </div>

      <AlertDialog open={confirmer} onOpenChange={(ouvert) => { if (!enCours) setConfirmer(ouvert); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" aria-hidden />
              <AlertDialogTitle>Confirmer le réglage financier</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {actif
                ? "Les bulletins non publiés des élèves dépassant le seuil d'impayé pourront être retenus."
                : "La retenue automatique sera désactivée. Les bulletins concernés pourront être publiés normalement."}
              {" "}Seuil choisi : {seuil.toLocaleString("fr-FR")} FCFA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(evenement) => { evenement.preventDefault(); enregistrer(); }} disabled={enCours}>
              {enCours ? "Enregistrement…" : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
