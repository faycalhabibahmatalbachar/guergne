import Link from "next/link";

import { asc, eq } from "drizzle-orm";
import { ArrowUpRight, BookOpenText, CalendarDays, Filter, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/server/db";
import { periodes } from "@/server/db/schema";
import { chargerGrilleSaisie, listerEvaluations, statistiquesEvaluation } from "@/server/domain/evaluations";
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
  if (stats.effectifTotal === 0) manquants.push({ libelle: "Inscrire des élèves", url: "/dashboard/eleves" });

  if (!stats.annee || !stats.periode || manquants.length > 0) {
    return (
      <Page>
        <EnTetePage
          titre="Saisie des notes"
          description={
            <>
              {stats.annee
                ? `Année ${stats.annee.libelle}${stats.periode ? ` — ${stats.periode.libelle}` : ""}`
                : "Aucune année scolaire configurée"}
            </>
          }
        />
        <Prerequis
          titre="La saisie des notes n'est pas encore possible"
          explication="Une note se rattache à un élève, une matière, une classe et une période. Voici ce qui manque."
          manquants={
            manquants.length > 0
              ? manquants
              : [{ libelle: "Ouvrir une période d'évaluation", url: "/dashboard/parametres" }]
          }
        />
      </Page>
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

  const periodeChoisie = periodesDisponibles.find((periode) => periode.id === params.periode) ?? stats.periode;
  const classeFiltreeId = classes.some((classe) => classe.id === params.classe) ? params.classe! : "";

  const evaluations = await listerEvaluations({
    periodeId: periodeChoisie.id,
    ...(classeFiltreeId ? { classeId: classeFiltreeId } : {}),
  });

  // Vérifier directement l'évaluation : la liste affichée est plafonnée à 100 lignes.
  const grilleCandidate = params.evaluation ? await chargerGrilleSaisie(params.evaluation) : null;
  const grilleCorrespondAuxFiltres = Boolean(
    grilleCandidate &&
      grilleCandidate.evaluation.periodeId === periodeChoisie.id &&
      (!classeFiltreeId || grilleCandidate.evaluation.classeId === classeFiltreeId),
  );
  const grille = grilleCorrespondAuxFiltres ? grilleCandidate : null;
  const evaluationChoisieId = grille?.evaluation.id ?? null;
  const statsEvaluation = evaluationChoisieId ? await statistiquesEvaluation(evaluationChoisieId) : null;

  return (
    <Page>
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-primary" />
        <div className="flex flex-col justify-between gap-5 p-5 sm:p-6 xl:flex-row xl:items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-info-trait bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-info">
              <BookOpenText className="size-3.5" aria-hidden />
              ESPACE PÉDAGOGIQUE
            </div>
            <div className="space-y-1.5">
              <h1 className="font-semibold tracking-tight sm:">Saisie des notes</h1>
              <p className="text-sm text-muted-foreground">
                Année scolaire <span className="font-medium text-foreground">{stats.annee.libelle}</span>{" "}
                <span className="px-1 text-muted-foreground">/</span> Période{" "}
                <span className="font-medium text-foreground">{periodeChoisie.libelle}</span>
              </p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Saisissez les résultats, suivez l’avancement des évaluations et préparez les moyennes de vos élèves.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:max-w-[760px] xl:justify-end">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="whitespace-nowrap shadow-sm hover:border-info-trait hover:bg-info-doux/90 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-info-trait dark:hover:bg-card/90 dark:hover:text-primary-foreground"
            >
              <Link
                href="/dashboard/notes/calendrier"
                style={{ color: "var(--foreground)", backgroundColor: "var(--card)", borderColor: "var(--border)" }}
              >
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                <span style={{ color: "var(--foreground)" }}>Calendrier</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="whitespace-nowrap shadow-sm hover:border-info-trait hover:bg-info-doux/90 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-info-trait dark:hover:bg-card/90 dark:hover:text-primary-foreground"
            >
              <Link
                href="/dashboard/notes/appreciations"
                style={{ color: "var(--foreground)", backgroundColor: "var(--card)", borderColor: "var(--border)" }}
              >
                <MessageSquareText className="size-4 shrink-0" aria-hidden />
                <span style={{ color: "var(--foreground)" }}>Appréciations par matière</span>
              </Link>
            </Button>
            <Button asChild size="sm" className="whitespace-nowrap">
              <Link href="/dashboard/bulletins">
                Consulter les bulletins
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
            <form
              action="/dashboard/notes"
              method="get"
              className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 bg-muted/20 p-2"
            >
              <div className="grid gap-1">
                <label htmlFor="filtre-classe-notes" className="px-1 text-xs font-medium text-muted-foreground">
                  Classe
                </label>
                <NativeSelect id="filtre-classe-notes" name="classe" defaultValue={classeFiltreeId} className="w-36">
                  <option value="">Toutes les classes</option>
                  {classes.map((classe) => (
                    <option key={classe.id} value={classe.id}>
                      {classe.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <label htmlFor="filtre-periode-notes" className="px-1 text-xs font-medium text-muted-foreground">
                  Trimestre / période
                </label>
                <NativeSelect
                  id="filtre-periode-notes"
                  name="periode"
                  defaultValue={periodeChoisie.id}
                  className="w-40"
                >
                  {periodesDisponibles.map((periode) => (
                    <option key={periode.id} value={periode.id}>
                      {periode.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-info-trait text-info hover:bg-info-doux/90 dark:hover:bg-info-doux/90"
              >
                <Filter className="size-4" aria-hidden /> Filtrer
              </Button>
            </form>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-info-doux p-2.5 text-info">
            <BookOpenText className="size-4" aria-hidden />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Classes</p>
            <p className="font-semibold tabular-nums">{classes.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-info-doux p-2.5 text-info">
            <MessageSquareText className="size-4" aria-hidden />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Matières</p>
            <p className="font-semibold tabular-nums">{matieres.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-succes-doux p-2.5 text-succes">
            <CalendarDays className="size-4" aria-hidden />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Évaluations planifiées</p>
            <p className="font-semibold tabular-nums">{evaluations.length}</p>
          </div>
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
    </Page>
  );
}
