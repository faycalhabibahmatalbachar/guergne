"use client";

import { useState, useTransition } from "react";

import { Plus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { basculerMatiere, basculerSerie, creerMatiere, creerSerie, modifierMatiere } from "../actions";
import type { LigneMatiere, LigneSerie } from "@/server/domain/parametres";

export function OngletMatieres({
  matieres,
  series,
}: {
  matieres: LigneMatiere[];
  series: LigneSerie[];
}) {
  return (
    <div className="space-y-8">
      <BlocMatieres matieres={matieres} />
      <BlocSeries series={series} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function BlocMatieres({ matieres }: { matieres: LigneMatiere[] }) {
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<LigneMatiere | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  function soumettre(formulaire: FormData) {
    setErreurs({});
    const valeurs = {
      code: String(formulaire.get("code") ?? ""),
      libelle: String(formulaire.get("libelle") ?? ""),
      libelleCourt: String(formulaire.get("libelleCourt") ?? ""),
      couleur: String(formulaire.get("couleur") ?? "#64748b"),
      ordreBulletin: String(formulaire.get("ordreBulletin") ?? "0"),
    };

    demarrer(async () => {
      const r = edite ? await modifierMatiere(edite.id, valeurs) : await creerMatiere(valeurs);
      if (r.ok) {
        toast.success(edite ? "Matière mise à jour." : "Matière créée.");
        setOuvert(false);
        setEdite(null);
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  function ouvrir(matiere: LigneMatiere | null) {
    setEdite(matiere);
    setErreurs({});
    setOuvert(true);
  }

  const ordreSuivant = Math.max(0, ...matieres.map((m) => m.ordreBulletin)) + 1;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-lg">Matières</h2>
          <p className="text-muted-foreground text-sm">
            L&apos;ordre détermine la position de la matière sur le bulletin.
          </p>
        </div>
        <Button size="sm" onClick={() => ouvrir(null)}>
          <Plus aria-hidden />
          Nouvelle matière
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordre</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Coefficients saisis</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matieres.map((m) => (
                <TableRow key={m.id} className={m.active ? undefined : "opacity-55"}>
                  <TableCell className="tabular-nums">{m.ordreBulletin}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: m.couleur ?? "#64748b" }}
                      />
                      {m.libelle}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {m.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {m.nbCoefficients > 0 ? (
                      m.nbCoefficients
                    ) : (
                      <span className="text-amber-600 text-xs dark:text-amber-400">aucun</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.active}
                      disabled={enCours}
                      aria-label={`Activer ${m.libelle}`}
                      onCheckedChange={(valeur) =>
                        demarrer(async () => {
                          const r = await basculerMatiere(m.id, valeur);
                          if (!r.ok) toast.error(r.message ?? "Échec.");
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => ouvrir(m)}>
                      Modifier
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              <DialogTitle>{edite ? "Modifier la matière" : "Nouvelle matière"}</DialogTitle>
              <DialogDescription>
                Le code sert aux imports et aux exports ; il doit rester stable dans le temps.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" defaultValue={edite?.code} placeholder="MATH" required />
                  {erreurs.code ? <p className="text-destructive text-sm">{erreurs.code}</p> : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ordreBulletin">Ordre au bulletin</Label>
                  <Input
                    id="ordreBulletin"
                    name="ordreBulletin"
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={edite?.ordreBulletin ?? ordreSuivant}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="libelle">Libellé</Label>
                <Input
                  id="libelle"
                  name="libelle"
                  defaultValue={edite?.libelle}
                  placeholder="Mathématiques"
                  required
                />
                {erreurs.libelle ? <p className="text-destructive text-sm">{erreurs.libelle}</p> : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="libelleCourt">Libellé court</Label>
                  <Input
                    id="libelleCourt"
                    name="libelleCourt"
                    defaultValue={edite?.libelleCourt ?? ""}
                    placeholder="Maths"
                  />
                  <p className="text-muted-foreground text-xs">Utilisé quand la place manque.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="couleur">Couleur</Label>
                  <Input
                    id="couleur"
                    name="couleur"
                    type="color"
                    defaultValue={edite?.couleur ?? "#64748b"}
                    className="h-9 w-full"
                  />
                </div>
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
    </section>
  );
}

// ---------------------------------------------------------------------------

function BlocSeries({ series }: { series: LigneSerie[] }) {
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  function soumettre(formulaire: FormData) {
    setErreurs({});
    demarrer(async () => {
      const r = await creerSerie({
        code: String(formulaire.get("code") ?? ""),
        libelle: String(formulaire.get("libelle") ?? ""),
        description: String(formulaire.get("description") ?? ""),
      });
      if (r.ok) {
        toast.success("Série créée.");
        setOuvert(false);
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-lg">Séries</h2>
          <p className="text-muted-foreground text-sm">
            Les séries ne concernent que le lycée. Une classe peut n&apos;en avoir aucune — c&apos;est
            le cas du collège et d&apos;une 2nde indifférenciée.
          </p>
        </div>
        <Dialog open={ouvert} onOpenChange={setOuvert}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus aria-hidden />
              Nouvelle série
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={soumettre}>
              <DialogHeader>
                <DialogTitle>Nouvelle série</DialogTitle>
                <DialogDescription>
                  Par exemple S (scientifique), L (littéraire), A ou D.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="serie-code">Code</Label>
                  <Input id="serie-code" name="code" placeholder="S" required />
                  {erreurs.code ? <p className="text-destructive text-sm">{erreurs.code}</p> : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="serie-libelle">Libellé</Label>
                  <Input
                    id="serie-libelle"
                    name="libelle"
                    placeholder="Série S — Scientifique"
                    required
                  />
                  {erreurs.libelle ? (
                    <p className="text-destructive text-sm">{erreurs.libelle}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="serie-description">Description</Label>
                  <Input id="serie-description" name="description" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={enCours}>
                  {enCours ? "Création…" : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((s) => (
                <TableRow key={s.id} className={s.active ? undefined : "opacity-55"}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {s.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{s.libelle}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.active}
                      disabled={enCours}
                      aria-label={`Activer ${s.libelle}`}
                      onCheckedChange={(valeur) =>
                        demarrer(async () => {
                          const r = await basculerSerie(s.id, valeur);
                          if (!r.ok) toast.error(r.message ?? "Échec.");
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
