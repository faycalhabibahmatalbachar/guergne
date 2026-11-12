import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { EnTetePage, Page } from "@/components/socle/en-tete-page";
import { SelecteurAnnee } from "@/components/socle/selecteur-annee";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sessionCourante } from "@/server/auth/session";
import { db } from "@/server/db";
import { genererDatesCalendrier } from "@/server/domain/calendrier-scolaire";
import { chargerPlagesHorairesScolaires } from "@/server/domain/horaires-scolaires";
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

export default async function PageCalendrierAnnuel({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
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
    annees.find((ligne) => ligne.id === params.annee) ?? annees.find((ligne) => ligne.est_courante) ?? annees[0];

  if (!annee) {
    return (
      <div className="space-y-5">
        <EnTetePage titre="Calendrier scolaire annuel" />
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

  const plagesHoraires = await chargerPlagesHorairesScolaires(annee.id);
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
    <Page>
      <EnTetePage
        titre="Calendrier annuel"
        description={
          <>
            Toutes les dates de l’année scolaire, générées à partir de ses bornes, avec les événements enregistrés et
            leur état de validation.
          </>
        }
        actions={
          <>
            <SelecteurAnnee
              anneeId={annee.id}
              annees={annees.map((option) => ({
                id: option.id,
                libelle: option.libelle,
                estCourante: option.est_courante,
              }))}
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/emploi-du-temps?annee=${encodeURIComponent(annee.id)}`}>
                <ArrowLeft aria-hidden />
                Emploi du temps
              </Link>
            </Button>
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        Calendrier de l’année {annee.libelle}, du {annee.date_debut} au {annee.date_fin}. Changer d’année ne modifie
        aucune autre année.
      </p>

      <VueCalendrierAnnuel
        anneeId={annee.id}
        peutGerer={peutGerer}
        anneeLibelle={annee.libelle}
        dateDebut={annee.date_debut}
        dateFin={annee.date_fin}
        jours={jours}
        evenements={evenements}
        plagesHoraires={plagesHoraires}
      />
    </Page>
  );
}
