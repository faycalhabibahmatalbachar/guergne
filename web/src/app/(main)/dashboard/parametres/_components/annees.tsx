"use client";

import { useState, useTransition } from "react";

import { CalendarRange, Lock, LockOpen, Plus, Star } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { LigneAnnee, LignePeriode } from "@/server/domain/parametres";

import { basculerVerrouPeriode, cloturerAnnee, creerAnnee, definirAnneeCourante, modifierPeriode } from "../actions";

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export function OngletAnnees({
  annees,
  periodesParAnnee,
  peutGererAnnees,
  peutGererPeriodes,
  peutDeverrouillerPeriodes,
}: {
  annees: LigneAnnee[];
  periodesParAnnee: Record<string, LignePeriode[]>;
  peutGererAnnees: boolean;
  peutGererPeriodes: boolean;
  peutDeverrouillerPeriodes: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [clotureCible, setClotureCible] = useState<LigneAnnee | null>(null);
  const [motifCloture, setMotifCloture] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  // Par défaut on propose l'année scolaire qui commence : au Tchad, l'année
  // démarre en octobre et s'achève en juillet.
  const anneeCivile = new Date().getFullYear();
  const moisCourant = new Date().getMonth();
  const debutProbable = moisCourant >= 7 ? anneeCivile : anneeCivile - 1;

  function soumettre(formulaire: FormData) {
    setErreurs({});
    demarrer(async () => {
      const resultat = await creerAnnee({
        libelle: String(formulaire.get("libelle") ?? ""),
        dateDebut: String(formulaire.get("dateDebut") ?? ""),
        dateFin: String(formulaire.get("dateFin") ?? ""),
        typePeriode: String(formulaire.get("typePeriode") ?? "TRIMESTRE"),
        definirCourante: formulaire.get("definirCourante") === "on",
      });

      if (resultat.ok) {
        toast.success("Année scolaire créée, avec ses périodes.");
        setOuvert(false);
      } else {
        setErreurs(resultat.erreurs ?? {});
        if (resultat.message) toast.error(resultat.message);
      }
    });
  }

  function rendreCourante(id: string, libelle: string) {
    demarrer(async () => {
      const r = await definirAnneeCourante(id);
      toast[r.ok ? "success" : "error"](r.ok ? `${libelle} est désormais l'année en cours.` : (r.message ?? "Échec."));
    });
  }

  function cloturer() {
    if (!clotureCible || motifCloture.trim().length < 3) return;
    demarrer(async () => {
      const cible = clotureCible;
      const resultat = await cloturerAnnee(cible.id, motifCloture.trim());
      if (resultat.ok) {
        toast.success("Année " + cible.libelle + " clôturée.");
        setClotureCible(null);
        setMotifCloture("");
      } else {
        toast.error(resultat.message ?? "La clôture a échoué.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-lg">Années scolaires</h2>
          <p className="text-muted-foreground text-sm">
            L&apos;année en cours détermine ce qu&apos;affiche toute l&apos;application.
          </p>
        </div>

        <Dialog open={ouvert} onOpenChange={setOuvert}>
          {peutGererAnnees ? (
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus aria-hidden />
                Nouvelle année
              </Button>
            </DialogTrigger>
          ) : null}
          <DialogContent>
            <form action={soumettre}>
              <DialogHeader>
                <DialogTitle>Créer une année scolaire</DialogTitle>
                <DialogDescription>
                  Les périodes sont créées automatiquement et découpées à parts égales. Vous pourrez ensuite ajuster
                  leurs dates au calendrier réel.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="libelle">Libellé</Label>
                  <Input
                    id="libelle"
                    name="libelle"
                    defaultValue={`${debutProbable}-${debutProbable + 1}`}
                    placeholder="2026-2027"
                    required
                  />
                  {erreurs.libelle ? <p className="text-destructive text-sm">{erreurs.libelle}</p> : null}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dateDebut">Début</Label>
                    <Input
                      id="dateDebut"
                      name="dateDebut"
                      type="date"
                      defaultValue={`${debutProbable}-10-01`}
                      required
                    />
                    {erreurs.dateDebut ? <p className="text-destructive text-sm">{erreurs.dateDebut}</p> : null}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dateFin">Fin</Label>
                    <Input
                      id="dateFin"
                      name="dateFin"
                      type="date"
                      defaultValue={`${debutProbable + 1}-07-15`}
                      required
                    />
                    {erreurs.dateFin ? <p className="text-destructive text-sm">{erreurs.dateFin}</p> : null}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="typePeriode">Découpage</Label>
                  <NativeSelect id="typePeriode" name="typePeriode" defaultValue="TRIMESTRE">
                    <option value="TRIMESTRE">3 trimestres</option>
                    <option value="SEMESTRE">2 semestres</option>
                  </NativeSelect>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="definirCourante"
                    defaultChecked={annees.length === 0}
                    className="size-4 accent-primary"
                  />
                  Définir comme année en cours
                </label>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={enCours}>
                  {enCours ? "Création…" : "Créer l'année"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {annees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <CalendarRange className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">Aucune année scolaire</p>
            <p className="max-w-md text-muted-foreground text-sm">
              L&apos;année scolaire est le socle de tout le reste : classes, inscriptions, notes et bulletins s&apos;y
              rattachent. Commencez par la créer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {annees.map((annee) => {
            const listePeriodes = periodesParAnnee[annee.id] ?? [];

            return (
              <Card key={annee.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        {annee.libelle}
                        {annee.estCourante ? <Badge>Année en cours</Badge> : null}
                        {annee.estCloturee ? <Badge variant="outline">Clôturée</Badge> : null}
                      </CardTitle>
                      <CardDescription>
                        Du {dateFr(annee.dateDebut)} au {dateFr(annee.dateFin)} — {annee.nbClasses} classe
                        {annee.nbClasses > 1 ? "s" : ""}, {annee.nbInscriptions} inscription
                        {annee.nbInscriptions > 1 ? "s" : ""}
                      </CardDescription>
                    </div>

                    <div className="flex gap-2">
                      {peutGererAnnees && !annee.estCourante && !annee.estCloturee ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={enCours}
                          onClick={() => rendreCourante(annee.id, annee.libelle)}
                        >
                          <Star aria-hidden />
                          Définir en cours
                        </Button>
                      ) : null}
                      {peutGererAnnees && !annee.estCloturee && !annee.estCourante ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={enCours}
                          onClick={() => {
                            setClotureCible(annee);
                            setMotifCloture("");
                          }}
                        >
                          <Lock aria-hidden />
                          Clôturer
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {listePeriodes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Aucune période.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Période</TableHead>
                          <TableHead>Début</TableHead>
                          <TableHead>Fin</TableHead>
                          <TableHead>Saisie des notes</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {listePeriodes.map((p) => (
                          <LignePeriodeEditable
                            key={p.id}
                            periode={p}
                            anneeCloturee={annee.estCloturee}
                            peutGererPeriodes={peutGererPeriodes}
                            peutDeverrouillerPeriodes={peutDeverrouillerPeriodes}
                            enCours={enCours}
                            onBasculer={(verrouiller) =>
                              demarrer(async () => {
                                const r = await basculerVerrouPeriode(p.id, verrouiller);
                                toast[r.ok ? "success" : "error"](
                                  r.ok
                                    ? verrouiller
                                      ? "Période verrouillée."
                                      : "Période déverrouillée."
                                    : (r.message ?? "Échec."),
                                );
                              })
                            }
                            onEnregistrer={async (valeurs) => {
                              const r = await modifierPeriode({ id: p.id, ...valeurs });
                              toast[r.ok ? "success" : "error"](
                                r.ok ? "Période mise à jour." : (r.message ?? "Échec."),
                              );
                              return r.ok;
                            }}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <AlertDialog
        open={clotureCible !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert && !enCours) {
            setClotureCible(null);
            setMotifCloture("");
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clôturer l'année {clotureCible?.libelle} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette opération verrouille toutes les périodes de l'année et empêche la modification des notes. Elle ne
              peut pas être annulée depuis cette page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motif-cloture">Motif de clôture (obligatoire)</Label>
            <Textarea
              id="motif-cloture"
              value={motifCloture}
              onChange={(evenement) => setMotifCloture(evenement.target.value)}
              placeholder="Précisez pourquoi cette année est clôturée…"
              maxLength={500}
              rows={3}
              disabled={enCours}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={enCours || motifCloture.trim().length < 3}
              onClick={cloturer}
            >
              <Lock className="size-4" aria-hidden />
              {enCours ? "Clôture…" : "Confirmer la clôture"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LignePeriodeEditable({
  periode,
  anneeCloturee,
  peutGererPeriodes,
  peutDeverrouillerPeriodes,
  enCours,
  onBasculer,
  onEnregistrer,
}: {
  periode: LignePeriode;
  anneeCloturee: boolean;
  peutGererPeriodes: boolean;
  peutDeverrouillerPeriodes: boolean;
  enCours: boolean;
  onBasculer: (verrouiller: boolean) => void;
  onEnregistrer: (valeurs: { libelle: string; dateDebut: string; dateFin: string }) => Promise<boolean>;
}) {
  const [edition, setEdition] = useState(false);
  const [enregistrementEnCours, lancerEnregistrement] = useTransition();
  const [libelle, setLibelle] = useState(periode.libelle);
  const [debut, setDebut] = useState(periode.dateDebut);
  const [fin, setFin] = useState(periode.dateFin);

  if (edition) {
    return (
      <TableRow>
        <TableCell>
          <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} className="h-8" />
        </TableCell>
        <TableCell>
          <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="h-8" />
        </TableCell>
        <TableCell>
          <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="h-8" />
        </TableCell>
        <TableCell />
        <TableCell className="space-x-2 text-right">
          <Button
            size="sm"
            disabled={enCours || enregistrementEnCours}
            onClick={() => {
              lancerEnregistrement(async () => {
                const ok = await onEnregistrer({ libelle, dateDebut: debut, dateFin: fin });
                if (ok) setEdition(false);
              });
            }}
          >
            Enregistrer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdition(false)}>
            Annuler
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{periode.libelle}</TableCell>
      <TableCell className="tabular-nums">{dateFr(periode.dateDebut)}</TableCell>
      <TableCell className="tabular-nums">{dateFr(periode.dateFin)}</TableCell>
      <TableCell>
        {periode.estVerrouillee ? (
          <Badge variant="outline" className="gap-1">
            <Lock className="size-3" aria-hidden />
            Verrouillée
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <LockOpen className="size-3" aria-hidden />
            Ouverte
          </Badge>
        )}
      </TableCell>
      <TableCell className="space-x-2 text-right">
        {!anneeCloturee && (peutGererPeriodes || peutDeverrouillerPeriodes) ? (
          <>
            {peutGererPeriodes && !periode.estVerrouillee ? (
              <Button size="sm" variant="ghost" onClick={() => setEdition(true)} disabled={enCours}>
                Modifier
              </Button>
            ) : null}
            {(periode.estVerrouillee && peutDeverrouillerPeriodes) || (!periode.estVerrouillee && peutGererPeriodes) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={enCours}
                onClick={() => onBasculer(!periode.estVerrouillee)}
              >
                {periode.estVerrouillee ? "Déverrouiller" : "Verrouiller"}
              </Button>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground text-xs">{anneeCloturee ? "Année clôturée" : "Lecture seule"}</span>
        )}
      </TableCell>
    </TableRow>
  );
}
