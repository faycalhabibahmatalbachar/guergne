import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sessionCourante } from "@/server/auth/session";
import { db } from "@/server/db";
import { dossierDiscipline, listerConseils } from "@/server/domain/conseil-discipline";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { listerElevesClasse } from "@/server/domain/vie-scolaire";
import { exigerPage, peut } from "@/server/guard";

import { VueConseils } from "./vue-conseils";

export const metadata: Metadata = { title: "Conseils de discipline" };
export const dynamic = "force-dynamic";

/**
 * Conseils de discipline (E-54).
 *
 * `conseils_discipline` est la cinquième table du projet déclarée et jamais
 * branchée, après notes_conduite, appreciations_matiere, remplacements et
 * exonerations.
 *
 * Le dossier de l'élève n'est chargé que pour le conseil OUVERT : c'est six
 * requêtes, et les lancer pour les vingt conseils de l'année ferait cent
 * vingt allers-retours pour un seul dossier réellement lu.
 */
export default async function PageConseils({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; dossier?: string }>;
}) {
  await exigerPage("discipline:lire");
  const principal = await sessionCourante();

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Conseils de discipline</h1>
        <p className="text-muted-foreground text-sm">Aucune année scolaire n&apos;est configurée.</p>
      </div>
    );
  }

  const classeId = params.classe ?? "";

  const [conseils, classes, eleves, peutConvoquer] = await Promise.all([
    listerConseils(annee.id, { classeId: classeId || undefined }),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT c.id, c.libelle
        FROM classes c
       WHERE c.annee_id = ${annee.id}::uuid
       ORDER BY c.libelle
    `),
    classeId ? listerElevesClasse(classeId) : Promise.resolve([]),
    peut(principal, "conseil_discipline:convoquer"),
  ]);

  const conseilOuvert =
    params.dossier && conseils.some((c) => c.id === params.dossier) ? params.dossier : null;

  const dossier = conseilOuvert
    ? await dossierDiscipline(conseils.find((c) => c.id === conseilOuvert)!.inscriptionId)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Conseils de discipline</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Année {annee.libelle}. Un conseil se tient sur un élève, pas sur un incident : le
            dossier complet s&apos;ouvre au moment de délibérer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/discipline/statistiques">
              <BarChart3 aria-hidden />
              Statistiques
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

      <VueConseils
        conseils={conseils}
        classes={classes.rows}
        eleves={eleves.map((e) => ({
          inscriptionId: e.inscriptionId,
          libelle: `${e.nom} ${e.prenom} — ${e.matricule}`,
        }))}
        classeId={classeId}
        dossier={dossier}
        dossierPour={conseilOuvert}
        peutConvoquer={peutConvoquer}
      />
    </div>
  );
}
