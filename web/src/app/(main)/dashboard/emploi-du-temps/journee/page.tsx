import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sessionCourante } from "@/server/auth/session";
import { db } from "@/server/db";
import { coursDuJour, enseignantsDisponibles } from "@/server/domain/remplacements";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage, peut } from "@/server/guard";

import { VueJournee } from "./vue-journee";

export const metadata: Metadata = { title: "Journée de cours" };
export const dynamic = "force-dynamic";

/**
 * La journée de cours (E-48) et les remplacements (E-49).
 *
 * LA DATE EST DANS L'URL, ET PAR DÉFAUT C'EST AUJOURD'HUI
 * --------------------------------------------------------
 * On ouvre cet écran pour la journée en cours neuf fois sur dix. Obliger à
 * choisir une date avant d'afficher quoi que ce soit ajouterait un geste à
 * l'usage le plus fréquent.
 *
 * La liste des professeurs disponibles est chargée CÔTÉ SERVEUR pour le cours
 * ouvert, et non pour les quarante cours de la journée : c'est une requête
 * lourde — trois anti-jointures — dont on n'a besoin qu'une fois, au moment de
 * choisir.
 */
export default async function PageJournee({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; classe?: string; enseignant?: string; cours?: string }>;
}) {
  await exigerPage("emploi_du_temps:lire");
  const principal = await sessionCourante();

  const params = await searchParams;
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Journée de cours</h1>
        <p className="text-muted-foreground text-sm">Aucune année scolaire n&apos;est configurée.</p>
      </div>
    );
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : new Date().toISOString().slice(0, 10);

  const [cours, classes, enseignants, peutGerer] = await Promise.all([
    coursDuJour(annee.id, date, {
      classeId: params.classe || undefined,
      enseignantId: params.enseignant || undefined,
    }),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT c.id, c.libelle
        FROM classes c
       WHERE c.annee_id = ${annee.id}::uuid
       ORDER BY c.libelle
    `),
    db.execute<{ id: string; libelle: string }>(sql`
      SELECT en.id, en.prenom || ' ' || en.nom AS libelle
        FROM enseignants en
       WHERE en.actif
       ORDER BY en.nom, en.prenom
    `),
    peut(principal, "emploi_du_temps:gerer"),
  ]);

  // Uniquement pour le cours effectivement ouvert : la requête de disponibilité
  // coûte trois anti-jointures, et la lancer pour toute la journée ferait
  // quarante fois le travail pour un seul résultat utilisé.
  const coursOuvert =
    params.cours && cours.some((c) => c.emploiDuTempsId === params.cours) ? params.cours : null;

  const disponibles = coursOuvert
    ? await enseignantsDisponibles(annee.id, date, coursOuvert)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Journée de cours</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Qui est où aujourd&apos;hui, et qui prend le cours d&apos;un professeur absent.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/emploi-du-temps">
            <ArrowLeft aria-hidden />
            Grille hebdomadaire
          </Link>
        </Button>
      </div>

      <VueJournee
        date={date}
        cours={cours}
        classes={classes.rows}
        enseignants={enseignants.rows}
        classeId={params.classe ?? ""}
        enseignantId={params.enseignant ?? ""}
        peutGerer={peutGerer}
        disponibles={disponibles}
        coursOuvert={coursOuvert}
      />
    </div>
  );
}
