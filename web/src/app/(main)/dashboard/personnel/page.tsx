import type { Metadata } from "next";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { listerEnseignants } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage, peut } from "@/server/guard";
import Link from "next/link";
import { Download, Plus, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    nouveau?: string;
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
  const titre = categorie === "ENSEIGNANT" ? "Personnel enseignant"
    : categorie === "ADMINISTRATIF" ? "Personnel administratif" : "Personnel technique";
  const totalDossiers = estEnseignant ? enseignants.length : nonEnseignants.length;
  const lienCreation = categorie === "ENSEIGNANT" ? "/dashboard/personnel?nouveau=1"
    : categorie === "ADMINISTRATIF" ? "/dashboard/personnel?categorie=administratif&nouveau=1"
    : "/dashboard/personnel?categorie=technique&nouveau=1";

  return (
    <main className="space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <header aria-label="En-tête de la page Personnel" className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-border xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="flex items-center gap-2.5 text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">
              <Users className="size-7 shrink-0 text-[#102448] dark:text-foreground" aria-hidden />
              {titre}
            </h1>
            <span className="inline-flex items-center rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 tabular-nums dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              {totalDossiers.toLocaleString("fr-FR")} dossiers
            </span>
          </div>
        </div>
        <div role="group" aria-label="Actions du personnel" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {estEnseignant ? <>
            <Button asChild variant="outline" className="h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground">
              <a href="/api/export/personnel"><Download className="size-4 shrink-0" aria-hidden />Exporter</a>
            </Button>
            <Button asChild variant="outline" className="h-10 gap-2 rounded-lg border-slate-200 bg-white px-3.5 text-slate-700 shadow-none hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground">
              <Link href="/dashboard/personnel/importer"><Upload className="size-4 shrink-0" aria-hidden />Importer</Link>
            </Button>
          </> : null}
          <Button asChild className="h-10 gap-2 rounded-lg bg-emerald-700 px-3.5 font-semibold text-white shadow-none hover:bg-emerald-800">
            <Link href={lienCreation}><Plus className="size-4 shrink-0" aria-hidden />{estEnseignant ? "Nouvel enseignant" : "Ajouter un agent"}</Link>
          </Button>
        </div>
      </header>

      <nav aria-label="Catégories du personnel" className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-sm dark:border-border dark:bg-card">
        {onglets.map(onglet => <Link key={onglet.id} href={onglet.lien}
          aria-current={onglet.id === categorie ? "page" : undefined}
          className={"rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 " +
            (onglet.id === categorie ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-muted")}>
          {onglet.titre}
        </Link>)}
      </nav>
      {estEnseignant ? <>
        <FiltresPersonnel matieres={matieres} />
        <ListeEnseignants enseignants={enseignants} creationDemandee={params.nouveau === "1"} />
      </> : <RegistrePersonnelNonEnseignant personnels={nonEnseignants} categorie={categorie} peutGererRoles={peutGererRoles} creationDemandee={params.nouveau === "1"} />}
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
