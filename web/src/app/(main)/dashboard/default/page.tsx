import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, CircleDashed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  absencesParMois,
  alertes,
  classementClasses,
  effectifsParNiveau,
  evolutionRecouvrement,
  indicateursCles,
  moyennesParClasse,
  resultatsParMatiere,
} from "@/server/domain/pilotage";
import { chargerStatistiques, etapesDemarrage } from "@/server/domain/tableau-de-bord";
import { exigerSession } from "@/server/guard";

import { ClassementClasses } from "./_components/classement-classes";
import { Pilotage } from "./_components/pilotage";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

const salutation = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
};

export default async function PageTableauDeBord() {
  const acteur = await exigerSession();
  const stats = await chargerStatistiques();

  // Tant que l'établissement n'est pas configuré, le pilotage n'afficherait
  // que des zéros : on montre le guide de mise en service à la place.
  if (!stats.annee) {
    const etapes = etapesDemarrage(stats);
    const faites = etapes.filter((e) => e.faite).length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {salutation()}, {acteur.prenom}.
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Aucune année scolaire n&apos;est encore configurée.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mise en service</CardTitle>
            <CardDescription>
              {faites} étape sur {etapes.length} terminée. Ces éléments conditionnent le
              fonctionnement du reste de l&apos;application.
            </CardDescription>
            <Progress value={(faites / etapes.length) * 100} className="mt-3" />
          </CardHeader>
          <CardContent className="space-y-3">
            {etapes.map((etape) => (
              <div
                key={etape.titre}
                className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-start gap-3">
                  <CircleDashed
                    className={`mt-0.5 size-4 shrink-0 ${etape.faite ? "text-emerald-600" : "text-muted-foreground"}`}
                    aria-hidden
                  />
                  <div>
                    <p className="font-medium text-sm">{etape.titre}</p>
                    <p className="text-muted-foreground text-xs">{etape.description}</p>
                  </div>
                </div>
                {etape.url ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={etape.url}>
                      Ouvrir
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const anneeId = stats.annee.id;
  const periodeId = stats.periode?.id ?? null;

  // Les huit requêtes partent en parallèle : séquentielles, elles cumuleraient
  // huit allers-retours vers Francfort avant le premier octet affiché.
  const [indicateurs, niveaux, absences, classes, matieres, recouvrement, listeAlertes, classement] =
    await Promise.all([
      indicateursCles(anneeId, periodeId),
      effectifsParNiveau(anneeId),
      absencesParMois(anneeId),
      moyennesParClasse(anneeId, periodeId),
      resultatsParMatiere(periodeId),
      evolutionRecouvrement(anneeId),
      alertes(anneeId, periodeId),
      classementClasses(anneeId, periodeId),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          {salutation()}, {acteur.prenom}.
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Année {stats.annee.libelle}
          {stats.periode ? ` — ${stats.periode.libelle}` : ""}
        </p>
      </div>

      <Pilotage
        indicateurs={indicateurs}
        niveaux={niveaux}
        absences={absences}
        classes={classes}
        matieres={matieres}
        recouvrement={recouvrement}
        listeAlertes={listeAlertes}
      />

      <ClassementClasses lignes={classement} />
    </div>
  );
}
