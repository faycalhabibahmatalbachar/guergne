"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Eye, Lock, LockOpen, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ImportNotes } from "./import-notes";
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
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LigneEvaluation, LigneSaisie } from "@/server/domain/evaluations";

import {
  basculerVerrouEvaluation,
  changerStatutEvaluation,
  creerEvaluation,
  enregistrerNotes,
} from "../actions";

interface Option {
  id: string;
  libelle: string;
}

const TYPES = [
  { valeur: "INTERROGATION", libelle: "Interrogation" },
  { valeur: "DEVOIR", libelle: "Devoir surveillé" },
  { valeur: "COMPOSITION", libelle: "Composition" },
  { valeur: "EXAMEN_BLANC", libelle: "Examen blanc" },
  { valeur: "TP", libelle: "Travaux pratiques" },
  { valeur: "ORAL", libelle: "Oral" },
];

const STATUTS_NOTE = [
  { valeur: "NOTEE", libelle: "Notée" },
  { valeur: "ABSENT", libelle: "Absent (non compté)" },
  { valeur: "ABSENT_ZERO", libelle: "Absent sanctionné (0)" },
  { valeur: "NON_RENDU", libelle: "Non rendu (0)" },
  { valeur: "DISPENSE", libelle: "Dispensé (non compté)" },
];

const LIBELLE_TYPE = Object.fromEntries(TYPES.map((t) => [t.valeur, t.libelle]));
const dateFr = (v: string) => new Date(v).toLocaleDateString("fr-FR");

