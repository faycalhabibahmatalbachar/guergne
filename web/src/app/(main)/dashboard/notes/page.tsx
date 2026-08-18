import type { Metadata } from "next";

import { exigerPage } from "@/server/guard";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";

import { type EtapeManquante, Prerequis } from "../_components/prerequis";

export const metadata: Metadata = { title: "Saisie des notes" };
export const dynamic = "force-dynamic";

/**
 * Saisie des notes.
 *
 * La saisie suppose une chaîne complète de prérequis : une année scolaire,
 * ses périodes, des classes, des coefficients, des enseignants affectés, puis
 * des évaluations. Tant qu'un maillon manque, on l'annonce explicitement
 * plutôt que d'afficher une grille vide dont personne ne comprendrait la cause.
 */
export default async function PageNotes() {
  await exigerPage("note:lire");

  const stats = await chargerStatistiques();

  const manquants: EtapeManquante[] = [];
  if (!stats.annee) manquants.push({ libelle: "Créer l'année scolaire" });
  if (stats.nbCoefficients === 0)
    manquants.push({ libelle: "Saisir les coefficients" });
  if (stats.nbClasses === 0) manquants.push({ libelle: "Créer les classes", url: "/dashboard/classes" });
  if (stats.effectifTotal === 0)
    manquants.push({ libelle: "Inscrire des élèves", url: "/dashboard/eleves" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Saisie des notes</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {stats.annee
            ? `Année ${stats.annee.libelle}${stats.periode ? ` — ${stats.periode.libelle}` : ""}`
            : "Aucune année scolaire configurée"}
        </p>
      </div>

      {manquants.length > 0 ? (
        <Prerequis
          titre="La saisie des notes n'est pas encore possible"
          explication="Une note se rattache à un élève, une matière, une classe et une période. Ces éléments doivent exister au préalable — voici ce qui manque."
          manquants={manquants}
        />
      ) : (
        <Prerequis
          titre="Aucune évaluation créée pour cette période"
          explication="La configuration est complète. Chaque enseignant peut désormais créer ses évaluations (interrogations, devoirs, compositions), puis saisir les notes de sa classe."
          manquants={[{ libelle: "Créer une évaluation", url: "/dashboard/notes" }]}
        />
      )}
    </div>
  );
}
