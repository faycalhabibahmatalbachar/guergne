"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle, CalendarDays, SlidersHorizontal } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { JourEvaluation, Surcharge } from "@/server/domain/evaluations";

/**
 * Calendrier des évaluations (E-43).
 *
 * LES EMBOUTEILLAGES D'ABORD, LE CALENDRIER ENSUITE
 * --------------------------------------------------
 * Chaque professeur fixe sa composition sans voir celles des autres. Le
 * résultat, connu de tous les établissements : trois compositions le même
 * mardi, puis dix jours vides. Les élèves travaillent mal les trois, et les
 * moyennes du trimestre en portent la trace.
 *
 * L'écran répond donc d'abord à « où est l'embouteillage », et seulement
 * ensuite à « qu'y a-t-il le 14 ».
 *
 * UNE SEMAINE PAR LIGNE, PAS UNE GRILLE MENSUELLE
 * ------------------------------------------------
 * Un mois en sept colonnes réduit chaque jour à une case de deux centimètres,
 * dans laquelle cinq évaluations ne tiennent pas. En lignes, une journée
 * chargée s'étale et reste lisible — ce qui est exactement le cas qu'on vient
 * regarder.
 *
 * Les jours SANS évaluation sont omis. Un calendrier scolaire compte quatre-
 * vingts jours ouvrés par trimestre ; en afficher soixante vides pour en
 * montrer vingt pleins noierait l'information.
 */

const TYPES: Array<[string, string]> = [
  ["", "Tous les types"],
  ["COMPOSITION", "Compositions"],
  ["EXAMEN_BLANC", "Examens blancs"],
  ["DEVOIR", "Devoirs"],
  ["INTERROGATION", "Interrogations"],
];

const COULEUR_TYPE: Record<string, string> = {
  COMPOSITION: "border-cyan-700/30 bg-cyan-50 text-cyan-950 dark:border-cyan-400/30 dark:bg-cyan-950/50 dark:text-cyan-100",
  EXAMEN_BLANC: "border-indigo-700/30 bg-indigo-50 text-indigo-950 dark:border-indigo-400/30 dark:bg-indigo-950/50 dark:text-indigo-100",
  DEVOIR: "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
  INTERROGATION: "border-emerald-700/25 bg-emerald-50 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-950/50 dark:text-emerald-100"
};

const jourLong = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export function VueCalendrier({
  jours,
  surcharges,
  classes,
  periodes,
  classeId,
  periodeId,
  type,
}: {
  jours: JourEvaluation[];
  surcharges: Surcharge[];
  classes: Array<{ id: string; libelle: string }>;
  periodes: Array<{ id: string; libelle: string }>;
  classeId: string;
  periodeId: string;
  type: string;
}) {
  const routeur = useRouter();
  const params = useSearchParams();

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/notes/calendrier?${p.toString()}`);
  }

  // Regroupement par date, dans l'ordre déjà trié par le serveur.
  const parJour = new Map<string, JourEvaluation[]>();
  for (const j of jours) {
    const liste = parJour.get(j.date);
    if (liste) liste.push(j);
    else parJour.set(j.date, [j]);
  }

  const datesEnSurcharge = new Set(surcharges.map((s) => `${s.date}|${s.classeId}`));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-cyan-700/10 p-2.5 text-cyan-800 dark:text-cyan-300"><SlidersHorizontal className="size-5" aria-hidden /></div><div><CardTitle className="text-base">Filtres du calendrier</CardTitle><CardDescription className="mt-1">Affinez l’affichage par période, classe et type d’évaluation.</CardDescription></div></div>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="c-periode">Période</Label>
            <NativeSelect
              id="c-periode"
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

          <div className="grid gap-2">
            <Label htmlFor="c-classe">Classe</Label>
            <NativeSelect
              id="c-classe"
              className="w-full"
              value={classeId}
              onChange={(e) => naviguer("classe", e.target.value)}
            >
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="c-type">Type</Label>
            <NativeSelect
              id="c-type"
              className="w-full"
              value={type}
              onChange={(e) => naviguer("type", e.target.value)}
            >
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      {surcharges.length > 0 ? (
        <Card className="overflow-hidden rounded-2xl border-amber-500/40 bg-amber-500/5 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle aria-hidden className="size-5 text-amber-600 dark:text-amber-400" />
              {surcharges.length} journée(s) impossible(s)
            </CardTitle>
            <CardDescription>
              Plus de deux compositions le même jour dans la même classe. Une journée n&apos;a
              que deux demi-journées : au-delà, elles ne peuvent pas toutes se tenir. Deux par
              jour est le fonctionnement normal d&apos;une semaine d&apos;examens et n&apos;est
              donc pas signalé ici.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {surcharges.map((s) => (
              <div key={`${s.date}-${s.classeId}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{jourLong(s.date)}</span>
                <span className="text-slate-600 dark:text-slate-300">— {s.classe} :</span>
                <span>{s.matieres.join(", ")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {parJour.size === 0 ? (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="text-slate-600 dark:text-slate-300 py-12 text-center text-sm">
            Aucune évaluation programmée avec ces critères.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="text-base">
              {jours.length} évaluation(s) sur {parJour.size} journée(s)
            </CardTitle>
            <CardDescription>
              Seuls les jours occupés sont listés : afficher soixante journées vides pour en
              montrer vingt pleines noierait l&apos;information.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {[...parJour.entries()].map(([date, liste]) => (
              <div
                key={date}
                className={`grid gap-3 px-4 py-4 transition-colors hover:bg-muted/20 sm:grid-cols-[13rem_1fr] ${
                  date < aujourdhui ? "bg-muted/20" : ""
                }`}
              >
                <div className="text-sm">
                  <p className="font-medium capitalize">{jourLong(date)}</p>
                  <p className="text-slate-600 dark:text-slate-300 text-xs">
                    {liste.length} évaluation(s)
                    {date === aujourdhui ? " · aujourd'hui" : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {liste.map((e) => {
                    const chargee = datesEnSurcharge.has(`${e.date}|${e.classeId}`);
                    return (
                      <span
                        key={e.evaluationId}
                        title={e.titre}
                        className={`rounded-lg border px-2.5 py-2 text-xs leading-5 shadow-xs ${
                          chargee
                            ? "border-amber-600/40 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-100"
                            : (COULEUR_TYPE[e.type] ?? "border-border bg-muted text-foreground")
                        }`}
                      >
                        <span className="font-medium">{e.classe}</span>
                        <span className="opacity-90"> · {e.matiere}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
