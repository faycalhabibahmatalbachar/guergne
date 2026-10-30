import type { Metadata } from "next";

import { listerAnnees, listerClassesAnnee, listerNiveaux, listerSeries } from "@/server/domain/parametres";
import { listerEnseignants } from "@/server/domain/personnel";
import { exigerPage } from "@/server/guard";
import { actionsAutorisees } from "@/server/guard/actions-autorisees";

import { Prerequis } from "../_components/prerequis";
import { ClassesDashboard } from "./classes-dashboard";
import "./classes-dashboard.css";

export const metadata: Metadata = { title: "Classes" };
export const dynamic = "force-dynamic";

export default async function PageClasses({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const principal = await exigerPage("classe:lire");

  const [annees, niveaux, series, actions] = await Promise.all([
    listerAnnees(),
    listerNiveaux(),
    listerSeries(),
    actionsAutorisees(principal.role),
  ]);
  const params = await searchParams;
  const annee = annees.find((a) => a.id === params.annee) ?? annees.find((a) => a.estCourante) ?? null;

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold tracking-tight">Classes</h1>
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="Créez l'année scolaire avant de constituer les classes."
          manquants={[{ libelle: "Configurer l'année scolaire" }]}
        />
      </div>
    );
  }

  const peutVoirPersonnel = actions.includes("enseignant:lire");
  const [classes, listeEnseignants] = await Promise.all([
    listerClassesAnnee(annee.id),
    peutVoirPersonnel ? listerEnseignants(annee.id, { activite: "actif" }) : Promise.resolve(null),
  ]);

  return (
    <ClassesDashboard
      annee={annee}
      annees={annees}
      classes={classes}
      niveaux={niveaux}
      series={series}
      enseignants={listeEnseignants?.length ?? null}
      peutCreer={actions.includes("classe:creer")}
      peutModifier={actions.includes("classe:modifier")}
      peutVoirPersonnel={peutVoirPersonnel}
      peutNotifier={actions.includes("message:envoyer")}
      peutImprimer={actions.includes("eleve:lire")}
    />
  );
}
