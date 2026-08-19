import type { Metadata } from "next";

import {
  listerEcheances,
  listerPaiements,
  listerSituations,
  listerTarifs,
  listerTranches,
  recouvrementParClasse,
  statistiquesFinancieres,
} from "@/server/domain/finances";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { listerNiveaux } from "@/server/domain/parametres";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
import { Finances } from "./_components/finances";

export const metadata: Metadata = { title: "Finances" };
export const dynamic = "force-dynamic";

export default async function PageFinances({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; inscription?: string }>;
}) {
  await exigerPage("finance:lire");

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Finances</h1>
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="Les frais de scolarité sont propres à une année : grille tarifaire, tranches et échéanciers s'y rattachent."
          manquants={[{ libelle: "Configurer l'année scolaire", url: "/dashboard/parametres" }]}
        />
      </div>
    );
  }

  const { classes } = await listerClassesEtMatieres(annee.id);
  const classeId = params.classe && classes.some((c) => c.id === params.classe) ? params.classe : null;

  const [niveaux, situations, paiements, tarifs, tranches, stats, recouvrement] = await Promise.all([
    listerNiveaux(),
    listerSituations({ anneeId: annee.id, classeId: classeId ?? undefined }),
    listerPaiements({ anneeId: annee.id, limite: 100 }),
    listerTarifs(annee.id),
    listerTranches(annee.id),
    statistiquesFinancieres(annee.id),
    recouvrementParClasse(annee.id),
  ]);

  const inscriptionSelectionnee =
    situations.find((s) => s.inscriptionId === params.inscription) ?? null;
  const echeancesEleve = inscriptionSelectionnee
    ? await listerEcheances(inscriptionSelectionnee.inscriptionId)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Finances</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Année {annee.libelle}. Tous les montants sont en francs CFA, sans décimale.
        </p>
      </div>

      <Finances
        anneeId={annee.id}
        anneeLibelle={annee.libelle}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        niveaux={niveaux.map((n) => ({ id: n.id, libelle: n.libelle }))}
        classeId={classeId}
        situations={situations}
        paiements={paiements}
        tarifs={tarifs}
        tranches={tranches}
        stats={stats}
        recouvrement={recouvrement}
        echeancesEleve={echeancesEleve}
        inscriptionSelectionnee={inscriptionSelectionnee}
      />
    </div>
  );
}
