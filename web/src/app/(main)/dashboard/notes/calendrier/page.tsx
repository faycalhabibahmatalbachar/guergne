import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { calendrierEvaluations } from "@/server/domain/evaluations";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { VueCalendrier } from "./vue";

export const metadata: Metadata = { title: "Calendrier des évaluations" };
export const dynamic = "force-dynamic";

/**
 * Calendrier des compositions (E-43).
 *
 * Il existe pour une seule raison : personne, dans l'établissement, ne voyait
 * l'ensemble. Chaque professeur fixait sa date en connaissance de son seul
 * emploi du temps, et le censeur découvrait l'embouteillage le jour même.
 */
export default async function PageCalendrier({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; classe?: string; type?: string }>;
}) {
  await exigerPage("evaluation:lire");

  const params = await searchParams;
  const stats = await chargerStatistiques();

  if (!stats.annee || !stats.periode) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Calendrier des évaluations</h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm">
          Aucune période d&apos;évaluation n&apos;est ouverte.
        </p>
      </div>
    );
  }

  const periodeId = params.periode ?? stats.periode.id;

  const [classes, periodes, calendrier] = await Promise.all([
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT c.id, c.libelle
        FROM classes c
        JOIN annees_scolaires a ON a.id = c.annee_id AND a.est_courante
       ORDER BY c.libelle
    `),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT p.id, p.libelle
        FROM periodes p
        JOIN annees_scolaires a ON a.id = p.annee_id AND a.est_courante
       ORDER BY p.numero
    `),
    calendrierEvaluations(periodeId, { classeId: params.classe, type: params.type }),
  ]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-cyan-700 via-sky-600 to-indigo-600" />
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-700/20 bg-cyan-700/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-800 dark:text-cyan-300">
              <CalendarDays className="size-4" aria-hidden /> PLANIFICATION PÉDAGOGIQUE
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Calendrier des évaluations</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Année scolaire <span className="font-medium text-foreground">{stats.annee.libelle}</span>. Visualisez les évaluations prévues et repérez les journées surchargées.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-10 gap-2 whitespace-nowrap border-slate-300 bg-white px-4 text-slate-900 shadow-sm hover:border-cyan-700 hover:bg-cyan-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-500 dark:hover:bg-slate-800 dark:hover:text-white">
            <Link href="/dashboard/notes" style={{ color: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1" }}><ArrowLeft className="size-4 shrink-0" aria-hidden /><span style={{ color: "#0f172a" }}>Retour à la saisie des notes</span></Link>
          </Button>
        </div>
      </section>

      <VueCalendrier
        jours={calendrier.jours}
        surcharges={calendrier.surcharges}
        classes={classes.rows}
        periodes={periodes.rows}
        classeId={params.classe ?? ""}
        periodeId={periodeId}
        type={params.type ?? ""}
      />
    </div>
  );
}
