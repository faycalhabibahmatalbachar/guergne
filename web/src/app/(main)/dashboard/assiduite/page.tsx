import type { Metadata } from "next";

import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import {
  listerAbsences,
  listerAlertes,
  listerElevesClasse,
  statistiquesVieScolaire,
} from "@/server/domain/vie-scolaire";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
import { Assiduite } from "./_components/assiduite";

export const metadata: Metadata = { title: "Assiduité" };
export const dynamic = "force-dynamic";

export default async function PageAssiduite({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string }>;
}) {
  await exigerPage("assiduite:lire");

  const params = await searchParams;
  const { annee, periode } = await chargerStatistiques();

  if (!annee || !periode) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Assiduité</h1>
        <Prerequis
          titre="Aucune période d'évaluation en cours"
          explication="Une absence se rattache toujours à une période — c'est ce qui permet de la reporter sur le bon bulletin."
          manquants={[{ libelle: "Configurer l'année et ses trimestres", url: "/dashboard/parametres" }]}
        />
      </div>
    );
  }

  const periodeId = periode.id;
  const { classes, matieres } = await listerClassesEtMatieres(annee.id);
  const classeId = params.classe && classes.some((c) => c.id === params.classe) ? params.classe : null;

  const [eleves, absences, alertes, stats] = await Promise.all([
    classeId ? listerElevesClasse(classeId) : Promise.resolve([]),
    listerAbsences({ periodeId, limite: 100 }),
    listerAlertes(periodeId),
    statistiquesVieScolaire(periodeId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Assiduité</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Année {annee.libelle} — {periode.libelle}
        </p>
      </div>

      {classes.length === 0 ? (
        <Prerequis
          titre="Aucune classe n'existe pour cette année"
          explication="L'appel se fait classe par classe."
          manquants={[{ libelle: "Créer les classes", url: "/dashboard/parametres?onglet=classes" }]}
        />
      ) : (
        <Assiduite
          periodeId={periodeId}
          classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
          matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
          classeId={classeId}
          eleves={eleves}
          absences={absences}
          alertes={alertes}
          stats={stats}
        />
      )}
    </div>
  );
}
