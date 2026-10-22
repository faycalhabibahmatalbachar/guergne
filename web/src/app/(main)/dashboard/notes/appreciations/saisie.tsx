"use client";

import { useMemo, useState, useTransition } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type {
  AvancementAppreciation,
  LigneAppreciation,
} from "@/server/domain/appreciations";

import { enregistrerAppreciations } from "./actions";

/**
 * Saisie des appréciations, une matière pour une classe entière (E-41).
 *
 * LES PHRASES TYPES NE SONT PAS UN GADGET
 * ----------------------------------------
 * Un professeur de mathématiques a cinq classes de quarante élèves : deux cents
 * appréciations par trimestre. Sans amorce, il en écrit trente puis recopie la
 * même formule — ou n'en écrit aucune. Un clic pose la phrase, il l'ajuste.
 * C'est la différence entre une colonne remplie et une colonne vide.
 *
 * Les amorces dépendent de la moyenne : on ne propose pas « des difficultés
 * persistantes » à un élève qui a 16.
 *
 * LA MOYENNE ET LE RANG SONT AFFICHÉS À CÔTÉ DE LA CASE
 * ------------------------------------------------------
 * Sans eux, on écrit de mémoire — et de mémoire, on décrit l'élève dont on se
 * souvient, pas celui dont les résultats le justifient.
 */

const AMORCES_BONNES = [
  "Excellent trimestre, continuez ainsi.",
  "Très bon travail, élève sérieux et régulier.",
  "Bons résultats, participation active en classe.",
];
const AMORCES_MOYENNES = [
  "Ensemble correct, peut mieux faire à l'écrit.",
  "Des progrès, mais un travail encore irrégulier.",
  "Résultats justes ; plus de rigueur dans les exercices.",
];
const AMORCES_FAIBLES = [
  "Trimestre insuffisant, un travail personnel s'impose.",
  "Des difficultés persistantes ; doit se faire aider.",
  "Trop de lacunes, il faut reprendre les bases.",
];

function amorces(moyenne: number | null): string[] {
  if (moyenne === null) return AMORCES_MOYENNES;
  if (moyenne >= 14) return AMORCES_BONNES;
  if (moyenne >= 10) return AMORCES_MOYENNES;
  return AMORCES_FAIBLES;
}

