import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CheckCircle2, CircleAlert, ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { chargerIdentiteLycee } from "@/server/domain/identite-lycee";
import {
  compterCoefficients,
  listerAnnees,
  listerClassesAnnee,
  listerMatieres,
  listerPeriodes,
} from "@/server/domain/parametres";
import { exigerPage } from "@/server/guard";

export const metadata: Metadata = { title: "Diagnostic de configuration — Paramètres" };
export const dynamic = "force-dynamic";

type Controle = {
  titre: string;
  detail: string;
  valide: boolean;
  url: string;
  correction: string;
  precision?: string;
};

export default async function PageDiagnosticParametres() {
  await exigerPage("parametre:modifier");

  const [identite, annees, matieres] = await Promise.all([
    chargerIdentiteLycee(),
    listerAnnees(),
    listerMatieres(),
  ]);

  const annee = annees.find((a) => a.estCourante) ?? null;
  const [periodes, classes, nbCoefficients] = annee
    ? await Promise.all([
      listerPeriodes(annee.id),
      listerClassesAnnee(annee.id),
      compterCoefficients(annee.id),
    ])
    : [[], [], 0];

  const periodesValides = Boolean(annee) &&
    periodes.length === (annee?.typePeriode === "TRIMESTRE" ? 3 : 2) &&
    periodes.every((p, index) => {
      if (!annee || p.dateDebut < annee.dateDebut || p.dateFin > annee.dateFin || p.dateFin < p.dateDebut) {
        return false;
      }
      const precedente = periodes[index - 1];
      return !precedente || p.dateDebut > precedente.dateFin;
    });

  const controles: Controle[] = [
    {
      titre: "Fiche institutionnelle",
      detail: identite
        ? "La fiche unique du lycée existe dans la base."
        : "La fiche officielle du lycée est absente.",
      valide: Boolean(identite?.nom && identite?.sigle),
      url: "/dashboard/parametres/etablissement",
      correction: "Voir la fiche",
    },
    {
      titre: "Coordonnées de contact",
      detail: identite?.telephone || identite?.email
        ? "Au moins un moyen de contact administratif est renseigné."
        : "Renseignez un numéro ou une adresse e-mail pour les communications officielles.",
      valide: Boolean(identite?.telephone || identite?.email),
      url: "/dashboard/parametres/etablissement",
      correction: "Compléter les coordonnées",
    },
    {
      titre: "Année scolaire courante",
      detail: annee
        ? `Année active : ${annee.libelle}.`
        : "Aucune année n'est désignée comme courante.",
      valide: Boolean(annee),
      url: "/dashboard/parametres?onglet=annees",
      correction: "Gérer les années",
    },
    {
      titre: "Cohérence des périodes",
      detail: !annee
        ? "Choisissez d'abord une année courante."
        : periodesValides
          ? `${periodes.length} périodes datées et sans chevauchement pour ${annee.libelle}.`
          : "Nombre, dates ou ordre des périodes à vérifier (chevauchements interdits).",
      valide: periodesValides,
      url: "/dashboard/parametres?onglet=annees",
      correction: "Vérifier les périodes",
    },
    {
      titre: "Catalogue des matières",
      detail: `${matieres.filter((m) => m.active).length} matière(s) active(s) dans le référentiel.`,
      valide: matieres.some((m) => m.active),
      url: "/dashboard/parametres?onglet=matieres",
      correction: "Gérer les matières",
    },
    {
      titre: "Classes de l'année",
      detail: annee
        ? `${classes.length} classe(s) configurée(s) pour l'année courante.`
        : "Impossible de consulter les classes sans année courante.",
      valide: classes.length > 0,
      url: "/dashboard/parametres?onglet=classes",
      correction: "Gérer les classes",
    },
    {
      titre: "Inscriptions actives",
      detail: annee
        ? `${annee.nbInscriptions} inscription(s) active(s) pour l'année.`
        : "Aucune année active pour consulter les inscriptions.",
      valide: Boolean(annee && annee.nbInscriptions > 0),
      url: "/dashboard/eleves",
      correction: "Consulter les élèves",
    },
    {
      titre: "Coefficients de l'année",
      detail: annee
        ? `${nbCoefficients} coefficient(s) enregistré(s) pour l'année active.`
        : "Choisissez une année pour configurer les coefficients.",
      valide: nbCoefficients > 0,
      url: "/dashboard/parametres?onglet=coefficients",
      correction: "Vérifier les coefficients",
      precision: "Ce contrôle vérifie leur existence, pas la couverture complète de chaque niveau et série.",
    },
  ];
  const reussis = controles.filter((c) => c.valide).length;

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-8">
      <Button asChild size="sm" variant="ghost">
        <Link href="/dashboard/parametres">
          <ArrowLeft className="size-4" aria-hidden />
          Tous les paramètres
        </Link>
      </Button>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardCheck className="size-6 text-primary" aria-hidden />
          Diagnostic de configuration
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          Contrôles en lecture seule calculés à partir des données réelles de La Renaissance.
          Aucun élève, paiement ou bulletin n'est modifié par cette vérification.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Contrôles du référentiel</CardTitle>
              <CardDescription>État observé au chargement de cette page.</CardDescription>
            </div>
            <Badge variant="outline" className="tabular-nums">
              {reussis} / {controles.length} vérifiés
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {controles.map((controle) => (
              <div key={controle.titre} className="flex flex-col justify-between gap-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  {controle.valide
                    ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Contrôle satisfait" />
                    : <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-label="À examiner" />}
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-medium text-sm">{controle.titre}</h2>
                    <p className="text-muted-foreground text-xs">{controle.detail}</p>
                    {controle.precision ? (
                      <p className="text-muted-foreground text-xs italic">{controle.precision}</p>
                    ) : null}
                  </div>
                </div>
                <Link href={controle.url} className="inline-flex items-center gap-1 self-start text-primary text-xs font-medium hover:underline">
                  {controle.correction}
                  <ArrowUpRight className="size-3" aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        Une coche confirme uniquement la condition décrite. Ce diagnostic ne remplace pas la
        recette des permissions, des barèmes, des factures, des notifications ou des bulletins.
      </p>
    </main>
  );
}
