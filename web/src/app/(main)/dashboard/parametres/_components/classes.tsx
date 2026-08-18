"use client";

import { useState, useTransition } from "react";

import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { creerClasse, modifierClasse, supprimerClasse } from "../actions";
import type {
  LigneAnnee,
  LigneClasseParametre,
  LigneNiveau,
  LigneSerie,
} from "@/server/domain/parametres";

export function OngletClasses({
  anneeCourante,
  classes,
  niveaux,
  series,
}: {
  anneeCourante: LigneAnnee | null;
  classes: LigneClasseParametre[];
  niveaux: LigneNiveau[];
  series: LigneSerie[];
}) {
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<LigneClasseParametre | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [niveauId, setNiveauId] = useState("");

  if (!anneeCourante) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-muted-foreground text-sm">
          Créez d&apos;abord une année scolaire et désignez-la comme année en cours.
        </CardContent>
      </Card>
    );
  }

  const niveauChoisi = niveaux.find((n) => n.id === (niveauId || edite?.niveauId));
  const seriesActives = series.filter((s) => s.active);

  function ouvrir(classe: LigneClasseParametre | null) {
    setEdite(classe);
    setNiveauId(classe?.niveauId ?? "");
    setErreurs({});
    setOuvert(true);
  }

  function soumettre(formulaire: FormData) {
    setErreurs({});
    const serie = String(formulaire.get("serieId") ?? "");
    const valeurs = {
      anneeId: anneeCourante!.id,
      niveauId: String(formulaire.get("niveauId") ?? ""),
      serieId: serie || null,
      libelle: String(formulaire.get("libelle") ?? ""),
      code: String(formulaire.get("code") ?? ""),
      capaciteMax: String(formulaire.get("capaciteMax") ?? "60"),
    };

    demarrer(async () => {
      const r = edite ? await modifierClasse(edite.id, valeurs) : await creerClasse(valeurs);
      if (r.ok) {
        toast.success(edite ? "Classe mise à jour." : "Classe créée.");
        setOuvert(false);
        setEdite(null);
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-lg">Classes</h2>
          <p className="text-muted-foreground text-sm">
            Année {anneeCourante.libelle} — {classes.length} classe{classes.length > 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => ouvrir(null)}>
          <Plus aria-hidden />
          Nouvelle classe
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {classes.length === 0 ? (
            <p className="py-14 text-center text-muted-foreground text-sm">
              Aucune classe. Créez-les de la 6ème à la Terminale.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Classe</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Série</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Effectif</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.libelle}</TableCell>
                    <TableCell className="text-muted-foreground">{c.niveauLibelle}</TableCell>
                    <TableCell>
                      {c.serieCode ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {c.serieCode}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {c.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {c.effectif} / {c.capaciteMax}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => ouvrir(c)}>
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={enCours || c.effectif > 0}
                        title={
                          c.effectif > 0
                            ? "Cette classe compte des élèves inscrits"
                            : "Supprimer la classe"
                        }
                        onClick={() => {
                          if (!window.confirm(`Supprimer définitivement ${c.libelle} ?`)) return;
                          demarrer(async () => {
                            const r = await supprimerClasse(c.id);
                            toast[r.ok ? "success" : "error"](
                              r.ok ? "Classe supprimée." : (r.message ?? "Échec."),
                            );
                          });
                        }}
                      >
                        <Trash2 aria-hidden />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={ouvert}
        onOpenChange={(v) => {
          setOuvert(v);
          if (!v) setEdite(null);
        }}
      >
        <DialogContent>
          <form action={soumettre}>
            <DialogHeader>
              <DialogTitle>{edite ? "Modifier la classe" : "Nouvelle classe"}</DialogTitle>
              <DialogDescription>
                La série ne s&apos;applique qu&apos;au lycée. Une 2nde indifférenciée se crée sans série.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="niveauId">Niveau</Label>
                <NativeSelect
                  id="niveauId"
                  name="niveauId"
                  defaultValue={edite?.niveauId ?? ""}
                  onChange={(e) => setNiveauId(e.target.value)}
                  required
                >
                  <option value="">Choisir…</option>
                  {niveaux.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.libelle}
                    </option>
                  ))}
                </NativeSelect>
                {erreurs.niveauId ? (
                  <p className="text-destructive text-sm">{erreurs.niveauId}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="serieId">Série</Label>
                <NativeSelect
                  id="serieId"
                  name="serieId"
                  defaultValue={edite?.serieId ?? ""}
                  disabled={!niveauChoisi?.seriesApplicables}
                >
                  <option value="">
                    {niveauChoisi?.seriesApplicables
                      ? "Sans série (indifférenciée)"
                      : "Sans objet au collège"}
                  </option>
                  {niveauChoisi?.seriesApplicables
                    ? seriesActives.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.libelle}
                        </option>
                      ))
                    : null}
                </NativeSelect>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="libelle">Libellé</Label>
                  <Input
                    id="libelle"
                    name="libelle"
                    defaultValue={edite?.libelle}
                    placeholder="Terminale D1"
                    required
                  />
                  {erreurs.libelle ? (
                    <p className="text-destructive text-sm">{erreurs.libelle}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" defaultValue={edite?.code} placeholder="TD1" required />
                  {erreurs.code ? <p className="text-destructive text-sm">{erreurs.code}</p> : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="capaciteMax">Capacité maximale</Label>
                <Input
                  id="capaciteMax"
                  name="capaciteMax"
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={edite?.capaciteMax ?? 60}
                  required
                />
                {erreurs.capaciteMax ? (
                  <p className="text-destructive text-sm">{erreurs.capaciteMax}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Toute inscription au-delà de cette capacité sera refusée.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
