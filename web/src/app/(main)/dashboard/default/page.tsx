import type { Metadata } from "next";
import Link from "next/link";

import {
  BookOpenCheck,
  CalendarRange,
  Check,
  CircleDashed,
  GraduationCap,
  Lock,
  School,
  UserRoundCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { exigerSession } from "@/server/guard";
import { chargerStatistiques, etapesDemarrage } from "@/server/domain/tableau-de-bord";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

function Indicateur({
  titre,
  valeur,
  detail,
  icone: Icone,
}: {
  titre: string;
  valeur: string | number;
  detail: string;
  icone: typeof School;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{titre}</CardDescription>
          <Icone className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <CardTitle className="font-semibold text-3xl tabular-nums">{valeur}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default async function PageTableauDeBord() {
  const principal = await exigerSession();
  const stats = await chargerStatistiques();
  const etapes = etapesDemarrage(stats);

  const faites = etapes.filter((e) => e.faite).length;
  const configurationTerminee = faites === etapes.length;

  const heure = new Date().getHours();
  const salutation = heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {salutation}, {principal.prenom}.
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {stats.annee
              ? `Année scolaire ${stats.annee.libelle}${stats.periode ? ` — ${stats.periode.libelle}` : ""}`
              : "Aucune année scolaire n'est encore configurée."}
          </p>
        </div>

        {stats.periode ? (
          <div className="flex items-center gap-2">
            {stats.periode.estVerrouillee ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="size-3" aria-hidden />
                Période verrouillée
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <CalendarRange className="size-3" aria-hidden />
                Saisie {stats.periode.saisieOuverte ? "ouverte" : "fermée"}
              </Badge>
            )}
          </div>
        ) : null}
      </div>

      {/* Guide de démarrage — affiché tant que la configuration est incomplète.
          Un tableau de bord vide sans explication ressemble à une panne. */}
      {!configurationTerminee ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Mise en service</CardTitle>
                <CardDescription>
                  {faites} étape{faites > 1 ? "s" : ""} sur {etapes.length} terminée
                  {faites > 1 ? "s" : ""}. Ces éléments conditionnent le fonctionnement du reste
                  de l&apos;application.
                </CardDescription>
              </div>
              <Progress value={(faites / etapes.length) * 100} className="w-40" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {etapes.map((etape) => (
              <div
                key={etape.cle}
                className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
              >
                {etape.faite ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      etape.faite
                        ? "text-muted-foreground text-sm line-through"
                        : "font-medium text-sm"
                    }
                  >
                    {etape.titre}
                  </p>
                  <p className="text-muted-foreground text-xs">{etape.description}</p>
                </div>
                {!etape.faite && etape.url ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={etape.url}>Ouvrir</Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur
          titre="Élèves inscrits"
          valeur={stats.effectifTotal}
          detail={
            stats.effectifTotal > 0
              ? `${stats.effectifGarcons} garçons · ${stats.effectifFilles} filles`
              : "Aucun élève inscrit pour l'instant"
          }
          icone={GraduationCap}
        />
        <Indicateur
          titre="Classes"
          valeur={stats.nbClasses}
          detail={
            stats.nbClasses > 0 && stats.effectifTotal > 0
              ? `${Math.round(stats.effectifTotal / stats.nbClasses)} élèves par classe en moyenne`
              : "De la 6ème à la Terminale"
          }
          icone={School}
        />
        <Indicateur
          titre="Enseignants"
          valeur={stats.nbEnseignants}
          detail={stats.nbEnseignants > 0 ? "En activité" : "Aucun enseignant enregistré"}
          icone={UserRoundCheck}
        />
        <Indicateur
          titre="Matières"
          valeur={stats.nbMatieres}
          detail={
            stats.nbCoefficients > 0
              ? `${stats.nbCoefficients} coefficients définis`
              : "Coefficients non encore saisis"
          }
          icone={BookOpenCheck}
        />
      </div>

      {stats.repartitionParNiveau.some((n) => n.effectif > 0 || n.nbClasses > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle>Effectifs par niveau</CardTitle>
            <CardDescription>Répartition des élèves inscrits sur l&apos;année en cours.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Niveau</th>
                    <th className="pb-2 font-medium">Cycle</th>
                    <th className="pb-2 text-right font-medium">Classes</th>
                    <th className="pb-2 text-right font-medium">Effectif</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.repartitionParNiveau.map((n) => (
                    <tr key={n.niveau} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{n.niveau}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {n.cycle === "COLLEGE" ? "Collège" : "Lycée"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{n.nbClasses}</td>
                      <td className="py-2.5 text-right tabular-nums">{n.effectif}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stats.annee ? (
        <p className="text-muted-foreground text-xs">
          Année du {formatDate(stats.annee.dateDebut)} au {formatDate(stats.annee.dateFin)}.
        </p>
      ) : null}
    </div>
  );
}
