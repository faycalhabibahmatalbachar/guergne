import type { Metadata } from "next";
import Link from "next/link";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listerAnnees,
  listerClassesAnnee,
  listerCoefficients,
  listerMatieres,
  listerNiveaux,
  listerPeriodes,
  listerSeries,
} from "@/server/domain/parametres";
import { exigerPage } from "@/server/guard";

import { OngletAnnees } from "./_components/annees";
import { OngletClasses } from "./_components/classes";
import { OngletCoefficients } from "./_components/coefficients";
import { OngletMatieres } from "./_components/matieres";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

const ONGLETS = ["annees", "matieres", "coefficients", "classes"] as const;
type Onglet = (typeof ONGLETS)[number];

/**
 * Configuration de l'établissement.
 *
 * Cet écran conditionne tout le reste : sans année scolaire il n'y a pas de
 * classe, sans classe pas d'inscription, sans coefficient pas de moyenne
 * générale, donc pas de bulletin.
 *
 * L'onglet actif passe par l'URL plutôt que par un état local : cela rend
 * chaque onglet partageable et permet de recharger les coefficients d'un
 * couple (niveau, série) côté serveur, sans envoyer toute la grille au client.
 */
export default async function PageParametres({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; niveau?: string; serie?: string }>;
}) {
  await exigerPage("parametre:modifier");

  const params = await searchParams;
  const onglet: Onglet = ONGLETS.includes(params.onglet as Onglet)
    ? (params.onglet as Onglet)
    : "annees";

  const [annees, niveaux, series, matieres] = await Promise.all([
    listerAnnees(),
    listerNiveaux(),
    listerSeries(),
    listerMatieres(),
  ]);

  const anneeCourante = annees.find((a) => a.estCourante) ?? null;

  const periodesParAnnee: Record<string, Awaited<ReturnType<typeof listerPeriodes>>> = {};
  await Promise.all(
    annees.map(async (a) => {
      periodesParAnnee[a.id] = await listerPeriodes(a.id);
    }),
  );

  const classes = anneeCourante ? await listerClassesAnnee(anneeCourante.id) : [];

  // Coefficients du couple (niveau, série) sélectionné dans l'URL.
  const niveauInitial = params.niveau ?? null;
  const serieInitiale = params.serie ?? null;
  const coefficientsInitiaux =
    anneeCourante && niveauInitial
      ? await listerCoefficients(anneeCourante.id, niveauInitial, serieInitiale)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Paramètres</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Configuration de l&apos;établissement — année scolaire, matières, coefficients et classes.
        </p>
      </div>

      <Tabs value={onglet}>
        <TabsList>
          <TabsTrigger value="annees" asChild>
            <Link href="/dashboard/parametres?onglet=annees">Années scolaires</Link>
          </TabsTrigger>
          <TabsTrigger value="matieres" asChild>
            <Link href="/dashboard/parametres?onglet=matieres">Matières &amp; séries</Link>
          </TabsTrigger>
          <TabsTrigger value="coefficients" asChild>
            <Link href="/dashboard/parametres?onglet=coefficients">Coefficients</Link>
          </TabsTrigger>
          <TabsTrigger value="classes" asChild>
            <Link href="/dashboard/parametres?onglet=classes">Classes</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="annees" className="mt-6">
          <OngletAnnees annees={annees} periodesParAnnee={periodesParAnnee} />
        </TabsContent>

        <TabsContent value="matieres" className="mt-6">
          <OngletMatieres matieres={matieres} series={series} />
        </TabsContent>

        <TabsContent value="coefficients" className="mt-6">
          <OngletCoefficients
            annees={annees}
            anneeCourante={anneeCourante}
            niveaux={niveaux}
            series={series}
            matieres={matieres}
            coefficientsInitiaux={coefficientsInitiaux}
            niveauInitial={niveauInitial}
            serieInitiale={serieInitiale}
          />
        </TabsContent>

        <TabsContent value="classes" className="mt-6">
          <OngletClasses
            anneeCourante={anneeCourante}
            classes={classes}
            niveaux={niveaux}
            series={series}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
