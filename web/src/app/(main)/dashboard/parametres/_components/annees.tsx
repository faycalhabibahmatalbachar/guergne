"use client";

import { useState, useTransition } from "react";

import { CalendarRange, Lock, LockOpen, Plus, Star } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  basculerVerrouPeriode,
  cloturerAnnee,
  creerAnnee,
  definirAnneeCourante,
  modifierPeriode,
} from "../actions";
import type { LigneAnnee, LignePeriode } from "@/server/domain/parametres";

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export function OngletAnnees({
  annees,
  periodesParAnnee,
}: {
  annees: LigneAnnee[];
  periodesParAnnee: Record<string, LignePeriode[]>;
}) {
  const [enCours, demarrer] = useTransition();
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
      toast[r.ok ? "success" : "error"](
        r.ok ? `${libelle} est désormais l'année en cours.` : (r.message ?? "Échec."),
      );
    });
  }

  function cloturer(id: string, libelle: string) {
    const motif = window.prompt(
      `Clôturer définitivement ${libelle} ?\n\nToutes les périodes seront verrouillées et les notes deviendront non modifiables.\n\nMotif de la clôture :`,
    );
    if (!motif) return;

    demarrer(async () => {
      const r = await cloturerAnnee(id, motif);
      toast[r.ok ? "success" : "error"](r.ok ? `${libelle} clôturée.` : (r.message ?? "Échec."));
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
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus aria-hidden />
              Nouvelle année
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={soumettre}>
              <DialogHeader>
                <DialogTitle>Créer une année scolaire</DialogTitle>
                <DialogDescription>
                  Les périodes sont créées automatiquement et découpées à parts égales. Vous pourrez
                  ensuite ajuster leurs dates au calendrier réel.
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
                  {erreurs.libelle ? (
                    <p className="text-destructive text-sm">{erreurs.libelle}</p>
                  ) : null}
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
                    {erreurs.dateDebut ? (
                      <p className="text-destructive text-sm">{erreurs.dateDebut}</p>
                    ) : null}
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
                    {erreurs.dateFin ? (
                      <p className="text-destructive text-sm">{erreurs.dateFin}</p>
                    ) : null}
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
              L&apos;année scolaire est le socle de tout le reste : classes, inscriptions, notes et
              bulletins s&apos;y rattachent. Commencez par la créer.
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
                        Du {dateFr(annee.dateDebut)} au {dateFr(annee.dateFin)} — {annee.nbClasses}{" "}
                        classe{annee.nbClasses > 1 ? "s" : ""}, {annee.nbInscriptions} inscription
                        {annee.nbInscriptions > 1 ? "s" : ""}
                      </CardDescription>
                    </div>

                    <div className="flex gap-2">
                      {!annee.estCourante && !annee.estCloturee ? (
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
                      {!annee.estCloturee && !annee.estCourante ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={enCours}
                          onClick={() => cloturer(annee.id, annee.libelle)}
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
                            onEnregistrer={(valeurs) =>
                              demarrer(async () => {
                                const r = await modifierPeriode({ id: p.id, ...valeurs });
                                toast[r.ok ? "success" : "error"](
                                  r.ok ? "Période mise à jour." : (r.message ?? "Échec."),
                                );
                              })
                            }
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
    </div>
  );
}

function LignePeriodeEditable({
  periode,
  anneeCloturee,
  enCours,
  onBasculer,
  onEnregistrer,
}: {
  periode: LignePeriode;
  anneeCloturee: boolean;
  enCours: boolean;
  onBasculer: (verrouiller: boolean) => void;
  onEnregistrer: (valeurs: { libelle: string; dateDebut: string; dateFin: string }) => void;
}) {
  const [edition, setEdition] = useState(false);
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
            disabled={enCours}
            onClick={() => {
              onEnregistrer({ libelle, dateDebut: debut, dateFin: fin });
              setEdition(false);
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
        {!anneeCloturee ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEdition(true)} disabled={enCours}>
              Modifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={enCours}
              onClick={() => onBasculer(!periode.estVerrouillee)}
            >
              {periode.estVerrouillee ? "Déverrouiller" : "Verrouiller"}
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">Année clôturée</span>
        )}
      </TableCell>
    </TableRow>
  );
}
