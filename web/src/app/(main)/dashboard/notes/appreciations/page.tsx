import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { avancementAppreciations, chargerAppreciationsClasse } from "@/server/domain/appreciations";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { SaisieAppreciations } from "./saisie";

export const metadata: Metadata = { title: "Appréciations" };
export const dynamic = "force-dynamic";

/**
 * Appréciations du professeur, matière par matière (E-41).
 *
 * Écran séparé de la saisie des notes, et non un onglet de plus : ce n'est pas
 * le même moment du trimestre. Les notes se saisissent au fil des évaluations,
 * les appréciations se rédigent d'un bloc à l'approche du conseil. Une page
 * distincte se transmet aussi par simple lien — « voici l'écran, remplis ta
 * matière avant vendredi ».
 */
export default async function PageAppreciations({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; matiere?: string; periode?: string }>;
}) {
  await exigerPage("note:lire");

  const params = await searchParams;
  const stats = await chargerStatistiques();

  if (!stats.annee || !stats.periode) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Appréciations</h1>
        <p className="text-muted-foreground text-sm">
          Aucune période d&apos;évaluation n&apos;est ouverte.
        </p>
      </div>
    );
  }

  const [{ classes, matieres }, periodes] = await Promise.all([
    listerClassesEtMatieres(stats.annee.id),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT p.id, p.libelle
        FROM periodes p
        JOIN annees_scolaires a ON a.id = p.annee_id AND a.est_courante
       ORDER BY p.numero
    `),
  ]);

  const classeId = params.classe ?? "";
  const matiereId = params.matiere ?? "";
  const periodeId = params.periode ?? stats.periode.id;

  // Deux lectures, deux publics : le professeur remplit SA matière ; le censeur
  // veut savoir qui n'a pas rendu. L'avancement est donc chargé dès qu'une
  // classe est choisie, avant même qu'une matière le soit.
  const [lignes, avancement] = await Promise.all([
    classeId && matiereId && periodeId
      ? chargerAppreciationsClasse(classeId, matiereId, periodeId)
      : Promise.resolve([]),
    classeId && periodeId ? avancementAppreciations(classeId, periodeId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Appréciations par matière</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Année {stats.annee.libelle}. Elles remplacent au bulletin la mention automatique
            déduite de la moyenne.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/notes">
            <ArrowLeft aria-hidden />
            Saisie des notes
          </Link>
        </Button>
      </div>

      {/*
        `key` remonte le composant quand la cible change. Sans elle, l'état
        local de saisie — initialisé UNE fois — survivrait au passage d'une
        matière à l'autre, et l'enregistrement écrirait les appréciations de
        la matière précédente sur la nouvelle.
      */}
      <SaisieAppreciations
        key={`${classeId}-${matiereId}-${periodeId}`}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
        periodes={periodes.rows}
        classeId={classeId}
        matiereId={matiereId}
        periodeId={periodeId}
        lignes={lignes}
        avancement={avancement}
      />
    </div>
  );
}
