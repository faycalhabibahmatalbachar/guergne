import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import {
  listerEcheances,
  listerPaiements,
  listerSituations,
  listerTarifs,
  listerTranches,
  recouvrementParClasse,
  statistiquesFinancieres,
} from "@/server/domain/finances";
import { listerNiveaux } from "@/server/domain/parametres";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
import { FiltresFinances } from "./_components/filtres-finances";
import { Finances } from "./_components/finances";

export const metadata: Metadata = { title: "Finances" };
export const dynamic = "force-dynamic";

export default async function PageFinances({
  searchParams,
}: {
  searchParams: Promise<{
    classe?: string;
    inscription?: string;
    q?: string;
    impayes?: string;
    retard?: string;
    boursier?: string;
  }>;
}) {
  await exigerPage("finance:lire");

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <Page>
        <EnTetePage titre="Finances" />
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="Les frais de scolarité sont propres à une année : grille tarifaire, tranches et échéanciers s'y rattachent."
          manquants={[{ libelle: "Configurer l'année scolaire", url: "/dashboard/parametres" }]}
        />
      </Page>
    );
  }

  const { classes } = await listerClassesEtMatieres(annee.id);
  const classeId = params.classe && classes.some((c) => c.id === params.classe) ? params.classe : null;

  const [niveaux, situations, paiements, tarifs, tranches, stats, recouvrement] = await Promise.all([
    listerNiveaux(),
    listerSituations({
      anneeId: annee.id,
      classeId: classeId ?? undefined,
      recherche: params.q || undefined,
      seulementImpayes: Boolean(params.impayes),
      enRetard: Boolean(params.retard),
      // Trois états et non deux : « tous », « boursiers », « non boursiers ».
      // Un booléen n'en exprimerait que deux.
      boursier: params.boursier === "oui" ? true : params.boursier === "non" ? false : undefined,
    }),
    listerPaiements({ anneeId: annee.id, limite: 100 }),
    listerTarifs(annee.id),
    listerTranches(annee.id),
    statistiquesFinancieres(annee.id),
    recouvrementParClasse(annee.id),
  ]);

  const inscriptionSelectionnee = situations.find((s) => s.inscriptionId === params.inscription) ?? null;
  const echeancesEleve = inscriptionSelectionnee ? await listerEcheances(inscriptionSelectionnee.inscriptionId) : [];

  return (
    <Page>
      <EnTetePage
        titre="Finances"
        description={<>Année {annee.libelle}. Tous les montants sont en francs CFA, sans décimale.</>}
      />

      <FiltresFinances classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))} />

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
    </Page>
  );
}
