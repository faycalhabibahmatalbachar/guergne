import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  chargerFicheEnseignant,
  listerClassesEtMatieres,
  listerCreneaux,
} from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Fiche } from "./_components/fiche";

export const dynamic = "force-dynamic";

const LIBELLE_STATUT: Record<string, string> = {
  PERMANENT: "Permanent",
  CONTRACTUEL: "Contractuel",
  VACATAIRE: "Vacataire",
  STAGIAIRE: "Stagiaire",
  SUSPENDU: "Suspendu",
  RETRAITE: "Retraité",
  DEMISSIONNAIRE: "Démissionnaire",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const annee = await chargerAnneeCourante();
  const fiche = await chargerFicheEnseignant(id, annee?.id ?? null);
  return {
    title: fiche ? `${fiche.enseignant.prenom} ${fiche.enseignant.nom}` : "Enseignant",
  };
}

export default async function PageEnseignant({ params }: { params: Promise<{ id: string }> }) {
  await exigerPage("utilisateur:creer");

  const { id } = await params;
  const annee = await chargerAnneeCourante();
  const fiche = await chargerFicheEnseignant(id, annee?.id ?? null);
  if (!fiche) notFound();

  const [{ classes, matieres }, creneaux] = await Promise.all([
    annee ? listerClassesEtMatieres(annee.id) : Promise.resolve({ classes: [], matieres: [] }),
    listerCreneaux(),
  ]);

  const e = fiche.enseignant;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/personnel">
          <ArrowLeft aria-hidden />
          Tout le personnel
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
            {e.prenom.charAt(0)}
            {e.nom.charAt(0)}
          </div>
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">
              {e.prenom} {e.nom}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {e.matricule}
              </Badge>
              <Badge variant={e.statut === "PERMANENT" ? "default" : "secondary"}>
                {LIBELLE_STATUT[e.statut] ?? e.statut}
              </Badge>
              {!e.actif ? <Badge variant="outline">Compte désactivé</Badge> : null}
              {e.telephone ? (
                <span className="text-muted-foreground text-sm">{e.telephone}</span>
              ) : null}
              {e.diplome ? <span className="text-muted-foreground text-sm">· {e.diplome}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <Fiche
        fiche={fiche}
        anneeId={annee?.id ?? null}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        matieres={matieres.map((m) => ({ id: m.id, libelle: m.libelle }))}
        creneaux={creneaux.map((c) => ({ id: c.id, libelle: c.libelle }))}
      />
    </div>
  );
}
