"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AlerteAssiduite,
  EleveClasse,
  LigneAbsence,
} from "@/server/domain/vie-scolaire";

import { enregistrerAppel, justifierAbsence } from "../actions";

interface Option {
  id: string;
  libelle: string;
}

const dateFr = (v: string) => new Date(v).toLocaleDateString("fr-FR");

export function Assiduite({
  periodeId,
  classes,
  matieres,
  classeId,
  eleves,
  absences,
  alertes,
  stats,
}: {
  periodeId: string;
  classes: Option[];
  matieres: Option[];
  classeId: string | null;
  eleves: EleveClasse[];
  absences: LigneAbsence[];
  alertes: AlerteAssiduite[];
  stats: {
    absencesJour: number;
    retardsJour: number;
    nonJustifiees: number;
    incidentsPeriode: number;
    alertes: number;
  };
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [absents, setAbsents] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [matiereId, setMatiereId] = useState("");
  const [nbHeures, setNbHeures] = useState("1");

  function basculer(id: string) {
    setAbsents((s) => {
      const copie = new Set(s);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  }

  function soumettreAppel() {
    demarrer(async () => {
      const r = await enregistrerAppel({
        periodeId,
        dateAbsence: date,
        matiereId: matiereId || null,
        nbHeures,
        absents: [...absents],
      });
      if (r.ok) {
        toast.success(r.message ?? "Appel enregistré.");
        setAbsents(new Set());
        routeur.refresh();
      } else {
        toast.error(r.message ?? "Échec.");
      }
    });
  }

  const KPI = [
    { libelle: "Absences aujourd'hui", valeur: stats.absencesJour },
    { libelle: "Retards aujourd'hui", valeur: stats.retardsJour },
    { libelle: "Non justifiées (période)", valeur: stats.nonJustifiees, alerte: stats.nonJustifiees > 0 },
    { libelle: "Élèves au-delà du seuil", valeur: stats.alertes, alerte: stats.alertes > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI.map((k) => (
          <Card key={k.libelle}>
            <CardContent className="py-4">
              <p className="text-muted-foreground text-xs">{k.libelle}</p>
              <p
                className={`mt-1 font-semibold text-2xl tabular-nums ${
                  k.alerte ? "text-amber-600 dark:text-amber-400" : ""
                }`}
              >
                {k.valeur}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="appel">
        <TabsList>
          <TabsTrigger value="appel">Faire l&apos;appel</TabsTrigger>
          <TabsTrigger value="absences">Absences ({absences.length})</TabsTrigger>
          <TabsTrigger value="alertes">Alertes ({alertes.length})</TabsTrigger>
        </TabsList>

        {/* --- Appel --- */}
        <TabsContent value="appel" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Feuille d&apos;appel</CardTitle>
              <CardDescription>
                Tout le monde est présent par défaut : ne cochez que les absents. Chaque absence
                déclenche une notification aux tuteurs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="classe">Classe</Label>
                  <NativeSelect
                    id="classe"
                    value={classeId ?? ""}
                    onChange={(e) => routeur.push(`/dashboard/assiduite?classe=${e.target.value}`)}
                    className="w-48"
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
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="matiere">Matière</Label>
                  <NativeSelect
                    id="matiere"
                    value={matiereId}
                    onChange={(e) => setMatiereId(e.target.value)}
                    className="w-48"
                  >
                    <option value="">Journée entière</option>
                    {matieres.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="heures">Heures</Label>
                  <Input
                    id="heures"
                    type="number"
                    min={0.5}
                    max={12}
                    step={0.5}
                    value={nbHeures}
                    onChange={(e) => setNbHeures(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>

              {!classeId ? (
                <p className="py-8 text-center text-muted-foreground text-sm">
                  Choisissez une classe pour afficher sa liste.
                </p>
              ) : eleves.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground text-sm">
                  Aucun élève inscrit dans cette classe.
                </p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {eleves.map((e) => {
                      const absent = absents.has(e.inscriptionId);
                      return (
                        <button
                          key={e.inscriptionId}
                          type="button"
                          onClick={() => basculer(e.inscriptionId)}
                          className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            absent
                              ? "border-destructive/50 bg-destructive/10"
                              : "hover:bg-muted"
                          }`}
                        >
                          <span>
                            <span className="font-medium">
                              {e.prenom} {e.nom}
                            </span>
                            <span className="block text-muted-foreground text-xs">{e.matricule}</span>
                          </span>
                          {absent ? (
                            <Badge variant="destructive" className="gap-1">
                              <X className="size-3" aria-hidden />
                              Absent
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Check className="size-3" aria-hidden />
                              Présent
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t pt-4">
                    <p className="text-muted-foreground text-sm">
                      {absents.size === 0
                        ? "Aucun absent signalé."
                        : `${absents.size} absent(s) sur ${eleves.length}.`}
                    </p>
                    <Button onClick={soumettreAppel} disabled={enCours}>
                      <ClipboardCheck aria-hidden />
                      {enCours ? "Enregistrement…" : "Enregistrer l'appel"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Absences --- */}
        <TabsContent value="absences" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {absences.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucune absence enregistrée sur cette période.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Heures</TableHead>
                      <TableHead>Matière</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absences.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/eleves/${a.eleveId}`}
                            className="font-medium hover:underline"
                          >
                            {a.prenom} {a.nom}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.classe}</TableCell>
                        <TableCell className="tabular-nums">{dateFr(a.dateAbsence)}</TableCell>
                        <TableCell className="tabular-nums">{Number(a.nbHeures)} h</TableCell>
                        <TableCell className="text-muted-foreground">{a.matiere ?? "Journée"}</TableCell>
                        <TableCell>
                          <Badge variant={a.statut === "JUSTIFIEE" ? "secondary" : "destructive"}>
                            {a.statut === "JUSTIFIEE" ? "Justifiée" : "Non justifiée"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {a.statut !== "JUSTIFIEE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={enCours}
                              onClick={() => {
                                const motif = window.prompt("Motif de la justification :");
                                if (!motif) return;
                                demarrer(async () => {
                                  const r = await justifierAbsence(a.id, "JUSTIFIEE", motif);
                                  toast[r.ok ? "success" : "error"](
                                    r.ok ? "Absence justifiée." : (r.message ?? "Échec."),
                                  );
                                  routeur.refresh();
                                });
                              }}
                            >
                              Justifier
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">{a.motif}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Alertes --- */}
        <TabsContent value="alertes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
                Élèves au-delà du seuil
              </CardTitle>
              <CardDescription>
                Le seuil d&apos;heures non justifiées est fixé dans les paramètres de
                l&apos;établissement. Ces situations appellent une convocation des tuteurs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {alertes.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucun élève n&apos;a atteint le seuil d&apos;alerte.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead>Non justifiées</TableHead>
                      <TableHead>Justifiées</TableHead>
                      <TableHead>Retards</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertes.map((a) => (
                      <TableRow key={`${a.eleveId}-${a.periode}`}>
                        <TableCell>
                          <Link
                            href={`/dashboard/eleves/${a.eleveId}`}
                            className="font-medium hover:underline"
                          >
                            {a.prenom} {a.nom}
                          </Link>
                          <span className="block text-muted-foreground text-xs">{a.matricule}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.classe}</TableCell>
                        <TableCell className="text-muted-foreground">{a.periode}</TableCell>
                        <TableCell className="font-medium text-amber-600 tabular-nums dark:text-amber-400">
                          {Number(a.heuresNonJustifiees)} h
                          <span className="text-muted-foreground"> / {a.seuil} h</span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {Number(a.heuresJustifiees)} h
                        </TableCell>
                        <TableCell className="tabular-nums">{a.nbRetards}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
