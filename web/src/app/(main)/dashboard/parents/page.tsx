import type { Metadata } from "next";

import { listerTuteurs, statistiquesParents } from "@/server/domain/parents";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Parents } from "./_components/parents";

export const metadata: Metadata = { title: "Comptes parents" };
export const dynamic = "force-dynamic";

export default async function PageParents({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; etat?: string; classe?: string; page?: string }>;
}) {
  await exigerPage("tuteur:gerer");

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  const filtres = {
    recherche: params.recherche ?? "",
    etat: params.etat ?? "",
    classeId: params.classe ?? "",
  };

  const [resultat, stats, referentiel] = await Promise.all([
    listerTuteurs({
      recherche: filtres.recherche,
      etat: filtres.etat,
      classeId: filtres.classeId,
      page: Number(params.page) || 1,
    }),
    statistiquesParents(),
    annee ? listerClassesEtMatieres(annee.id) : Promise.resolve({ classes: [], matieres: [] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Comptes parents</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          L&apos;accès se fait par numéro de téléphone et code d&apos;activation, sans mot de passe :
          un parent change souvent de téléphone, rarement de numéro.
        </p>
      </div>

      <Parents
        tuteurs={resultat.lignes}
        total={resultat.total}
        page={resultat.page}
        parPage={resultat.parPage}
        classes={referentiel.classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        stats={stats}
        filtres={filtres}
      />
    </div>
  );
}
