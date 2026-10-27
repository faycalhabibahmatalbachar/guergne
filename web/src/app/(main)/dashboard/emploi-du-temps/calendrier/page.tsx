import type { Metadata } from "next";
import Link from "next/link";

import { CalendarDays, ArrowLeft } from "lucide-react";
import { sql } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sessionCourante } from "@/server/auth/session";
import { db } from "@/server/db";
import { genererDatesCalendrier } from "@/server/domain/calendrier-scolaire";
import { exigerPage, peut } from "@/server/guard";

import { VueCalendrierAnnuel } from "./vue";

export const metadata: Metadata = { title: "Calendrier scolaire annuel" };
export const dynamic = "force-dynamic";

interface AnneeLigne {
  [key: string]: unknown;
  id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  est_courante: boolean;
}

interface EvenementLigne {
  [key: string]: unknown;
  id: string;
  type: string;
  titre: string;
  description: string | null;
  date_debut: string;
  date_fin: string;
  visible_parents: boolean;
  impact_cours: string;
  statut_validation: string;
  source_officielle: string | null;
  source_verifiee_le: string | null;
}

export default async function PageCalendrierAnnuel({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  await exigerPage("emploi_du_temps:lire");
  const principal = await sessionCourante();
  const params = await searchParams;
  const peutGerer = await peut(principal, "emploi_du_temps:gerer");

  const anneesResultat = await db.execute<AnneeLigne>(sql`
    SELECT id, libelle, date_debut::text, date_fin::text, est_courante
      FROM annees_scolaires
     ORDER BY date_debut DESC
  `);
  const annees = anneesResultat.rows;

  const annee =
    annees.find((ligne) => ligne.id === params.annee) ??
    annees.find((ligne) => ligne.est_courante) ??
    annees[0];

  if (!annee) {
    return (
      <div className="space-y-5">
        <h1 className="font-semibold text-2xl tracking-tight">Calendrier scolaire annuel</h1>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Aucune année scolaire configurée</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Créez une année avec ses dates de début et de fin avant de générer le calendrier.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dashboard/parametres">Configurer l’année scolaire</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const evenementsResultat = await db.execute<EvenementLigne>(sql`
    SELECT id, type::text AS type, titre, description,
           date_debut::text AS date_debut, date_fin::text AS date_fin,
           visible_parents, impact_cours, statut_validation,
           source_officielle, source_verifiee_le::text AS source_verifiee_le
      FROM evenements_calendrier
     WHERE annee_id = ${annee.id}::uuid
       AND statut_validation <> 'ANNULE'
       AND date_debut <= ${annee.date_fin}::date
       AND date_fin >= ${annee.date_debut}::date
     ORDER BY date_debut, date_fin, titre
  `);

  const jours = genererDatesCalendrier(annee.date_debut, annee.date_fin);
  const evenements = evenementsResultat.rows.map((ligne) => ({
    id: ligne.id,
    type: ligne.type,
    titre: ligne.titre,
    description: ligne.description,
    dateDebut: ligne.date_debut,
    dateFin: ligne.date_fin,
    visibleParents: ligne.visible_parents,
    impactCours: ligne.impact_cours,
    statutValidation: ligne.statut_validation,
    sourceOfficielle: ligne.source_officielle,
    sourceVerifieeLe: ligne.source_verifiee_le,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold tracking-wide">
            <CalendarDays aria-hidden className="size-4" />
            CALENDRIER SCOLAIRE
          </div>
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
            Calendrier annuel
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Toutes les dates de l’année scolaire, générées à partir de ses bornes, avec les
            événements enregistrés et leur état de validation.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/emploi-du-temps">
            <ArrowLeft aria-hidden />
            Emploi du temps
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Année scolaire</CardTitle>
          <CardDescription>
            Le calendrier est calculé de manière inclusive entre le {annee.date_debut} et le{" "}
            {annee.date_fin}. Changer d’année ne modifie aucune autre année.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" action="/dashboard/emploi-du-temps/calendrier" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-2 text-sm font-medium" htmlFor="annee-scolaire">
              Année à consulter
              <select
                id="annee-scolaire"
                name="annee"
                defaultValue={annee.id}
                className="h-10 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                {annees.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.libelle}{option.est_courante ? " — année courante" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Afficher</Button>
          </form>
        </CardContent>
      </Card>

      <VueCalendrierAnnuel
        anneeId={annee.id}
        peutGerer={peutGerer}
        anneeLibelle={annee.libelle}
        dateDebut={annee.date_debut}
        dateFin={annee.date_fin}
        jours={jours}
        evenements={evenements}
      />
    </div>
  );
}
