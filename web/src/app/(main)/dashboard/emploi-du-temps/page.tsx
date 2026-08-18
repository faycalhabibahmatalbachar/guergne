import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  chargerEmploiDuTemps,
  listerClassesEtMatieres,
  listerCreneaux,
  listerEnseignants,
  listerSalles,
} from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
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

  const cours = cibleId ? await chargerEmploiDuTemps(annee.id, { type: vue, id: cibleId }) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Emploi du temps</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Un professeur, une classe ou une salle ne peuvent pas être à deux endroits au même moment :
          ces trois conflits sont refusés à l&apos;enregistrement.
        </p>
      </div>

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

      {manquants.length > 0 || !cibleId ? (
        <Prerequis
          titre="L'emploi du temps ne peut pas encore être construit"
          explication="Il croise des classes, des matières, des enseignants et des salles. Voici ce qui manque."
          manquants={manquants.length > 0 ? manquants : [{ libelle: "Aucun élément à afficher" }]}
        />
      ) : (
        <>
          <Card>
            <CardContent className="py-4">
              <SelecteurCible vue={vue} cibles={cibles} cibleId={cibleId} />
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
