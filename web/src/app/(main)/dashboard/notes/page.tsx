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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Saisie des notes</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Année {stats.annee.libelle} — {stats.periode.libelle}
          </p>
        </div>
        {/*
          Les appréciations se rédigent au même moment que les dernières notes,
          juste avant le conseil. Le lien est ici parce que c'est là que le
          professeur se trouve déjà.
        */}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/notes/calendrier">
              <CalendarDays aria-hidden />
              Calendrier
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/notes/appreciations">
              <MessageSquareText aria-hidden />
              Appréciations par matière
            </Link>
          </Button>
        </div>
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
