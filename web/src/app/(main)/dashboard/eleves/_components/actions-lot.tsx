"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { ArrowRightLeft } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { BarreSelection, useSelection } from "@/components/ui/selection-lot";

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
}: {
  classes: Array<{ id: string; libelle: string }>;
  peutAffecter: boolean;
  peutEnvoyer: boolean;
}) {
  const { selection, vider } = useSelection();
  const routeur = useRouter();

  const [ouvert, setOuvert] = useState(false);
  const [classeId, setClasseId] = useState("");
  const [motif, setMotif] = useState("");
  const [enCours, demarrer] = useTransition();

  const ids = [...selection];

  function deplacer() {
    demarrer(async () => {
      const r = await changerClasseEnLot({ eleveIds: ids, classeId, motif });
      if (r.ok) {
        toast.success(r.message ?? "Déplacement effectué.");
        setOuvert(false);
        setMotif("");
        setClasseId("");
        vider();
        routeur.refresh();
      } else {
        toast.error(r.message ?? "Le déplacement a échoué.");
      }
    });
  }

  return (
    <BarreSelection singulier="élève sélectionné" pluriel="élèves sélectionnés">
      {peutEnvoyer ? (
        <BoutonNotifier
          cible={{ type: "selection", ids, nom: `${ids.length} élève(s)` }}
          variante="ghost"
          libelle="Prévenir"
        />
      ) : null}

      {peutAffecter ? (
        <Dialog open={ouvert} onOpenChange={setOuvert}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <ArrowRightLeft aria-hidden />
              Changer de classe
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Déplacer {ids.length} élève(s)</DialogTitle>
              <DialogDescription>
                Le déplacement est indivisible : si la classe d&apos;arrivée n&apos;a pas assez de
                places pour tout le monde, personne n&apos;est déplacé.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lot-classe">Classe d&apos;arrivée</Label>
                <NativeSelect
                  id="lot-classe"
                  value={classeId}
                  onChange={(e) => setClasseId(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lot-motif">Motif</Label>
                <Input
                  id="lot-motif"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Dédoublement de la 6e A, réorientation de série…"
                />
                <p className="text-muted-foreground text-xs">
                  Inscrit au dossier de chaque élève. C&apos;est ce qu&apos;on relit l&apos;année
                  suivante pour comprendre un mouvement.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <Button onClick={deplacer} disabled={enCours || !classeId || motif.trim().length < 3}>
                {enCours ? "Déplacement…" : `Déplacer ${ids.length} élève(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </BarreSelection>
  );
}
