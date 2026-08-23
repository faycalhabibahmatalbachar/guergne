import type { Metadata } from "next";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { listerEnseignants } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { FiltresPersonnel } from "./_components/filtres-personnel";
import { ListeEnseignants } from "./_components/liste-enseignants";

export const metadata: Metadata = { title: "Personnel" };
export const dynamic = "force-dynamic";

/**
 * Personnel enseignant.
 *
 * Les filtres passent par l'URL : le censeur qui prépare les emplois du temps
 * ouvre « service incomplet », consulte une fiche, revient — et doit retrouver
 * sa liste. Un état local la perdrait à chaque aller-retour.
 */
export default async function PagePersonnel({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    statut?: string;
    matiere?: string;
    activite?: string;
    souscharge?: string;
  }>;
}) {
  await exigerPage("utilisateur:creer");

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  const [enseignants, matieres] = await Promise.all([
    listerEnseignants(annee?.id ?? null, {
      recherche: params.q,
      statut: params.statut,
      matiereId: params.matiere,
      activite: params.activite,
      sousCharge: Boolean(params.souscharge),
    }),
    db.execute<{ id: string; libelle: string }>(
      sql`SELECT id, libelle FROM matieres WHERE active ORDER BY libelle`,
    ),
  ]);

  return (
    <div className="space-y-4">
      <FiltresPersonnel matieres={matieres.rows} />
      <ListeEnseignants enseignants={enseignants} />
    </div>
  );
}
