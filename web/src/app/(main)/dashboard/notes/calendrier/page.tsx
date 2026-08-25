import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

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
        <p className="text-muted-foreground text-sm">
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Calendrier des évaluations</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Année {stats.annee.libelle}. Ce que chaque professeur ne peut pas voir depuis son
            propre emploi du temps.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/notes">
            <ArrowLeft aria-hidden />
            Saisie des notes
          </Link>
        </Button>
      </div>

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
