import type { Metadata } from "next";
import Link from "next/link";

import { School, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { BoutonNotifier } from "../_components/bouton-notifier";
import { Progress } from "@/components/ui/progress";
import { exigerPage } from "@/server/guard";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { listerClassesCourantes } from "@/server/domain/eleves";

import { Prerequis } from "../_components/prerequis";

export const metadata: Metadata = { title: "Classes" };
export const dynamic = "force-dynamic";

export default async function PageClasses() {
  await exigerPage("classe:lire");

  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Classes</h1>
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="Une classe appartient toujours à une année scolaire précise. Créez l'année en cours avant de constituer les classes."
          manquants={[{ libelle: "Configurer l'année scolaire" }]}
        />
      </div>
    );
  }

  const classes = await listerClassesCourantes();
  const effectifTotal = classes.reduce((somme, c) => somme + Number(c.effectif), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Classes</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Année {annee.libelle}
          {classes.length > 0
            ? ` — ${classes.length} classe${classes.length > 1 ? "s" : ""}, ${effectifTotal} élève${effectifTotal > 1 ? "s" : ""}`
            : ""}
        </p>
      </div>

      {classes.length === 0 ? (
        <Prerequis
          titre="Aucune classe n'a encore été créée"
          explication="Créez les classes de la 6ème à la Terminale. Au lycée, chaque classe porte en plus sa série (A1, A4, C, D ou G)."
          manquants={[{ libelle: "Créer les classes" }]}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const effectif = Number(c.effectif);
            const taux = c.capaciteMax ? (effectif / c.capaciteMax) * 100 : 0;
            const saturee = c.capaciteMax ? effectif >= c.capaciteMax : false;

            return (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{c.libelle}</CardTitle>
                      <CardDescription>{c.niveauLibelle}</CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {c.code}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5" aria-hidden />
                      Effectif
                    </span>
                    <span className="font-medium tabular-nums">
                      {effectif}
                      {c.capaciteMax ? (
                        <span className="text-muted-foreground"> / {c.capaciteMax}</span>
                      ) : null}
                    </span>
                  </div>

                  {c.capaciteMax ? <Progress value={Math.min(100, taux)} /> : null}

                  {saturee ? (
                    <p className="text-amber-600 text-xs dark:text-amber-400">
                      Capacité atteinte — toute inscription supplémentaire sera refusée.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Link
                      href={`/dashboard/eleves?classe=${c.id}`}
                      className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                    >
                      <School className="size-3.5" aria-hidden />
                      Voir les élèves
                    </Link>
                    {/*
                      Prévenir une classe entière depuis sa carte : c'est ici
                      qu'on décide « il faut prévenir la 6ème A », pas dans un
                      écran de communication où il faudrait la retrouver.
                    */}
                    {effectif > 0 ? (
                      <BoutonNotifier
                        cible={{ type: "classe", id: c.id, nom: c.libelle }}
                        variante="ghost"
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
