import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listerClassesAnnee } from "@/server/domain/parametres";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../../_components/prerequis";
import { FormulaireInscription } from "./_components/formulaire-inscription";

export const metadata: Metadata = { title: "Inscrire un élève" };
export const dynamic = "force-dynamic";

export default async function PageInscription() {
  await exigerPage("eleve:inscrire");

  const annee = await chargerAnneeCourante();
  const classes = annee ? await listerClassesAnnee(annee.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/eleves">
            <ArrowLeft aria-hidden />
            Retour
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Inscrire un élève</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {annee
            ? `Année ${annee.libelle}. Le matricule et le numéro de dossier sont attribués automatiquement.`
            : "Aucune année scolaire configurée"}
        </p>
      </div>

      {!annee ? (
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="Une inscription rattache un élève à une classe d'une année scolaire donnée. Configurez d'abord l'année et ses classes."
          manquants={[{ libelle: "Configurer l'année scolaire", url: "/dashboard/parametres" }]}
        />
      ) : classes.length === 0 ? (
        <Prerequis
          titre="Aucune classe n'existe pour cette année"
          explication="Un élève est toujours affecté à une classe au moment de son inscription. Créez au moins une classe avant de commencer."
          manquants={[{ libelle: "Créer les classes", url: "/dashboard/parametres?onglet=classes" }]}
        />
      ) : (
        <FormulaireInscription
          classes={classes.map((c) => ({
            id: c.id,
            libelle: c.libelle,
            niveauLibelle: c.niveauLibelle,
            serieCode: c.serieCode,
            effectif: c.effectif,
            capaciteMax: c.capaciteMax,
          }))}
        />
      )}
    </div>
  );
}
