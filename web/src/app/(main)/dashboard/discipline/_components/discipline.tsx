"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Gavel, Plus, ShieldAlert } from "lucide-react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { EleveClasse, LigneIncident, LigneSanction } from "@/server/domain/vie-scolaire";

import { marquerSanctionExecutee, prononcerSanction, signalerIncident } from "../../assiduite/actions";

interface Option {
  id: string;
  libelle: string;
}

const GRAVITES = [
  { valeur: "MINEURE", libelle: "Mineure", ton: "secondary" as const },
  { valeur: "MOYENNE", libelle: "Moyenne", ton: "secondary" as const },
  { valeur: "GRAVE", libelle: "Grave", ton: "destructive" as const },
  { valeur: "TRES_GRAVE", libelle: "Très grave", ton: "destructive" as const },
];

/**
 * Types de sanction, de la plus légère à la plus lourde.
 * Les deux dernières changent le statut de l'élève : on le signale à
 * l'utilisateur avant qu'il ne valide, pas après.
 */
const SANCTIONS = [
  { valeur: "AVERTISSEMENT_ORAL", libelle: "Avertissement oral" },
  { valeur: "AVERTISSEMENT_ECRIT", libelle: "Avertissement écrit" },
  { valeur: "RETENUE", libelle: "Retenue" },
  { valeur: "TRAVAIL_INTERET_GENERAL", libelle: "Travail d'intérêt général" },
  { valeur: "EXCLUSION_COURS", libelle: "Exclusion de cours" },
  { valeur: "CONSEIL_DISCIPLINE", libelle: "Renvoi en conseil de discipline" },
  { valeur: "EXCLUSION_TEMPORAIRE", libelle: "Exclusion temporaire (suspend l'élève)" },
  { valeur: "EXCLUSION_DEFINITIVE", libelle: "Exclusion définitive (exclut l'élève)" },
];

const LIBELLE_SANCTION = Object.fromEntries(SANCTIONS.map((s) => [s.valeur, s.libelle]));
const LIBELLE_GRAVITE = Object.fromEntries(GRAVITES.map((g) => [g.valeur, g.libelle]));
const TON_GRAVITE = Object.fromEntries(GRAVITES.map((g) => [g.valeur, g.ton]));

