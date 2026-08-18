import type { Metadata } from "next";

import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { listerElevesClasse, listerIncidents, listerSanctions } from "@/server/domain/vie-scolaire";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
import { Discipline } from "./_components/discipline";

export const metadata: Metadata = { title: "Discipline" };
export const dynamic = "force-dynamic";

export default async function PageDiscipline({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string }>;
}) {
  await exigerPage("discipline:lire");

  const params = await searchParams;
  const { annee, periode } = await chargerStatistiques();

  if (!annee || !periode) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Discipline</h1>
        <Prerequis
          titre="Aucune période d'évaluation en cours"
          explication="Un incident se rattache à une période, ce qui permet de le reporter sur le bon bulletin et d'établir les statistiques du trimestre."
          manquants={[{ libelle: "Configurer l'année et ses trimestres", url: "/dashboard/parametres" }]}
        />
      </div>
    );
  }

  const { classes } = await listerClassesEtMatieres(annee.id);
  const classeId = params.classe && classes.some((c) => c.id === params.classe) ? params.classe : null;

  const [eleves, incidents, sanctions] = await Promise.all([
    classeId ? listerElevesClasse(classeId) : Promise.resolve([]),
    listerIncidents({ periodeId: periode.id }),
    listerSanctions({ periodeId: periode.id }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Discipline</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Année {annee.libelle} — {periode.libelle}. Chaque décision est conservée avec son auteur et
          son motif, sans possibilité de modification.
        </p>
      </div>

      {classes.length === 0 ? (
        <Prerequis
          titre="Aucune classe n'existe pour cette année"
          explication="Un incident se rattache à un élève inscrit dans une classe."
          manquants={[{ libelle: "Créer les classes", url: "/dashboard/parametres?onglet=classes" }]}
        />
      ) : (
        <Discipline
          periodeId={periode.id}
          classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
          classeId={classeId}
          eleves={eleves}
          incidents={incidents}
          sanctions={sanctions}
        />
      )}
    </div>
  );
}
