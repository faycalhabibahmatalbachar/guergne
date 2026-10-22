import type { Metadata } from "next";
import Link from "next/link";

import { CalendarDays, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  chargerGrilleSaisie,
  listerEvaluations,
  statistiquesEvaluation,
} from "@/server/domain/evaluations";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { type EtapeManquante, Prerequis } from "../_components/prerequis";
import { Notes } from "./_components/notes";
import { StatistiquesEvaluation } from "./_components/statistiques";

export const metadata: Metadata = { title: "Notes" };
export const dynamic = "force-dynamic";

/**
 * Saisie des notes.
 *
 * Une note se rattache à un élève, une matière, une classe et une période :
 * tant qu'un maillon manque, on l'annonce explicitement plutôt que d'afficher
 * une grille vide dont personne ne comprendrait la cause.
 */
export default async function PageNotes({
  searchParams,
}: {
  searchParams: Promise<{ evaluation?: string }>;
}) {
  await exigerPage("note:lire");

  const params = await searchParams;
  const stats = await chargerStatistiques();

  const manquants: EtapeManquante[] = [];
  if (!stats.annee) manquants.push({ libelle: "Créer l'année scolaire" });
  if (stats.nbCoefficients === 0) manquants.push({ libelle: "Saisir les coefficients" });
  if (stats.nbClasses === 0)
    manquants.push({ libelle: "Créer les classes", url: "/dashboard/parametres?onglet=classes" });
  if (stats.effectifTotal === 0)
    manquants.push({ libelle: "Inscrire des élèves", url: "/dashboard/eleves" });

  if (!stats.annee || !stats.periode || manquants.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Saisie des notes</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {stats.annee
              ? `Année ${stats.annee.libelle}${stats.periode ? ` — ${stats.periode.libelle}` : ""}`
              : "Aucune année scolaire configurée"}
          </p>
        </div>
        <Prerequis
          titre="La saisie des notes n'est pas encore possible"
          explication="Une note se rattache à un élève, une matière, une classe et une période. Voici ce qui manque."
          manquants={
            manquants.length > 0
              ? manquants
              : [{ libelle: "Ouvrir une période d'évaluation", url: "/dashboard/parametres" }]
          }
        />
      </div>
    );
  }

  const { classes, matieres } = await listerClassesEtMatieres(stats.annee.id);
  const evaluations = await listerEvaluations({ periodeId: stats.periode.id });

  const [grille, statsEvaluation] = await Promise.all([
    params.evaluation ? chargerGrilleSaisie(params.evaluation) : Promise.resolve(null),
    params.evaluation ? statistiquesEvaluation(params.evaluation) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-8 -top-12 size-48 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-1 -top-5 size-32 rounded-full border border-cyan-300/15" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Pédagogie · Évaluations</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Saisie des notes</h1>
            <p className="text-sm text-slate-300">Année scolaire {stats.annee.libelle} · {stats.periode.libelle}</p>
            <p className="max-w-xl text-sm text-slate-300">Saisissez les résultats, suivez les évaluations et préparez les moyennes de vos élèves.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10 hover:text-white"><Link href="/dashboard/notes/calendrier"><CalendarDays aria-hidden />Calendrier</Link></Button>
            <Button asChild variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10 hover:text-white"><Link href="/dashboard/notes/appreciations"><MessageSquareText aria-hidden />Appréciations par matière</Link></Button>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">{classes.length} classes</span>
        <span className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">{matieres.length} matières</span>
        <span className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">{evaluations.length} évaluations pour la période</span>
      </div>

      <Notes
        anneeId={stats.annee.id}
        periodeId={stats.periode.id}
        periodeLibelle={stats.periode.libelle}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
        evaluations={evaluations}
        evaluationId={params.evaluation ?? null}
        grille={
          grille
            ? {
                evaluation: {
                  id: grille.evaluation.id,
                  titre: grille.evaluation.titre,
                  bareme: grille.evaluation.bareme,
                  estVerrouillee: grille.evaluation.estVerrouillee,
                },
                lignes: grille.lignes,
              }
            : null
        }
      />

      {/*
        Sous la grille : ces chiffres n'ont de sens qu'une fois les notes
        saisies. Au-dessus, ils prendraient la place au moment où le professeur
        cherche sa première case, pour n'afficher que des tirets.
      */}
      {grille && statsEvaluation ? (
        <StatistiquesEvaluation stats={statsEvaluation} titre={grille.evaluation.titre} />
      ) : null}
    </div>
  );
}