const dateFr = (v: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");

export function Discipline({
  periodeId,
  classes,
  classeId,
  eleves,
  incidents,
  sanctions,
}: {
  periodeId: string;
  classes: Option[];
  classeId: string | null;
  eleves: EleveClasse[];
  incidents: LigneIncident[];
  sanctions: LigneSanction[];
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [dialogueIncident, setDialogueIncident] = useState(false);
  const [dialogueSanction, setDialogueSanction] = useState<{ incidentId: string | null } | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [typeSanction, setTypeSanction] = useState("AVERTISSEMENT_ECRIT");

  const exigeDateFin = typeSanction === "EXCLUSION_TEMPORAIRE";
  const impacteStatut = exigeDateFin || typeSanction === "EXCLUSION_DEFINITIVE";

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  function soumettreIncident(f: FormData) {
    setErreurs({});
    demarrer(async () => {
      const r = await signalerIncident({
        inscriptionId: String(f.get("inscriptionId") ?? ""),
        periodeId,
        dateIncident: String(f.get("dateIncident") ?? ""),
        heureIncident: String(f.get("heureIncident") ?? ""),
        lieu: String(f.get("lieu") ?? ""),
        gravite: String(f.get("gravite") ?? "MINEURE"),
        description: String(f.get("description") ?? ""),
        temoins: String(f.get("temoins") ?? ""),
      });
      if (r.ok) {
        toast.success("Incident enregistré.");
        setDialogueIncident(false);
        routeur.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  function soumettreSanction(f: FormData) {
    setErreurs({});
    demarrer(async () => {
      const r = await prononcerSanction({
        inscriptionId: String(f.get("inscriptionId") ?? ""),
        incidentId: dialogueSanction?.incidentId ?? null,
        periodeId,
        type: typeSanction,
        motif: String(f.get("motif") ?? ""),
        dateDebut: String(f.get("dateDebut") ?? ""),
        dateFin: String(f.get("dateFin") ?? ""),
      });
      if (r.ok) {
        toast.success(r.message ?? "Sanction prononcée.");
        setDialogueSanction(null);
        routeur.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  /** Sélecteur d'élève : classe puis élève, comme au secrétariat. */
  const SelecteurEleve = () => (
    <>
      <div className="grid gap-2">
        <Label htmlFor="classe-sel">Classe</Label>
        <NativeSelect
          id="classe-sel"
          value={classeId ?? ""}
          onChange={(e) => routeur.push(`/dashboard/discipline?classe=${e.target.value}`)}
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
        <Label htmlFor="inscriptionId">Élève *</Label>
        <NativeSelect id="inscriptionId" name="inscriptionId" required disabled={!classeId}>
          <option value="">{classeId ? "Choisir…" : "Choisissez d'abord une classe"}</option>
          {eleves.map((e) => (
            <option key={e.inscriptionId} value={e.inscriptionId}>
              {e.prenom} {e.nom} — {e.matricule}
            </option>
          ))}
        </NativeSelect>
        {erreur("inscriptionId")}
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="incidents">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
            <TabsTrigger value="sanctions">Sanctions ({sanctions.length})</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialogueIncident(true)}>
              <ShieldAlert aria-hidden />
              Signaler un incident
            </Button>
            <Button size="sm" onClick={() => setDialogueSanction({ incidentId: null })}>
              <Gavel aria-hidden />
              Prononcer une sanction
            </Button>
          </div>
        </div>

        {/* --- Incidents --- */}
        <TabsContent value="incidents" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {incidents.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucun incident signalé sur cette période.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Gravité</TableHead>
                      <TableHead>Faits</TableHead>
                      <TableHead className="text-right">Suite</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/eleves/${i.eleveId}`}
                            className="font-medium hover:underline"
                          >
                            {i.prenom} {i.nom}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{i.classe}</TableCell>
                        <TableCell className="tabular-nums">{dateFr(i.dateIncident)}</TableCell>
                        <TableCell>
                          <Badge variant={TON_GRAVITE[i.gravite] ?? "outline"}>
                            {LIBELLE_GRAVITE[i.gravite] ?? i.gravite}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="truncate text-sm" title={i.description}>
                            {i.description}
                          </p>
                          {i.lieu ? (
                            <p className="text-muted-foreground text-xs">{i.lieu}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {i.nbSanctions > 0 ? (
                            <Badge variant="outline">
                              {i.nbSanctions} sanction{i.nbSanctions > 1 ? "s" : ""}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialogueSanction({ incidentId: i.id })}
                            >
                              Sanctionner
                            </Button>
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

        {/* --- Sanctions --- */}
        <TabsContent value="sanctions" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {sanctions.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucune sanction prononcée sur cette période.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Sanction</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead className="text-right">Exécution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sanctions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/eleves/${s.eleveId}`}
                            className="font-medium hover:underline"
                          >
                            {s.prenom} {s.nom}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.classe}</TableCell>
                        <TableCell>
                          <Badge variant={s.impacteStatut ? "destructive" : "secondary"}>
                            {LIBELLE_SANCTION[s.type] ?? s.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">
                          {dateFr(s.dateDebut)}
                          {s.dateFin ? ` → ${dateFr(s.dateFin)}` : ""}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="truncate text-sm" title={s.motif}>
                            {s.motif}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {s.executee ? (
                            <Badge variant="outline">Exécutée</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={enCours}
                              onClick={() =>
                                demarrer(async () => {
                                  const r = await marquerSanctionExecutee(s.id);
                                  toast[r.ok ? "success" : "error"](
                                    r.ok ? "Sanction marquée exécutée." : (r.message ?? "Échec."),
                                  );
                                  routeur.refresh();
                                })
                              }
                            >
                              Marquer exécutée
                            </Button>
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
      </Tabs>

      {/* Signalement d'incident */}
      <Dialog open={dialogueIncident} onOpenChange={setDialogueIncident}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form action={soumettreIncident}>
            <DialogHeader>
              <DialogTitle>Signaler un incident</DialogTitle>
              <DialogDescription>
                Décrivez les faits, pas l&apos;élève. Ce texte peut être relu en conseil de discipline
                et communiqué à la famille.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <SelecteurEleve />

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="dateIncident">Date *</Label>
                  <Input
                    id="dateIncident"
                    name="dateIncident"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="heureIncident">Heure</Label>
                  <Input id="heureIncident" name="heureIncident" type="time" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="lieu">Lieu</Label>
                  <Input id="lieu" name="lieu" placeholder="Salle 3, cour, couloir…" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gravite">Gravité *</Label>
                  <NativeSelect id="gravite" name="gravite" defaultValue="MINEURE">
                    {GRAVITES.map((g) => (
                      <option key={g.valeur} value={g.valeur}>
                        {g.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description des faits *</Label>
                <Textarea id="description" name="description" rows={4} required />
                {erreur("description")}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="temoins">Témoins</Label>
                <Input id="temoins" name="temoins" />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer l'incident"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sanction */}
      <Dialog open={dialogueSanction !== null} onOpenChange={(v) => !v && setDialogueSanction(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form action={soumettreSanction}>
            <DialogHeader>
              <DialogTitle>Prononcer une sanction</DialogTitle>
              <DialogDescription>
                {dialogueSanction?.incidentId
                  ? "Cette sanction sera rattachée à l'incident sélectionné."
                  : "Sanction sans incident rattaché."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <SelecteurEleve />

              <div className="grid gap-2">
                <Label htmlFor="type">Type de sanction *</Label>
                <NativeSelect
                  id="type"
                  value={typeSanction}
                  onChange={(e) => setTypeSanction(e.target.value)}
                >
                  {SANCTIONS.map((s) => (
                    <option key={s.valeur} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </NativeSelect>
                {impacteStatut ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
                    Cette sanction change le statut de l&apos;élève et sera notifiée aux tuteurs.
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="dateDebut">Date de début *</Label>
                  <Input
                    id="dateDebut"
                    name="dateDebut"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dateFin">
                    Date de fin {exigeDateFin ? "*" : ""}
                  </Label>
                  <Input id="dateFin" name="dateFin" type="date" required={exigeDateFin} />
                  {erreur("dateFin")}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="motif">Motif *</Label>
                <Textarea id="motif" name="motif" rows={3} required />
                {erreur("motif")}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={enCours}
                variant={typeSanction === "EXCLUSION_DEFINITIVE" ? "destructive" : "default"}
              >
                {enCours ? "Enregistrement…" : "Prononcer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