export function SaisieAppreciations({
  classes,
  matieres,
  periodes,
  classeId,
  matiereId,
  periodeId,
  lignes,
  avancement,
}: {
  classes: Array<{ id: string; libelle: string }>;
  matieres: Array<{ id: string; libelle: string }>;
  periodes: Array<{ id: string; libelle: string }>;
  classeId: string;
  matiereId: string;
  periodeId: string;
  lignes: LigneAppreciation[];
  avancement: AvancementAppreciation[];
}) {
  const routeur = useRouter();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  const [valeurs, setValeurs] = useState<Record<string, string>>(() =>
    Object.fromEntries(lignes.map((l) => [l.inscriptionId, l.appreciation ?? ""])),
  );

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/notes/appreciations?${p.toString()}`);
  }

  const saisies = useMemo(
    () => Object.values(valeurs).filter((v) => v.trim() !== "").length,
    [valeurs],
  );

  function enregistrer() {
    demarrer(async () => {
      const r = await enregistrerAppreciations({
        classeId,
        matiereId,
        periodeId,
        lignes: lignes.map((l) => ({
          inscriptionId: l.inscriptionId,
          appreciation: valeurs[l.inscriptionId] ?? "",
        })),
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  const pret = Boolean(classeId && matiereId && periodeId);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4"><CardTitle className="text-base">Choisir la classe, la matière et la période</CardTitle><CardDescription>Les appréciations sont enregistrées pour cette combinaison.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="a-classe">Classe</Label>
            <NativeSelect
              id="a-classe"
              className="w-full"
              value={classeId}
              onChange={(e) => naviguer("classe", e.target.value)}
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
            <Label htmlFor="a-matiere">Matière</Label>
            <NativeSelect
              id="a-matiere"
              className="w-full"
              value={matiereId}
              onChange={(e) => naviguer("matiere", e.target.value)}
            >
              <option value="">Choisir…</option>
              {matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="a-periode">Période</Label>
            <NativeSelect
              id="a-periode"
              className="w-full"
              value={periodeId}
              onChange={(e) => naviguer("periode", e.target.value)}
            >
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      {avancement.length > 0 ? (
        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="text-base">Avancement de la classe</CardTitle>
            <CardDescription>
              Qui a rendu ses appréciations, et qui reste à relancer avant le conseil. Cliquez sur
              une matière pour l&apos;ouvrir.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {avancement.map((a) => {
              const complet = a.attendues > 0 && a.saisies >= a.attendues;
              const vide = a.saisies === 0;
              return (
                <button
                  key={a.matiereId}
                  type="button"
                  aria-pressed={a.matiereId === matiereId}
                  onClick={() => naviguer("matiere", a.matiereId)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 ${
                    a.matiereId === matiereId
                      ? "border-cyan-800 bg-cyan-100 text-slate-950 ring-2 ring-cyan-800/30 dark:border-cyan-300 dark:bg-cyan-900 dark:text-white dark:ring-cyan-300/30"
                      : "border-border bg-card text-foreground hover:border-cyan-700/50 hover:bg-muted/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.matiere}</span>
                    <span className="mt-1 block truncate text-xs opacity-80">
                      {a.enseignant ?? "aucun enseignant affecté"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      complet
                        ? "text-emerald-600 dark:text-emerald-400"
                        : vide
                          ? "text-destructive"
                          : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {a.saisies}/{a.attendues}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {!pret ? (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="text-slate-600 dark:text-slate-300 py-12 text-center text-sm">
            Choisissez une classe et une matière pour commencer la saisie.
          </CardContent>
        </Card>
      ) : lignes.length === 0 ? (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="text-slate-600 dark:text-slate-300 py-12 text-center text-sm">
            Aucun élève inscrit dans cette classe.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Appréciations — {lignes.length} élèves</CardTitle>
                <CardDescription>
                  {saisies} / {lignes.length} rédigée(s). Sans appréciation, le bulletin imprime la
                  mention déduite de la moyenne — qui ne fait que répéter le chiffre.
                </CardDescription>
              </div>
              <Button onClick={enregistrer} disabled={enCours} className="bg-cyan-700 text-white shadow-sm hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                <Save aria-hidden />
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="divide-y divide-border/70 p-0">
            {lignes.map((l) => (
              <div key={l.inscriptionId} className="grid gap-3 px-4 py-4 odd:bg-muted/10 sm:grid-cols-[16rem_1fr] lg:gap-5">
                <div className="text-sm">
                  <p className="font-medium">{l.eleve}</p>
                  <p className="text-slate-600 dark:text-slate-300 text-xs tabular-nums">
                    {l.moyenne === null ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        pas encore de moyenne
                      </span>
                    ) : (
                      <>
                        {l.moyenne.toFixed(2).replace(".", ",")}/20
                        {l.rangMatiere ? ` · ${l.rangMatiere}e` : ""}
                        {l.moyenneClasse !== null
                          ? ` · classe ${l.moyenneClasse.toFixed(2).replace(".", ",")}`
                          : ""}
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Input
                    value={valeurs[l.inscriptionId] ?? ""}
                    maxLength={300}
                    placeholder="Appréciation du professeur…"
                    onChange={(e) =>
                      setValeurs((p) => ({ ...p, [l.inscriptionId]: e.target.value }))
                    }
                  />
                  {(valeurs[l.inscriptionId] ?? "") === "" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {amorces(l.moyenne).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setValeurs((p) => ({ ...p, [l.inscriptionId]: a }))}
                          className="text-slate-600 dark:text-slate-300 hover:bg-muted hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>

          <CardContent className="border-t py-3">
            <Button onClick={enregistrer} disabled={enCours} className="w-full bg-cyan-700 text-white shadow-sm hover:bg-cyan-800 sm:w-auto dark:bg-cyan-600 dark:hover:bg-cyan-500">
              <Save aria-hidden />
              {enCours ? "Enregistrement…" : "Enregistrer les appréciations"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
