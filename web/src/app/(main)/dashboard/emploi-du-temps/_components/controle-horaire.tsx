import Link from "next/link";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Anomalie, Couverture } from "@/server/domain/emploi-du-temps";

/**
 * Contrôle de couverture horaire (E-50).
 *
 * CE QUI NE SE VOIT PAS EN REGARDANT LA GRILLE
 * ---------------------------------------------
 * Une grille pleine a l'air correcte. Elle ne dit pas qu'il manque deux heures
 * de mathématiques à la 4e B, parce qu'une case vide ressemble à une
 * récréation. Le défaut se découvre au conseil de classe, quand la moyenne de
 * la matière est basse dans une seule classe du niveau — et on l'attribue alors
 * aux élèves.
 *
 * SEULES LES ANOMALIES SONT LISTÉES
 * ----------------------------------
 * Cent trente-cinq affectations dont cent vingt sont conformes : les lister
 * toutes noierait les quinze qui comptent. Quand il n'y en a aucune, on le dit
 * en une ligne.
 */

const ETIQUETTES: Record<Anomalie, { libelle: string; ton: string; explication: string }> = {
  ABSENTE: {
    libelle: "absente de la grille",
    ton: "border-destructive/50 text-destructive",
    explication: "La matière est affectée mais n'apparaît sur aucun créneau. Les élèves ne l'ont pas.",
  },
  DEFICIT: {
    libelle: "heures manquantes",
    ton: "border-amber-500/50 text-amber-700 dark:text-amber-400",
    explication: "Moins d'heures placées que prévu par l'affectation.",
  },
  EXCEDENT: {
    libelle: "heures en trop",
    ton: "border-amber-500/50 text-amber-700 dark:text-amber-400",
    explication: "Plus d'heures placées que prévu — au détriment d'une autre matière.",
  },
  HORS_PROGRAMME: {
    libelle: "sans affectation",
    ton: "border-destructive/50 text-destructive",
    explication:
      "Des cours sont placés pour une matière qu'aucune affectation ne prévoit dans cette classe.",
  },
  SANS_ENSEIGNANT: {
    libelle: "sans professeur",
    ton: "border-amber-500/50 text-amber-700 dark:text-amber-400",
    explication: "Au moins un créneau n'a personne devant la classe.",
  },
};

export function ControleHoraire({ couverture }: { couverture: Couverture }) {
  const anomalies = couverture.lignes.filter((l) => l.anomalies.length > 0);
  const conformes = couverture.lignes.length - anomalies.length;

  if (anomalies.length === 0 && couverture.classesVides.length === 0) {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm">
            Les {conformes} affectations de l&apos;année sont intégralement placées, avec le nombre
            d&apos;heures prévu.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Les types d'anomalie réellement présents : inutile d'expliquer « sans
  // professeur » si le cas ne se produit pas.
  const presents = [...new Set(anomalies.flatMap((l) => l.anomalies))];

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle aria-hidden className="size-5 text-amber-600 dark:text-amber-400" />
          {anomalies.length} anomalie(s) de couverture
        </CardTitle>
        <CardDescription>
          Sur {couverture.lignes.length} couples classe / matière. « Heure » signifie ici heure de
          cours — un créneau —, l&apos;unité dans laquelle les affectations sont exprimées.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-0">
        {couverture.classesVides.length > 0 ? (
          <p className="border-destructive/40 bg-destructive/5 mx-4 mt-4 rounded-md border px-3 py-2 text-sm">
            <span className="font-medium">
              {couverture.classesVides.length} classe(s) sans aucun cours :
            </span>{" "}
            {couverture.classesVides.map((c) => c.libelle).join(", ")}. Aucun emploi du temps
            n&apos;a été construit pour elles.
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Classe</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Professeur</TableHead>
                <TableHead className="text-right">Prévu</TableHead>
                <TableHead className="text-right">Placé</TableHead>
                <TableHead>Anomalie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalies.map((l) => (
                <TableRow key={`${l.classeId}-${l.matiereId}`}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/emploi-du-temps?vue=classe&cible=${l.classeId}`}
                      className="hover:underline"
                    >
                      {l.classe}
                    </Link>
                  </TableCell>
                  <TableCell>{l.matiere}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.enseignant ?? <span className="text-destructive">non affecté</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.attendus ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.places}</TableCell>
                  <TableCell className="space-x-1">
                    {l.anomalies.map((a) => (
                      <Badge key={a} variant="outline" className={ETIQUETTES[a].ton}>
                        {ETIQUETTES[a].libelle}
                      </Badge>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="text-muted-foreground space-y-1 border-t px-4 py-3 text-xs">
          {presents.map((a) => (
            <p key={a}>
              <span className="font-medium">{ETIQUETTES[a].libelle}</span> —{" "}
              {ETIQUETTES[a].explication}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
