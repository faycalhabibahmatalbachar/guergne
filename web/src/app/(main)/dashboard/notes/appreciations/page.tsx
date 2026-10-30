import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { avancementAppreciations, chargerAppreciationsClasse } from "@/server/domain/appreciations";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { SaisieAppreciations } from "./saisie";

export const metadata: Metadata = { title: "Appréciations" };
export const dynamic = "force-dynamic";

/**
 * Appréciations du professeur, matière par matière (E-41).
 *
 * Écran séparé de la saisie des notes, et non un onglet de plus : ce n'est pas
 * le même moment du trimestre. Les notes se saisissent au fil des évaluations,
 * les appréciations se rédigent d'un bloc à l'approche du conseil. Une page
 * distincte se transmet aussi par simple lien — « voici l'écran, remplis ta
 * matière avant vendredi ».
 */
export default async function PageAppreciations({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; matiere?: string; periode?: string }>;
}) {
  await exigerPage("note:lire");

  const params = await searchParams;
  const stats = await chargerStatistiques();

  if (!stats.annee || !stats.periode) {
    return (
      <Page>
        <EnTetePage titre="Appréciations" />
        <p className="text-muted-foreground text-sm">Aucune période d&apos;évaluation n&apos;est ouverte.</p>
      </Page>
    );
  }

  const [{ classes, matieres }, periodes] = await Promise.all([
    listerClassesEtMatieres(stats.annee.id),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT p.id, p.libelle
        FROM periodes p
        JOIN annees_scolaires a ON a.id = p.annee_id AND a.est_courante
       ORDER BY p.numero
    `),
  ]);

  const classeId = params.classe ?? "";
  const matiereId = params.matiere ?? "";
  const periodeId = params.periode ?? stats.periode.id;

  // Deux lectures, deux publics : le professeur remplit SA matière ; le censeur
  // veut savoir qui n'a pas rendu. L'avancement est donc chargé dès qu'une
  // classe est choisie, avant même qu'une matière le soit.
  const [lignes, avancement] = await Promise.all([
    classeId && matiereId && periodeId
      ? chargerAppreciationsClasse(classeId, matiereId, periodeId)
      : Promise.resolve([]),
    classeId && periodeId ? avancementAppreciations(classeId, periodeId) : Promise.resolve([]),
  ]);

  return (
    <Page>
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-primary" />
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-info-trait bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-info">
              <MessageSquareText className="size-4" aria-hidden /> SUIVI PÉDAGOGIQUE
            </div>
            <h1 className="font-semibold tracking-tight sm:">Appréciations par matière</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Année scolaire <span className="font-medium text-foreground">{stats.annee.libelle}</span>. Rédigez et
              suivez les appréciations de chaque classe avant le conseil.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="whitespace-nowrap shadow-sm hover:border-info-trait hover:bg-info-doux/90 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-info-trait dark:hover:bg-card/90 dark:hover:text-primary-foreground"
          >
            <Link
              href="/dashboard/notes"
              style={{ color: "var(--foreground)", backgroundColor: "var(--card)", borderColor: "var(--border)" }}
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              <span style={{ color: "var(--foreground)" }}>Retour à la saisie des notes</span>
            </Link>
          </Button>
        </div>
      </section>

      {/*
        `key` remonte le composant quand la cible change. Sans elle, l'état
        local de saisie — initialisé UNE fois — survivrait au passage d'une
        matière à l'autre, et l'enregistrement écrirait les appréciations de
        la matière précédente sur la nouvelle.
      */}
      <SaisieAppreciations
        key={`${classeId}-${matiereId}-${periodeId}`}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
        periodes={periodes.rows}
        classeId={classeId}
        matiereId={matiereId}
        periodeId={periodeId}
        lignes={lignes}
        avancement={avancement}
      />
    </Page>
  );
}
