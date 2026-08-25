import type { Metadata } from "next";
import Link from "next/link";

import { CalendarClock, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  chargerEmploiDuTemps,
  listerClassesEtMatieres,
  listerCreneaux,
  listerEnseignants,
  listerSalles,
} from "@/server/domain/personnel";
import { controleHoraire } from "@/server/domain/emploi-du-temps";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
import { ControleHoraire } from "./_components/controle-horaire";
import { Grille } from "./_components/grille";
import { SelecteurCible } from "./_components/selecteur-cible";

export const metadata: Metadata = { title: "Emploi du temps" };
export const dynamic = "force-dynamic";

const VUES = ["classe", "enseignant", "salle"] as const;
type Vue = (typeof VUES)[number];

export default async function PageEmploiDuTemps({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; cible?: string }>;
}) {
  await exigerPage("emploi_du_temps:lire");

  const params = await searchParams;
  const vue: Vue = VUES.includes(params.vue as Vue) ? (params.vue as Vue) : "classe";

  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Emploi du temps</h1>
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="L'emploi du temps est propre à une année scolaire."
          manquants={[{ libelle: "Configurer l'année scolaire", url: "/dashboard/parametres" }]}
        />
      </div>
    );
  }

  const [{ classes, matieres }, enseignants, salles, creneaux] = await Promise.all([
    listerClassesEtMatieres(annee.id),
    listerEnseignants(annee.id),
    listerSalles(),
    listerCreneaux(),
  ]);

  const enseignantsActifs = enseignants.filter((e) => e.actif);
  const sallesActives = salles.filter((s) => s.active);

  const cibles: Array<{ id: string; libelle: string }> =
    vue === "classe"
      ? classes.map((c) => ({ id: c.id, libelle: c.libelle }))
      : vue === "enseignant"
        ? enseignantsActifs.map((e) => ({ id: e.id, libelle: `${e.prenom} ${e.nom}` }))
        : sallesActives.map((s) => ({ id: s.id, libelle: `${s.code} — ${s.libelle}` }));

  const cibleId = params.cible && cibles.some((c) => c.id === params.cible) ? params.cible : cibles[0]?.id;

  const manquants: Array<{ libelle: string; url?: string }> = [];
  if (creneaux.length === 0) manquants.push({ libelle: "Définir les créneaux horaires" });
  if (classes.length === 0)
    manquants.push({ libelle: "Créer les classes", url: "/dashboard/parametres?onglet=classes" });
  if (vue === "enseignant" && enseignantsActifs.length === 0)
    manquants.push({ libelle: "Enregistrer les enseignants", url: "/dashboard/personnel" });
  if (vue === "salle" && sallesActives.length === 0)
    manquants.push({ libelle: "Créer les salles", url: "/dashboard/parametres?onglet=salles" });

  const [cours, couverture] = await Promise.all([
    cibleId ? chargerEmploiDuTemps(annee.id, { type: vue, id: cibleId }) : Promise.resolve([]),
    // Le contrôle porte sur TOUTE l'année, pas sur la cible affichée : une
    // matière manquante en 4e B ne se découvre pas en regardant la 6e A. C'est
    // précisément parce qu'il faut ouvrir vingt grilles pour la trouver que
    // personne ne la trouve.
    controleHoraire(annee.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Emploi du temps</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Un professeur, une classe ou une salle ne peuvent pas être à deux endroits au même moment :
          ces trois conflits sont refusés à l&apos;enregistrement.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={vue}>
          <TabsList>
            <TabsTrigger value="classe" asChild>
              <Link href="/dashboard/emploi-du-temps?vue=classe">Par classe</Link>
            </TabsTrigger>
            <TabsTrigger value="enseignant" asChild>
              <Link href="/dashboard/emploi-du-temps?vue=enseignant">Par enseignant</Link>
            </TabsTrigger>
            <TabsTrigger value="salle" asChild>
              <Link href="/dashboard/emploi-du-temps?vue=salle">Par salle</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/*
          La journée est un autre écran, pas un quatrième onglet : la grille
          hebdomadaire sert à CONSTRUIRE l'emploi du temps, la journée à le
          faire tenir quand un professeur manque. Deux métiers, deux moments.
        */}
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/emploi-du-temps/journee">
            <CalendarClock aria-hidden />
            Journée et remplacements
          </Link>
        </Button>
      </div>

      {/*
        Au-dessus de la grille : c'est un état de santé, pas un détail de
        construction. Le placer en bas reviendrait à le réserver à qui déroule
        la page — c'est-à-dire à personne.
      */}
      {manquants.length === 0 && cibleId ? <ControleHoraire couverture={couverture} /> : null}

      {manquants.length > 0 || !cibleId ? (
        <Prerequis
          titre="L'emploi du temps ne peut pas encore être construit"
          explication="Il croise des classes, des matières, des enseignants et des salles. Voici ce qui manque."
          manquants={manquants.length > 0 ? manquants : [{ libelle: "Aucun élément à afficher" }]}
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <SelecteurCible vue={vue} cibles={cibles} cibleId={cibleId} />
              {/*
                Le PDF plutôt que l'impression du navigateur : celle-ci
                emporterait les boutons et les marges propres à chaque poste.
                La feuille finit affichée au mur d'une salle et doit se lire
                seule.
              */}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/emploi-du-temps/${vue}/${cibleId}`} target="_blank" rel="noreferrer">
                  <Printer aria-hidden />
                  Imprimer
                </a>
              </Button>
            </CardContent>
          </Card>

          <Grille
            anneeId={annee.id}
            anneeLibelle={annee.libelle}
            portee={vue}
            cibleId={cibleId}
            cours={cours}
            creneaux={creneaux}
            classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
            matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
            enseignants={enseignantsActifs.map((e) => ({
              id: e.id,
              libelle: `${e.prenom} ${e.nom}`,
            }))}
            salles={sallesActives.map((s) => ({ id: s.id, libelle: `${s.code} — ${s.libelle}` }))}
          />
        </>
      )}
    </div>
  );
}
