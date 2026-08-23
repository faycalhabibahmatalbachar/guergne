import Link from "next/link";

import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SaisieManquante } from "@/server/domain/generation-bulletins";

/**
 * Ce qui manque avant le conseil de classe (E-45).
 *
 * Placé AVANT le bouton de production, et non dans un onglet à part : c'est la
 * vérification qu'on saute quand elle demande un clic de plus.
 *
 * Une moyenne incomplète ne se voit pas — elle a l'air d'une moyenne normale.
 * Un élève dont il manque la note de mathématiques a une moyenne calculée sur
 * les autres matières, et son rang est faux, comme celui de tous les autres
 * puisque le classement les compare.
 */
export function SaisiesManquantes({ lignes }: { lignes: SaisieManquante[] }) {
  if (lignes.length === 0) {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 aria-hidden className="size-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm">
            Toutes les évaluations de cette classe sont saisies. Les bulletins peuvent être
            produits.
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = lignes.reduce((t, l) => t + l.manquantes, 0);
  const matieres = new Set(lignes.map((l) => l.matiere)).size;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle aria-hidden className="size-5 text-amber-600 dark:text-amber-400" />
          {total} note(s) manquante(s) sur {matieres} matière(s)
        </CardTitle>
        <CardDescription>
          Produire les bulletins maintenant calculerait des moyennes incomplètes — et un rang
          faux pour TOUS les élèves, puisque le classement les compare entre eux.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Matière</TableHead>
              <TableHead>Évaluation</TableHead>
              <TableHead>Enseignant</TableHead>
              <TableHead className="text-right">Saisies</TableHead>
              <TableHead className="text-right">Manquantes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((l, i) => (
              <TableRow key={`${l.matiere}-${l.evaluation}-${i}`}>
                <TableCell className="font-medium">{l.matiere}</TableCell>
                <TableCell>
                  {l.evaluation}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {l.type.toLowerCase()}
                    {l.dateEvaluation
                      ? ` · ${new Date(l.dateEvaluation).toLocaleDateString("fr-FR")}`
                      : ""}
                  </span>
                  {l.verrouillee ? (
                    <Badge variant="outline" className="ml-2 gap-1">
                      <Lock aria-hidden className="size-3" />
                      verrouillée
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {/*
                    Sans enseignant affecté, personne n'est responsable de la
                    saisie — et c'est souvent la vraie cause du retard.
                  */}
                  {l.enseignant ?? (
                    <span className="text-destructive">aucun enseignant affecté</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.saisies} / {l.attendues}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {l.manquantes}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <p className="text-muted-foreground border-t px-4 py-3 text-sm">
          La saisie se fait depuis{" "}
          <Link href="/dashboard/notes" className="text-primary hover:underline">
            le module Notes
          </Link>
          . Une évaluation verrouillée doit d&apos;abord être déverrouillée.
        </p>
      </CardContent>
    </Card>
  );
}
