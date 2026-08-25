"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle } from "lucide-react";

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
  COMPOSITION: "border-primary/50 bg-primary/10",
  EXAMEN_BLANC: "border-primary/50 bg-primary/10",
  DEVOIR: "border-border bg-muted/60",
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
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="c-periode">Période</Label>
            <NativeSelect
              id="c-periode"
              className="w-44"
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
              className="w-44"
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
              className="w-44"
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
        <Card className="border-amber-500/40 bg-amber-500/5">
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
                <span className="text-muted-foreground">— {s.classe} :</span>
                <span>{s.matieres.join(", ")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {parJour.size === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Aucune évaluation programmée avec ces critères.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
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
                className={`grid gap-2 px-4 py-3 sm:grid-cols-[13rem_1fr] ${
                  date < aujourdhui ? "opacity-60" : ""
                }`}
              >
                <div className="text-sm">
                  <p className="font-medium capitalize">{jourLong(date)}</p>
                  <p className="text-muted-foreground text-xs">
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
                        className={`rounded-md border px-2 py-1 text-xs ${
                          chargee
                            ? "border-amber-500/50 bg-amber-500/10"
                            : (COULEUR_TYPE[e.type] ?? "border-border bg-muted/40")
                        }`}
                      >
                        <span className="font-medium">{e.classe}</span>
                        <span className="text-muted-foreground"> · {e.matiere}</span>
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
