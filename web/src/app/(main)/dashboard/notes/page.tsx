import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { ArrowUpRight, BookOpenText, CalendarDays, Filter, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

import {
  chargerGrilleSaisie,
  listerEvaluations,
  statistiquesEvaluation,
} from "@/server/domain/evaluations";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { db } from "@/server/db";
import { periodes } from "@/server/db/schema";
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
  searchParams: Promise<{ evaluation?: string; classe?: string; periode?: string }>;
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
          <p className="mt-1 text-slate-600 dark:text-slate-300 text-sm">
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
  const periodesDisponibles = await db
    .select({
      id: periodes.id,
      libelle: periodes.libelle,
      numero: periodes.numero,
      dateDebut: periodes.dateDebut,
      dateFin: periodes.dateFin,
      estVerrouillee: periodes.estVerrouillee,
      saisieOuverte: periodes.saisieOuverte,
    })
    .from(periodes)
    .where(eq(periodes.anneeId, stats.annee.id))
    .orderBy(asc(periodes.numero));

  const periodeChoisie =
    periodesDisponibles.find((periode) => periode.id === params.periode) ?? stats.periode;
  const classeFiltreeId = classes.some((classe) => classe.id === params.classe)
    ? params.classe!
    : "";

  const evaluations = await listerEvaluations({
    periodeId: periodeChoisie.id,
    ...(classeFiltreeId ? { classeId: classeFiltreeId } : {}),
  });

  // Vérifier directement l'évaluation : la liste affichée est plafonnée à 100 lignes.
  const grilleCandidate = params.evaluation ? await chargerGrilleSaisie(params.evaluation) : null;
  const grilleCorrespondAuxFiltres =
    grilleCandidate?.evaluation.periodeId === periodeChoisie.id &&
    (!classeFiltreeId || grilleCandidate.evaluation.classeId === classeFiltreeId);
  const evaluationChoisieId = grilleCorrespondAuxFiltres ? grilleCandidate.evaluation.id : null;
  const grille = grilleCorrespondAuxFiltres ? grilleCandidate : null;
  const statsEvaluation = evaluationChoisieId
    ? await statistiquesEvaluation(evaluationChoisieId)
    : null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-cyan-700 via-sky-600 to-indigo-600" />
        <div className="flex flex-col justify-between gap-5 p-5 sm:p-6 xl:flex-row xl:items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-700/20 bg-cyan-700/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-800 dark:text-cyan-300">
              <BookOpenText className="size-3.5" aria-hidden />
              ESPACE PÉDAGOGIQUE
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Saisie des notes</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">Année scolaire <span className="font-medium text-foreground">{stats.annee.libelle}</span> <span className="px-1 text-slate-600 dark:text-slate-300">/</span> Période <span className="font-medium text-foreground">{periodeChoisie.libelle}</span></p>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Saisissez les résultats, suivez l’avancement des évaluations et préparez les moyennes de vos élèves.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:max-w-[760px] xl:justify-end">
            <Button asChild variant="outline" size="sm" className="h-10 gap-2 whitespace-nowrap border-slate-300 bg-white px-4 text-slate-900 shadow-sm hover:border-cyan-700 hover:bg-cyan-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-500 dark:hover:bg-slate-800 dark:hover:text-white">
              <Link href="/dashboard/notes/calendrier" style={{ color: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1" }}><CalendarDays className="size-4 shrink-0" aria-hidden /><span style={{ color: "#0f172a" }}>Calendrier</span></Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10 gap-2 whitespace-nowrap border-slate-300 bg-white px-4 text-slate-900 shadow-sm hover:border-cyan-700 hover:bg-cyan-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-500 dark:hover:bg-slate-800 dark:hover:text-white">
              <Link href="/dashboard/notes/appreciations" style={{ color: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1" }}><MessageSquareText className="size-4 shrink-0" aria-hidden /><span style={{ color: "#0f172a" }}>Appréciations par matière</span></Link>
            </Button>
            <Button asChild size="sm" className="h-10 gap-2 whitespace-nowrap bg-cyan-700 px-4 text-white shadow-sm hover:bg-cyan-800 focus-visible:ring-2 focus-visible:ring-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-500">
              <Link href="/dashboard/bulletins" style={{ color: "#ffffff", backgroundColor: "#0e7490", borderColor: "#0e7490" }}><span style={{ color: "#ffffff" }}>Consulter les bulletins</span><ArrowUpRight className="size-4 shrink-0" aria-hidden /></Link>
            </Button>
            <form action="/dashboard/notes" method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 bg-muted/20 p-2">
              <div className="grid gap-1">
                <label htmlFor="filtre-classe-notes" className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Classe</label>
                <NativeSelect id="filtre-classe-notes" name="classe" defaultValue={classeFiltreeId} className="w-36">
                  <option value="">Toutes les classes</option>
                  {classes.map((classe) => <option key={classe.id} value={classe.id}>{classe.libelle}</option>)}
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <label htmlFor="filtre-periode-notes" className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Trimestre / période</label>
                <NativeSelect id="filtre-periode-notes" name="periode" defaultValue={periodeChoisie.id} className="w-40">
                  {periodesDisponibles.map((periode) => (
                    <option key={periode.id} value={periode.id}>{periode.libelle}</option>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-10 gap-2 border-cyan-700/40 text-cyan-800 hover:bg-cyan-50 dark:text-cyan-200 dark:hover:bg-cyan-950/50">
                <Filter className="size-4" aria-hidden /> Filtrer
              </Button>
            </form>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-cyan-700/10 p-2.5 text-cyan-800 dark:text-cyan-300"><BookOpenText className="size-4" aria-hidden /></div>
          <div><p className="text-xs text-slate-600 dark:text-slate-300">Classes</p><p className="font-semibold tabular-nums">{classes.length}</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-indigo-500/10 p-2.5 text-indigo-700 dark:text-indigo-300"><MessageSquareText className="size-4" aria-hidden /></div>
          <div><p className="text-xs text-slate-600 dark:text-slate-300">Matières</p><p className="font-semibold tabular-nums">{matieres.length}</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300"><CalendarDays className="size-4" aria-hidden /></div>
          <div><p className="text-xs text-slate-600 dark:text-slate-300">Évaluations planifiées</p><p className="font-semibold tabular-nums">{evaluations.length}</p></div>
        </div>
      </div>

      <Notes
        anneeId={stats.annee.id}
        periodeId={periodeChoisie.id}
        periodeLibelle={periodeChoisie.libelle}
        dateDebutPeriode={periodeChoisie.dateDebut}
        dateFinPeriode={periodeChoisie.dateFin}
        classeFiltreeId={classeFiltreeId}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
        evaluations={evaluations}
        evaluationId={evaluationChoisieId}
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
