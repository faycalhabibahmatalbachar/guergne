"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CheckCircle2, ClipboardList, Eye, FilePenLine, Lock, LockKeyhole, LockOpen, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { BoutonDupliquer } from "./dupliquer";

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
  classeFiltreeId,
  dateDebutPeriode,
  dateFinPeriode,
  classes,
  matieres,
  evaluations,
  grille,
  evaluationId,
}: {
  anneeId: string;
  periodeId: string;
  periodeLibelle: string;
  classeFiltreeId: string;
  dateDebutPeriode: string;
  dateFinPeriode: string;
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
  const maintenant = new Date();
  const aujourdHui = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}-${String(maintenant.getDate()).padStart(2, "0")}`;
  // La date par défaut doit appartenir à la période choisie, même pendant les vacances.
  const dateEvaluationParDefaut =
    aujourdHui < dateDebutPeriode ? dateDebutPeriode
    : aujourdHui > dateFinPeriode ? dateFinPeriode
    : aujourdHui;

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  const evaluationsTerminees = evaluations.filter((e) => e.effectif > 0 && e.nbSaisies >= e.effectif).length;
  const saisiesTotales = evaluations.reduce((total, e) => total + e.nbSaisies, 0);
  const attenduesTotales = evaluations.reduce((total, e) => total + e.effectif, 0);
  const tauxSaisie = attenduesTotales > 0 ? Math.round((saisiesTotales / attenduesTotales) * 100) : 0;
  const evaluationsVerrouillees = evaluations.filter((e) => e.estVerrouillee).length;

  function soumettreEvaluation(f: FormData) {
    setErreurs({});
    const classeSelectionnee = String(f.get("classeId") ?? classeFiltreeId);
    demarrer(async () => {
      const r = await creerEvaluation({
        anneeId,
        periodeId,
        classeId: classeSelectionnee,
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
        const params = new URLSearchParams({ evaluation: r.id, periode: periodeId });
        if (classeSelectionnee) params.set("classe", classeSelectionnee);
        routeur.push(`/dashboard/notes?${params.toString()}`);
      } else {
        setErreurs(r.erreurs ?? {});
        if (r.message) toast.error(r.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600 dark:text-slate-300">Suivi de la période</p>
          <p className="mt-1 text-sm font-medium">{periodeLibelle} · {evaluations.length} évaluation{evaluations.length > 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={() => setOuvert(true)}><Plus aria-hidden />Nouvelle évaluation</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-700 dark:text-cyan-300"><ClipboardList className="size-5" aria-hidden /></div><div><p className="text-slate-600 dark:text-slate-300 text-xs">Évaluations</p><p className="text-2xl font-semibold tabular-nums">{evaluations.length}</p><p className="text-slate-600 dark:text-slate-300 text-xs">Sur la période active</p></div></CardContent></Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-5" aria-hidden /></div><div><p className="text-slate-600 dark:text-slate-300 text-xs">Saisie effectuée</p><p className="text-2xl font-semibold tabular-nums">{saisiesTotales} / {attenduesTotales}</p><p className="text-slate-600 dark:text-slate-300 text-xs">{tauxSaisie}% des saisies attendues</p></div></CardContent></Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-700 dark:text-indigo-300"><FilePenLine className="size-5" aria-hidden /></div><div><p className="text-slate-600 dark:text-slate-300 text-xs">Complètes</p><p className="text-2xl font-semibold tabular-nums">{evaluationsTerminees}</p><p className="text-slate-600 dark:text-slate-300 text-xs">Évaluations entièrement saisies</p></div></CardContent></Card>
        <Card className="h-full rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300"><LockKeyhole className="size-5" aria-hidden /></div><div><p className="text-slate-600 dark:text-slate-300 text-xs">Verrouillées</p><p className="text-2xl font-semibold tabular-nums">{evaluationsVerrouillees}</p><p className="text-slate-600 dark:text-slate-300 text-xs">Évaluations protégées</p></div></CardContent></Card>
      </div>
      {/* Grille de saisie */}
      {grille ? <GrilleSaisie grille={grille} /> : null}

      {/* Liste des évaluations */}
      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-cyan-700/10 p-2.5 text-cyan-800 dark:text-cyan-300"><ClipboardList className="size-5" aria-hidden /></div>
            <div className="min-w-0"><CardTitle className="text-base">Évaluations de la période</CardTitle>
            <CardDescription className="mt-1">
            L&apos;avancement montre qui n&apos;a pas encore saisi — c&apos;est la question posée
            avant chaque conseil de classe.
          </CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {evaluations.length === 0 ? (
            <p className="py-14 text-center text-slate-600 dark:text-slate-300 text-sm">
              Aucune évaluation. Créez-en une pour commencer la saisie des notes.
            </p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40 text-foreground">
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
                      className={e.id === evaluationId ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-600/20" : "transition-colors hover:bg-muted/40"}
                    >
                      <TableCell>
                        <span className="font-medium">{e.titre}</span>
                        <span className="block text-slate-600 dark:text-slate-300 text-xs">
                          {LIBELLE_TYPE[e.type] ?? e.type} · /{Number(e.bareme)} · coef. {Number(e.poids)}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{e.classe}</TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">{e.matiere}</TableCell>
                      <TableCell className="tabular-nums">{dateFr(e.dateEvaluation)}</TableCell>
                      <TableCell className="w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={taux} className="w-20" />
                          <span className="text-xs tabular-nums">
                            {e.nbSaisies}/{e.effectif}
                          </span>
                        </div>
                        {e.nbSaisies > e.nbNotees ? (
                          <span className="text-slate-600 dark:text-slate-300 text-xs">
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

                        {/*
                          Reprendre la même évaluation dans les autres classes
                          du professeur (E-44) : le geste se fait depuis la
                          ligne de l'original, pas depuis un écran de création
                          où il faudrait retrouver quoi copier.
                        */}
                        <BoutonDupliquer
                          evaluationId={e.id}
                          titre={e.titre}
                          classeOrigine={e.classeId}
                          classes={classes}
                        />

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
            </div>
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
                  <NativeSelect id="classeId" name="classeId" defaultValue={classeFiltreeId} required>
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
                    min={dateDebutPeriode}
                    max={dateFinPeriode}
                    defaultValue={dateEvaluationParDefaut}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Période autorisée : {dateFr(dateDebutPeriode)} au {dateFr(dateFinPeriode)}.
                  </p>
                  {erreur("dateEvaluation")}
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
    // Bloquer localement les notes hors barème avant d'envoyer toute la grille.
    const ligneInvalide = grille.lignes.find((ligne) => {
      const saisie = valeurs[ligne.inscriptionId];
      if (saisie.statut !== "NOTEE" || saisie.valeur.trim() === "") return false;
      const note = Number(saisie.valeur);
      return !Number.isFinite(note) || note < 0 || note > bareme;
    });
    if (ligneInvalide) {
      toast.error(`Vérifiez la note de ${ligneInvalide.prenom} ${ligneInvalide.nom} : elle doit être comprise entre 0 et ${bareme}.`);
      return;
    }

    demarrer(async () => {
      try {
        const r = await enregistrerNotes({
          evaluationId: grille.evaluation.id,
          lignes: grille.lignes.map((l) => {
            const v = valeurs[l.inscriptionId];
            return {
              inscriptionId: l.inscriptionId,
              valeur: v.statut === "NOTEE" && v.valeur.trim() !== "" ? Number(v.valeur) : null,
              statut: v.statut,
            };
          }),
        });
        if (!r.ok) {
          toast.error(r.message ?? "L'enregistrement a échoué. Vérifiez les notes et les droits de saisie.");
          return;
        }
        toast.success(r.message ?? "Notes enregistrées.");
        routeur.refresh();
      } catch (erreur) {
        console.error("[notes-ui] Échec de l'enregistrement", erreur);
        toast.error("Impossible d'enregistrer les notes pour le moment. Réessayez et vérifiez votre connexion.");
      }
    });
  }

  const saisies = Object.values(valeurs).filter(
    (v) => v.statut !== "NOTEE" || v.valeur !== "",
  ).length;

  const tauxSaisie = grille.lignes.length ? Math.round((saisies / grille.lignes.length) * 100) : 0;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Grille de saisie</p>
            <CardTitle className="text-base">{grille.evaluation.titre}</CardTitle>
            <CardDescription>
              Barème /{bareme} — {saisies} / {grille.lignes.length} élèves saisis
              <span className="mt-2 block max-w-64"><Progress value={tauxSaisie} /></span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Fermer la grille de saisie" title="Fermer la grille de saisie" onClick={() => routeur.push("/dashboard/notes")}>
              <X className="size-4" aria-hidden />
            </Button>
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

        <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background text-foreground">
            <TableRow className="bg-muted/40 hover:bg-muted/40">
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
                <TableRow key={l.inscriptionId} className="transition-colors odd:bg-muted/10 hover:bg-cyan-500/[0.04]">
                  <TableCell className="py-2 text-slate-600 dark:text-slate-300 tabular-nums">{index + 1}</TableCell>
                  <TableCell className="py-2">
                    <span className="font-medium">
                      {l.prenom} {l.nom}
                    </span>
                    <span className="block text-slate-600 dark:text-slate-300 text-xs">{l.matricule}</span>
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
        </div>
      </CardContent>
    </Card>
  );
}
