"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { CheckCircle2, Lock, LockOpen, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formaterFcfa } from "@/lib/finances-format";
import type { BlocageEleve, ReglageBlocage } from "@/server/domain/caisse";

import { definirReglageBlocage, leverBlocage, retablirBlocage } from "../actions-blocage";

/**
 * Qui ne recevra pas son bulletin, et pourquoi (E-58).
 *
 * AVANT LE BOUTON DE PUBLICATION, COMME LES SAISIES MANQUANTES
 * -------------------------------------------------------------
 * Le secrétariat doit savoir quelles familles ne recevront rien AVANT de
 * cliquer, pas en lisant le compte-rendu après coup. Sinon la publication part,
 * six parents appellent le lendemain, et personne ne sait dire lequel des six a
 * réellement une dette.
 *
 * LA LISTE S'AFFICHE MÊME QUAND LA RETENUE EST DÉSACTIVÉE
 * --------------------------------------------------------
 * Elle indique alors simplement qui doit de l'argent — information utile au
 * moment de remettre les bulletins en main propre, que l'établissement
 * pratique la retenue ou non. Le ton change, pas le contenu.
 */
export function RetenueImpaye({
  reglage,
  lignes,
  periodeId,
  peutLever,
  peutConfigurer,
}: {
  reglage: ReglageBlocage;
  lignes: BlocageEleve[];
  periodeId: string;
  peutLever: boolean;
  peutConfigurer: boolean;
}) {
  const routeur = useRouter();
  const [cible, setCible] = useState<BlocageEleve | null>(null);
  const [motif, setMotif] = useState("");
  const [enCours, demarrer] = useTransition();

  if (lignes.length === 0) {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm">
            Aucun élève de cette classe ne doit d&apos;argent
            {reglage.seuilFcfa > 0 ? ` au-delà de ${formaterFcfa(reglage.seuilFcfa)}` : ""}.
          </p>
        </CardContent>
      </Card>
    );
  }

  const retenus = lignes.filter((l) => l.retenu);

  function lever() {
    if (!cible) return;
    demarrer(async () => {
      const r = await leverBlocage({
        inscriptionId: cible.inscriptionId,
        periodeId,
        motif,
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) {
        setCible(null);
        setMotif("");
        routeur.refresh();
      }
    });
  }

  function basculerReglage(actif: boolean) {
    demarrer(async () => {
      const r = await definirReglageBlocage(actif, reglage.seuilFcfa);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  function retablir(l: BlocageEleve) {
    demarrer(async () => {
      const r = await retablirBlocage(l.inscriptionId, periodeId);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  return (
    <>
      <Card className={reglage.actif ? "border-amber-500/40 bg-amber-500/5" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet aria-hidden className="size-5" />
            {reglage.actif
              ? `${retenus.length} bulletin(s) retenu(s) pour scolarité non réglée`
              : `${lignes.length} élève(s) avec un reste à payer`}
          </CardTitle>
          <CardDescription>
            {reglage.actif ? (
              <>
                Ces bulletins ne partiront pas à la publication. Un bulletin déjà publié
                n&apos;est jamais repris : un document remis est remis.
              </>
            ) : (
              <>
                La retenue pour impayé est désactivée : ces bulletins seront publiés normalement.
                La liste sert à savoir qui relancer au moment de la remise.
              </>
            )}
          </CardDescription>

          {/*
            L'interrupteur est ICI, sous la liste des élèves concernés : c'est
            en les voyant qu'on décide d'appliquer la règle. Trois écrans plus
            loin, on l'actionnerait à l'aveugle — puis il faudrait revenir
            vérifier, et personne ne revient.
          */}
          {peutConfigurer ? (
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="rb-actif"
                checked={reglage.actif}
                disabled={enCours}
                onCheckedChange={basculerReglage}
              />
              <Label htmlFor="rb-actif" className="text-sm font-normal">
                Retenir les bulletins des scolarités non réglées
                {reglage.seuilFcfa > 0
                  ? ` au-delà de ${formaterFcfa(reglage.seuilFcfa)}`
                  : ""}
              </Label>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Élève</TableHead>
                  <TableHead className="text-right">Reste à payer</TableHead>
                  <TableHead className="text-right">Échéances dépassées</TableHead>
                  <TableHead>État</TableHead>
                  {peutLever ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lignes.map((l) => (
                  <TableRow key={l.inscriptionId}>
                    <TableCell>
                      {l.eleve}
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {l.matricule}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formaterFcfa(l.resteDu)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        l.echeancesEnRetard > 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {l.echeancesEnRetard || "—"}
                    </TableCell>
                    <TableCell>
                      {l.dejaPublie ? (
                        <Badge variant="secondary">déjà publié</Badge>
                      ) : l.leveePar ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="gap-1">
                            <LockOpen aria-hidden className="size-3" />
                            retenue levée
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {l.leveePar} — {l.motifLevee}
                          </span>
                        </span>
                      ) : reglage.actif ? (
                        <Badge variant="outline" className="text-destructive gap-1">
                          <Lock aria-hidden className="size-3" />
                          retenu
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">publiable</span>
                      )}
                    </TableCell>

                    {peutLever ? (
                      <TableCell className="text-right">
                        {l.dejaPublie ? null : l.leveePar ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={enCours}
                            onClick={() => retablir(l)}
                          >
                            Rétablir
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCible(l);
                              setMotif("");
                            }}
                          >
                            Lever
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(cible)} onOpenChange={(o) => (o ? null : setCible(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lever la retenue — {cible?.eleve}</DialogTitle>
            <DialogDescription>
              {cible ? formaterFcfa(cible.resteDu) : ""} restent dus. Le bulletin sera publié
              malgré tout. La levée vaut pour CETTE période seulement : elle devra être redécidée
              au trimestre suivant.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="lb-motif">Motif</Label>
            <Input
              id="lb-motif"
              value={motif}
              maxLength={200}
              autoFocus
              placeholder="Dossier de bourse en instruction, échéancier signé le 12/03…"
              onChange={(e) => setMotif(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Il sera relu par le proviseur et, le cas échéant, opposé à un parent qui, lui, a
              payé. « Cas social » sans précision ne se défend pas.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCible(null)}>
              Annuler
            </Button>
            <Button onClick={lever} disabled={enCours || motif.trim().length < 5}>
              {enCours ? "Enregistrement…" : "Lever la retenue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
