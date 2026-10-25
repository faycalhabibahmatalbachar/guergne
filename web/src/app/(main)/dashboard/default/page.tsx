import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, CalendarDays, CircleDashed, GraduationCap, Plus, Wallet, BellRing, CalendarClock } from "lucide-react";

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
import { actionsAutorisees } from "@/server/guard/actions-autorisees";

import { ClassementClasses } from "./_components/classement-classes";
import { Pilotage, type AccesTableauDeBord } from "./_components/pilotage";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

const salutation = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Ndjamena", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
};

export default async function PageTableauDeBord() {
  const acteur = await exigerSession();
  const [stats, droitsUtilisateur] = await Promise.all([
    chargerStatistiques(), actionsAutorisees(acteur.role),
  ]);
  const droits = new Set(droitsUtilisateur);
  const acces: AccesTableauDeBord = {
    eleves: droits.has("eleve:lire"),
    classes: droits.has("classe:lire"),
    assiduite: droits.has("assiduite:lire"),
    notes: droits.has("note:lire"),
    finances: droits.has("finance:lire"),
    communication: droits.has("annonce:lire"),
    personnel: droits.has("utilisateur:creer"),
  };

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
      acces.eleves ? effectifsParNiveau(anneeId) : Promise.resolve([]),
      acces.assiduite ? absencesParMois(anneeId) : Promise.resolve([]),
      acces.notes ? moyennesParClasse(anneeId, periodeId) : Promise.resolve([]),
      acces.notes ? resultatsParMatiere(periodeId) : Promise.resolve([]),
      acces.finances ? evolutionRecouvrement(anneeId) : Promise.resolve([]),
      alertes(anneeId, periodeId),
      acces.notes ? classementClasses(anneeId, periodeId) : Promise.resolve([]),
    ]);


  const modulesAutorises: Record<string, boolean> = {
    "/dashboard/assiduite": acces.assiduite,
    "/dashboard/notes": acces.notes,
    "/dashboard/finances": acces.finances,
    "/dashboard/eleves": acces.eleves,
    "/dashboard/communication": acces.communication,
  };
  const alertesVisibles = listeAlertes.filter((a) => modulesAutorises[a.url] ?? false);
  const dateTchad = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Ndjamena", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
  const anneeTerminee = Date.parse(stats.annee.dateFin + "T23:59:59+01:00") < Date.now();

  return (
    <main className="space-y-5 pb-7 text-slate-950 dark:text-foreground">
      <header className="flex flex-col gap-3 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-end lg:justify-between dark:border-border">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-muted-foreground">
            <GraduationCap className="size-4 text-blue-800 dark:text-blue-300" aria-hidden />
            Espace de pilotage
          </div>
          <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            {salutation()}, {acteur.prenom}. Voici les priorités de l'établissement.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{dateTchad}</span>
            <span className="rounded-lg border border-slate-200 px-2 py-1 dark:border-border">Année {stats.annee.libelle}</span>
            {stats.periode ? <span className="rounded-lg border border-slate-200 px-2 py-1 dark:border-border">{stats.periode.libelle}</span> : null}
          </div>
          {anneeTerminee ? <p role="status" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            L'année scolaire active est terminée selon ses dates enregistrées. Vérifiez le paramétrage avant de saisir de nouvelles données.
          </p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {droits.has("message:envoyer") ? <Button asChild size="sm" variant="outline" className="h-10 gap-2 bg-white dark:bg-card">
            <Link href="/dashboard/communication"><BellRing className="size-4" aria-hidden />Communiquer</Link>
          </Button> : null}
          {droits.has("finance:encaisser") ? <Button asChild size="sm" variant="outline" className="h-10 gap-2 bg-white dark:bg-card">
            <Link href="/dashboard/finances"><Wallet className="size-4" aria-hidden />Encaissements</Link>
          </Button> : null}
          {droits.has("eleve:inscrire") ? <Button asChild size="sm" className="h-10 gap-2 bg-[#193D7A] text-white hover:bg-[#152F61]">
            <Link href="/dashboard/eleves?inscription=1"><Plus className="size-4" aria-hidden />Inscrire un élève</Link>
          </Button> : droits.has("emploi_du_temps:lire") ? <Button asChild size="sm" variant="outline" className="h-10 gap-2">
            <Link href="/dashboard/emploi-du-temps"><CalendarClock className="size-4" aria-hidden />Emploi du temps</Link>
          </Button> : null}
        </div>
      </header>

      <Pilotage
        indicateurs={indicateurs}
        niveaux={niveaux}
        absences={absences}
        classes={classes}
        matieres={matieres}
        recouvrement={recouvrement}
        listeAlertes={alertesVisibles}
        acces={acces}
      />

      {acces.notes ? <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Détail des résultats par classe</h2>
            <p className="text-xs text-slate-500 dark:text-muted-foreground">Comparaison exhaustive des classes, sans doublon dans la synthèse.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/notes">Ouvrir les notes<ArrowRight className="ml-1 size-3.5" aria-hidden /></Link></Button>
        </div>
        <ClassementClasses lignes={classement} />
      </section> : null}
    </main>
  );
}
