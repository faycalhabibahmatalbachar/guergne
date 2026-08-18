import type { Metadata } from "next";

import { FileText } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigerPage } from "@/server/guard";
import { chargerStatistiques } from "@/server/domain/tableau-de-bord";

import { type EtapeManquante, Prerequis } from "../_components/prerequis";

export const metadata: Metadata = { title: "Bulletins" };
export const dynamic = "force-dynamic";

/**
 * Bulletins.
 *
 * Un bulletin n'est jamais « généré à la volée » : il fige les moyennes, le
 * rang et les décisions du conseil de classe au moment de sa production. Il
 * suppose donc que les notes de la période soient saisies et la période close.
 */
export default async function PageBulletins() {
  await exigerPage("bulletin:lire");

  const stats = await chargerStatistiques();

  const manquants: EtapeManquante[] = [];
  if (!stats.annee) manquants.push({ libelle: "Créer l'année scolaire" });
  if (stats.nbCoefficients === 0)
    manquants.push({ libelle: "Saisir les coefficients" });
  if (stats.effectifTotal === 0)
    manquants.push({ libelle: "Inscrire des élèves", url: "/dashboard/eleves" });
  if (manquants.length === 0) manquants.push({ libelle: "Saisir les notes", url: "/dashboard/notes" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Bulletins</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {stats.annee
            ? `Année ${stats.annee.libelle}${stats.periode ? ` — ${stats.periode.libelle}` : ""}`
            : "Aucune année scolaire configurée"}
        </p>
      </div>

      <Prerequis
        titre="Aucun bulletin disponible"
        explication="Les bulletins sont produits en lot, classe par classe, à la clôture d'une période. Ils reprennent les moyennes par matière, la moyenne générale, le rang, l'assiduité, la conduite et la décision du conseil de classe."
        manquants={manquants}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" aria-hidden />
            Ce que contiendra le bulletin
          </CardTitle>
          <CardDescription>
            Conforme aux usages du système francophone, et non au modèle anglo-saxon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-muted-foreground text-sm">
            <li>• Moyenne par matière sur 20, pondérée par les coefficients du niveau et de la série</li>
            <li>• Moyenne de la classe, note la plus basse et la plus haute, pour situer l&apos;élève</li>
            <li>• Moyenne générale et rang, les ex æquo partageant le même rang</li>
            <li>• Heures d&apos;absence justifiées et non justifiées, retards, note de conduite</li>
            <li>• Appréciation par matière et appréciation générale du professeur principal</li>
            <li>• Mention du conseil de classe et, au 3ème trimestre, décision de passage</li>
            <li>• QR code de vérification, pour distinguer un bulletin authentique d&apos;une copie falsifiée</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
