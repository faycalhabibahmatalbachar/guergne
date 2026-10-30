import Link from "next/link";

import { ArrowRight, BellRing, CalendarClock, CircleDashed, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
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
import { type AccesTableauDeBord, Pilotage } from "./_components/pilotage";
import "./gentelella-tokens.css";
import "./gentelella-layout.css";
import "./gentelella-components.css";
import "./gentelella-widgets.css";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

export default async function PageTableauDeBord() {
  const acteur = await exigerSession();
  const [stats, droitsUtilisateur] = await Promise.all([chargerStatistiques(), actionsAutorisees(acteur.role)]);
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
      <Page>
        <EnTetePage titre="Bienvenue." description={<>Aucune année scolaire n&apos;est encore configurée.</>} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mise en service</CardTitle>
            <CardDescription>
              {faites} étape sur {etapes.length} terminée. Ces éléments conditionnent le fonctionnement du reste de
              l&apos;application.
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
                    className={`mt-0.5 size-4 shrink-0 ${etape.faite ? "text-succes" : "text-muted-foreground"}`}
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
      </Page>
    );
  }

  const anneeId = stats.annee.id;
  const periodeId = stats.periode?.id ?? null;

  // Les huit requêtes partent en parallèle : séquentielles, elles cumuleraient
  // huit allers-retours vers Francfort avant le premier octet affiché.
  const [indicateurs, niveaux, absences, classes, matieres, recouvrement, listeAlertes, classement] = await Promise.all(
    [
      indicateursCles(anneeId, periodeId),
      acces.eleves ? effectifsParNiveau(anneeId) : Promise.resolve([]),
      acces.assiduite ? absencesParMois(anneeId) : Promise.resolve([]),
      acces.notes ? moyennesParClasse(anneeId, periodeId) : Promise.resolve([]),
      acces.notes ? resultatsParMatiere(periodeId) : Promise.resolve([]),
      acces.finances ? evolutionRecouvrement(anneeId) : Promise.resolve([]),
      alertes(anneeId, periodeId),
      acces.notes ? classementClasses(anneeId, periodeId) : Promise.resolve([]),
    ],
  );

  const modulesAutorises: Record<string, boolean> = {
    "/dashboard/assiduite": acces.assiduite,
    "/dashboard/notes": acces.notes,
    "/dashboard/finances": acces.finances,
    "/dashboard/eleves": acces.eleves,
    "/dashboard/communication": acces.communication,
  };
  const alertesVisibles = listeAlertes.filter((a) => modulesAutorises[a.url] ?? false);
  const dateTchad = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Ndjamena",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const anneeTerminee = Date.parse(stats.annee.dateFin + "T23:59:59+01:00") < Date.now();

  return (
    <main className="gentelella-v4 min-w-0 space-y-6 pb-6" data-skin="gentelella-v4">
      {/*
        En-tête de page commun à toute l'administration. L'icône de 28 px qui
        précédait le titre a disparu : le fil d'Ariane de l'en-tête global dit
        déjà où l'on se trouve, et aucune autre page n'en portait.
      */}
      <EnTetePage
        titre={<>Bonjour, {acteur.prenom}.</>}
        description={
          <>
            {dateTchad} · {stats.annee.libelle}
            {stats.periode ? " · " + stats.periode.libelle : ""}
            {anneeTerminee ? (
              <span role="status" className="mt-1 block font-medium text-alerte text-xs">
                Année scolaire à vérifier.
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            {droits.has("message:envoyer") ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/communication">
                  <BellRing aria-hidden />
                  Messages
                </Link>
              </Button>
            ) : null}
            {droits.has("finance:encaisser") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/finances">
                  <Wallet aria-hidden />
                  Finances
                </Link>
              </Button>
            ) : null}
            {/*
              L'action principale était en vert. Le vert signifie « payé,
              présent, admis » dans tout le reste du logiciel : l'employer pour
              un bouton lui retire ce sens.
            */}
            {droits.has("eleve:inscrire") ? (
              <Button asChild size="sm">
                <Link href="/dashboard/eleves?inscription=1">
                  <Plus aria-hidden />
                  Inscrire un élève
                </Link>
              </Button>
            ) : droits.has("emploi_du_temps:lire") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/emploi-du-temps">
                  <CalendarClock aria-hidden />
                  Emploi du temps
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

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

      {acces.notes ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Résultats par classe</h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/notes">
                Notes
                <ArrowRight className="ml-1 size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
          <ClassementClasses lignes={classement} />
        </section>
      ) : null}
    </main>
  );
}
