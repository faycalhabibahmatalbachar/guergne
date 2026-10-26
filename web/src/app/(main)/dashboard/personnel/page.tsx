import type { Metadata } from "next";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { listerEnseignants } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage, peut } from "@/server/guard";
import Link from "next/link";
import { listerPersonnelNonEnseignant, type CategoriePersonnel } from "@/server/domain/personnel-non-enseignant";
import { RegistrePersonnelNonEnseignant } from "./_components/registre-non-enseignant";

import { FiltresPersonnel } from "./_components/filtres-personnel";
import { ListeEnseignants } from "./_components/liste-enseignants";
import "../default/gentelella-tokens.css";
import "../default/gentelella-layout.css";
import "../default/gentelella-components.css";
import "../default/gentelella-widgets.css";

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
    categorie?: string;
  }>;
}) {
  const principal = await exigerPage("utilisateur:creer");
  const params = await searchParams;
  const categorie: "ENSEIGNANT" | CategoriePersonnel =
    params.categorie === "administratif" ? "ADMINISTRATIF" :
    params.categorie === "technique" ? "TECHNIQUE" : "ENSEIGNANT";

  const estEnseignant = categorie === "ENSEIGNANT";
  const [enseignants, matieres, nonEnseignants, peutGererRoles] = await Promise.all([
    estEnseignant ? chargerEnseignants(params) : Promise.resolve([]),
    estEnseignant ? chargerMatieres() : Promise.resolve([]),
    !estEnseignant ? listerPersonnelNonEnseignant(categorie) : Promise.resolve([]),
    peut(principal, "permission:gerer"),
  ]);

  const onglets = [
    { id: "ENSEIGNANT", titre: "Enseignants", lien: "/dashboard/personnel" },
    { id: "ADMINISTRATIF", titre: "Administratif", lien: "/dashboard/personnel?categorie=administratif" },
    { id: "TECHNIQUE", titre: "Technique", lien: "/dashboard/personnel?categorie=technique" },
  ];

  return (
    <main className="space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <nav aria-label="Catégories du personnel" className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-border dark:bg-card">
        {onglets.map(onglet => <Link key={onglet.id} href={onglet.lien}
          aria-current={onglet.id === categorie ? "page" : undefined}
          className={"rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 "+
            (onglet.id === categorie ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-muted")}>
          {onglet.titre}
        </Link>)}
      </nav>
      {estEnseignant ? <>
        <FiltresPersonnel matieres={matieres} />
        <ListeEnseignants enseignants={enseignants} />
      </> : <RegistrePersonnelNonEnseignant personnels={nonEnseignants} categorie={categorie} peutGererRoles={peutGererRoles} />}
    </main>
  );
}

async function chargerEnseignants(params: {
  q?: string; statut?: string; matiere?: string; activite?: string; souscharge?: string;
}) {
  const annee = await chargerAnneeCourante();
  return listerEnseignants(annee?.id ?? null, {
    recherche: params.q, statut: params.statut, matiereId: params.matiere,
    activite: params.activite, sousCharge: Boolean(params.souscharge),
  });
}
async function chargerMatieres() {
  const r = await db.execute<{id:string;libelle:string}>(
    sql`SELECT id,libelle FROM matieres WHERE active ORDER BY libelle`,
  );
  return [...r.rows];
}