export function Notes({
  anneeId,
  periodeId,
  periodeLibelle,
  classes,
  matieres,
  evaluations,
  grille,
  evaluationId,
}: {
  anneeId: string;
  periodeId: string;
  periodeLibelle: string;
  classes: Option[];
  matieres: Option[];
  evaluations: LigneEvaluation[];
  grille: { evaluation: { id: string; titre: string; bareme: string; estVerrouillee: boolean }; lignes: LigneSaisie[] } | null;
  evaluationId: string | null;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  function soumettreEvaluation(f: FormData) {
    setErreurs({});
    demarrer(async () => {
      const r = await creerEvaluation({
        anneeId,
        periodeId,
        classeId: String(f.get("classeId") ?? ""),
        matiereId: String(f.get("matiereId") ?? ""),
        type: String(f.get("type") ?? "DEVOIR"),
        titre: String(f.get("titre") ?? ""),
        dateEvaluation: String(f.get("dateEvaluation") ?? ""),
        bareme: String(f.get("bareme") ?? "20"),
        poids: String(f.get("poids") ?? "1"),
        dureeMinutes: f.get("dureeMinutes") === "" ? null : f.get("dureeMinutes"),
        compteDansMoyenne: f.get("compteDansMoyenne") === "on",
      });
      if (r.ok && r.id) {
        toast.success("Évaluation créée.");
        setOuvert(false);
        routeur.push(`/dashboard/notes?evaluation=${r.id}`);
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {periodeLibelle} — {evaluations.length} évaluation{evaluations.length > 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setOuvert(true)}>
          <Plus aria-hidden />
          Nouvelle évaluation
        </Button>
      </div>

      {/* Grille de saisie */}
      {grille ? <GrilleSaisie grille={grille} /> : null}

      {/* Liste des évaluations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Évaluations de la période</CardTitle>
          <CardDescription>
            L&apos;avancement montre qui n&apos;a pas encore saisi — c&apos;est la question posée
            avant chaque conseil de classe.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {evaluations.length === 0 ? (
            <p className="py-14 text-center text-muted-foreground text-sm">
              Aucune évaluation. Créez-en une pour commencer la saisie des notes.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Évaluation</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Matière</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Avancement</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluations.map((e) => {
                  const taux = e.effectif > 0 ? (e.nbSaisies / e.effectif) * 100 : 0;
                  const complete = e.effectif > 0 && e.nbSaisies >= e.effectif;

                  return (
                    <TableRow
                      key={e.id}
                      className={e.id === evaluationId ? "bg-muted/50" : undefined}
                    >
                      <TableCell>
                        <span className="font-medium">{e.titre}</span>
                        <span className="block text-muted-foreground text-xs">
                          {LIBELLE_TYPE[e.type] ?? e.type} · /{Number(e.bareme)} · coef. {Number(e.poids)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.classe}</TableCell>
                      <TableCell className="text-muted-foreground">{e.matiere}</TableCell>
                      <TableCell className="tabular-nums">{dateFr(e.dateEvaluation)}</TableCell>
                      <TableCell className="w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={taux} className="w-20" />
                          <span className="text-xs tabular-nums">
                            {e.nbSaisies}/{e.effectif}
                          </span>
                        </div>
                        {e.nbSaisies > e.nbNotees ? (
                          <span className="text-muted-foreground text-xs">
                            {e.nbSaisies - e.nbNotees} absent(s)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            e.statut === "PUBLIEE"
                              ? "default"
                              : e.statut === "CORRIGEE"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {e.statut === "PUBLIEE"
                            ? "Publiée"
                            : e.statut === "CORRIGEE"
                              ? "Corrigée"
                              : e.statut === "PASSEE"
                                ? "Passée"
                                : e.statut === "PROGRAMMEE"
                                  ? "Programmée"
                                  : e.statut}
                        </Badge>
                        {e.estVerrouillee ? (
                          <Lock className="ml-1 inline size-3" aria-label="Verrouillée" />
                        ) : null}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => routeur.push(`/dashboard/notes?evaluation=${e.id}`)}
                        >
                          Saisir
                        </Button>

                        {complete && e.statut !== "PUBLIEE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={enCours}
                            onClick={() =>
                              demarrer(async () => {
                                const r = await changerStatutEvaluation(e.id, "PUBLIEE");
                                toast[r.ok ? "success" : "error"](
                                  r.message ?? (r.ok ? "Publiée." : "Échec."),
                                );
                                routeur.refresh();
                              })
                            }
                          >
                            <Eye aria-hidden />
                            Publier
                          </Button>
                        ) : null}

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={enCours}
                          title={e.estVerrouillee ? "Déverrouiller" : "Verrouiller"}
                          onClick={() =>
                            demarrer(async () => {
                              const r = await basculerVerrouEvaluation(e.id, !e.estVerrouillee);
                              toast[r.ok ? "success" : "error"](
                                r.ok
                                  ? e.estVerrouillee
                                    ? "Déverrouillée."
                                    : "Verrouillée."
                                  : (r.message ?? "Échec."),
                              );
                              routeur.refresh();
                            })
                          }
                        >
                          {e.estVerrouillee ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
                          <span className="sr-only">
                            {e.estVerrouillee ? "Déverrouiller" : "Verrouiller"}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Création d'évaluation */}
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form action={soumettreEvaluation}>
            <DialogHeader>
              <DialogTitle>Nouvelle évaluation</DialogTitle>
              <DialogDescription>
                Le barème sert au contrôle de saisie ; les notes sont ramenées sur 20 pour le calcul
                des moyennes.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="classeId">Classe *</Label>
                  <NativeSelect id="classeId" name="classeId" required>
                    <option value="">Choisir…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                  {erreur("classeId")}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="matiereId">Matière *</Label>
                  <NativeSelect id="matiereId" name="matiereId" required>
                    <option value="">Choisir…</option>
                    {matieres.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                  {erreur("matiereId")}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="titre">Titre *</Label>
                <Input id="titre" name="titre" placeholder="Composition n°1 — Dérivées" required />
                {erreur("titre")}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">Type *</Label>
                  <NativeSelect id="type" name="type" defaultValue="DEVOIR">
                    {TYPES.map((t) => (
                      <option key={t.valeur} value={t.valeur}>
                        {t.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dateEvaluation">Date *</Label>
                  <Input
                    id="dateEvaluation"
                    name="dateEvaluation"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="bareme">Barème</Label>
                  <Input id="bareme" name="bareme" type="number" min={1} max={100} defaultValue={20} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="poids">Poids</Label>
                  <Input
                    id="poids"
                    name="poids"
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    defaultValue={1}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dureeMinutes">Durée (min)</Label>
                  <Input id="dureeMinutes" name="dureeMinutes" type="number" min={1} max={480} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="compteDansMoyenne"
                  defaultChecked
                  className="size-4 accent-primary"
                />
                Compte dans la moyenne
              </label>
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
  );
}

/**
 * Grille de saisie.
 *
 * Navigation au clavier : Entrée passe à l'élève suivant. Une secrétaire ou un
 * professeur saisit 60 notes d'affilée ; devoir attraper la souris entre
 * chaque ligne double le temps de saisie.
 */
function GrilleSaisie({
  grille,
}: {
  grille: {
    evaluation: { id: string; titre: string; bareme: string; estVerrouillee: boolean };
    lignes: LigneSaisie[];
  };
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const bareme = Number(grille.evaluation.bareme);

  const [valeurs, setValeurs] = useState<Record<string, { valeur: string; statut: string }>>(
    Object.fromEntries(
      grille.lignes.map((l) => [
        l.inscriptionId,
        { valeur: l.valeur ? String(Number(l.valeur)) : "", statut: l.statut ?? "NOTEE" },
      ]),
    ),
  );

  const maj = (id: string, champ: "valeur" | "statut", v: string) =>
    setValeurs((p) => ({ ...p, [id]: { ...p[id], [champ]: v } }));

  function enregistrer() {
    demarrer(async () => {
      const r = await enregistrerNotes({
        evaluationId: grille.evaluation.id,
        lignes: grille.lignes.map((l) => {
          const v = valeurs[l.inscriptionId];
          return {
            inscriptionId: l.inscriptionId,
            valeur: v.statut === "NOTEE" && v.valeur !== "" ? Number(v.valeur) : null,
            statut: v.statut,
          };
        }),
      });
      toast[r.ok ? "success" : "error"](r.message ?? (r.ok ? "Enregistré." : "Échec."));
      if (r.ok) routeur.refresh();
    });
  }

  const saisies = Object.values(valeurs).filter(
    (v) => v.statut !== "NOTEE" || v.valeur !== "",
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{grille.evaluation.titre}</CardTitle>
            <CardDescription>
              Barème /{bareme} — {saisies} / {grille.lignes.length} élèves saisis
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {/*
              L'import est à côté de l'enregistrement, pas dans un menu : un
              professeur qui a déjà sa grille dans un tableur doit le voir tout
              de suite, sinon il ressaisit tout à la main.
            */}
            <ImportNotes
              evaluationId={grille.evaluation.id}
              titre={grille.evaluation.titre}
              verrouillee={grille.evaluation.estVerrouillee}
            />
            <Button onClick={enregistrer} disabled={enCours || grille.evaluation.estVerrouillee}>
              <Save aria-hidden />
              {enCours ? "Enregistrement…" : "Enregistrer les notes"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {grille.evaluation.estVerrouillee ? (
          <p className="border-amber-500/40 border-y bg-amber-500/10 px-4 py-2 text-amber-700 text-sm dark:text-amber-400">
            Cette évaluation est verrouillée : les notes ne sont plus modifiables.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Élève</TableHead>
              <TableHead className="w-32">Note /{bareme}</TableHead>
              <TableHead className="w-56">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grille.lignes.map((l, index) => {
              const v = valeurs[l.inscriptionId];
              const horsBareme = v.valeur !== "" && Number(v.valeur) > bareme;

              return (
                <TableRow key={l.inscriptionId}>
                  <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {l.prenom} {l.nom}
                    </span>
                    <span className="block text-muted-foreground text-xs">{l.matricule}</span>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={bareme}
                      step={0.25}
                      value={v.valeur}
                      disabled={v.statut !== "NOTEE" || grille.evaluation.estVerrouillee}
                      aria-label={`Note de ${l.prenom} ${l.nom}`}
                      aria-invalid={horsBareme}
                      className={`h-8 tabular-nums ${horsBareme ? "border-destructive" : ""}`}
                      onChange={(e) => maj(l.inscriptionId, "valeur", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const suivant = grille.lignes[index + 1];
                        if (!suivant) return;
                        document
                          .querySelector<HTMLInputElement>(
                            `[aria-label="Note de ${suivant.prenom} ${suivant.nom}"]`,
                          )
                          ?.focus();
                      }}
                    />
                    {horsBareme ? (
                      <p className="text-destructive text-xs">Au-delà du barème</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      value={v.statut}
                      disabled={grille.evaluation.estVerrouillee}
                      aria-label={`Statut de ${l.prenom} ${l.nom}`}
                      onChange={(e) => maj(l.inscriptionId, "statut", e.target.value)}
                      className="h-8"
                    >
                      {STATUTS_NOTE.map((s) => (
                        <option key={s.valeur} value={s.valeur}>
                          {s.libelle}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
