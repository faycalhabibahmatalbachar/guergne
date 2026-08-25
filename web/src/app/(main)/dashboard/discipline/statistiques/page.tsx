import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft, Gavel } from "lucide-react";

import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { statistiquesDiscipline } from "@/server/domain/conseil-discipline";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { VueStatistiques } from "./vue-statistiques";

export const metadata: Metadata = { title: "Statistiques de discipline" };
export const dynamic = "force-dynamic";

/**
 * Statistiques de discipline (E-55).
 *
 * Écran de pilotage, pas de saisie : le droit exigé est `discipline:lire`. Un
 * proviseur doit pouvoir lire l'état de la vie scolaire sans avoir le droit de
 * prononcer une sanction — et c'est cette séparation qui rend le chiffre
 * crédible.
 */
export default async function PageStatistiquesDiscipline({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; periode?: string }>;
}) {
  await exigerPage("discipline:lire");

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Statistiques de discipline</h1>
        <p className="text-muted-foreground text-sm">Aucune année scolaire n&apos;est configurée.</p>
      </div>
    );
  }

  const [classes, periodes, stats] = await Promise.all([
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT c.id, c.libelle
        FROM classes c
       WHERE c.annee_id = ${annee.id}::uuid
       ORDER BY c.libelle
    `),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT p.id, p.libelle
        FROM periodes p
       WHERE p.annee_id = ${annee.id}::uuid
       ORDER BY p.numero
    `),
    statistiquesDiscipline(annee.id, {
      classeId: params.classe || undefined,
      periodeId: params.periode || undefined,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Statistiques de discipline</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Année {annee.libelle}. Où et quand la vie scolaire se tend, et sur qui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/discipline/conseils">
              <Gavel aria-hidden />
              Conseils de discipline
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/discipline">
              <ArrowLeft aria-hidden />
              Incidents et sanctions
            </Link>
          </Button>
        </div>
      </div>

      <VueStatistiques
        stats={stats}
        classes={classes.rows}
        periodes={periodes.rows}
        classeId={params.classe ?? ""}
        periodeId={params.periode ?? ""}
      />
    </div>
  );
}
