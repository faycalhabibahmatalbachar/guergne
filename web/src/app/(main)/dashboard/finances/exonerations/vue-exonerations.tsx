"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formaterFcfa } from "@/lib/finances-format";
import type { LigneExoneration } from "@/server/domain/caisse";

/**
 * Historique des exonérations (E-59).
 *
 * LE MONTANT AFFICHÉ EST CELUI QUI MANQUE EN CAISSE
 * --------------------------------------------------
 * Une exonération peut être exprimée en pourcentage. « 50 % » ne dit rien tant
 * qu'on ne l'a pas appliqué au dû de l'élève : c'est le montant converti, et
 * lui seul, qu'on retrouvera en moins à la fin de l'année. Afficher le
 * pourcentage brut donnerait un total impossible à additionner.
 *
 * LA JUSTIFICATION EST DANS LE TABLEAU, PAS DERRIÈRE UN CLIC
 * -----------------------------------------------------------
 * C'est elle qu'on relit quand un parent demande pourquoi son voisin paie
 * moins. La cacher dans une infobulle reviendrait à ne pas l'avoir écrite.
 */

const MOTIFS: Array<[string, string]> = [
  ["", "Tous les motifs"],
  ["BOURSE", "Bourse"],
  ["FRATRIE", "Fratrie"],
  ["CAS_SOCIAL", "Cas social"],
  ["ENFANT_PERSONNEL", "Enfant du personnel"],
  ["MERITE", "Mérite"],
  ["AUTRE", "Autre"],
];

const LIBELLE_MOTIF = Object.fromEntries(MOTIFS.filter(([v]) => v));

export function VueExonerations({
  historique,
  classes,
  classeId,
  motif,
}: {
  historique: {
    lignes: LigneExoneration[];
    total: number;
    parMotif: Array<{ motif: string; nombre: number; total: number }>;
  };
  classes: Array<{ id: string; libelle: string }>;
  classeId: string;
  motif: string;
}) {
  const routeur = useRouter();
  const params = useSearchParams();

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/finances/exonerations?${p.toString()}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="x-classe">Classe</Label>
            <NativeSelect
              id="x-classe"
              className="w-44"
              value={classeId}
              onChange={(e) => naviguer("classe", e.target.value)}
            >
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="x-motif">Motif</Label>
            <NativeSelect
              id="x-motif"
              className="w-52"
              value={motif}
              onChange={(e) => naviguer("motif", e.target.value)}
            >
              {MOTIFS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total renoncé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">
              {formaterFcfa(historique.total)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {historique.lignes.length} exonération(s), pourcentages convertis en francs.
            </p>
          </CardContent>
        </Card>

        {historique.parMotif.slice(0, 3).map((m) => (
          <Card key={m.motif}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {LIBELLE_MOTIF[m.motif] ?? m.motif}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-2xl tabular-nums">{formaterFcfa(m.total)}</p>
              <p className="text-muted-foreground mt-1 text-xs">{m.nombre} élève(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Détail</CardTitle>
          <CardDescription>
            De la plus récente à la plus ancienne. La justification est écrite en toutes lettres :
            c&apos;est elle qu&apos;on relit quand un parent demande pourquoi son voisin paie
            moins.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {historique.lignes.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              Aucune exonération avec ces critères.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Élève</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead>Accordée par</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historique.lignes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="tabular-nums">
                        {new Date(`${l.dateAccord}T00:00:00`).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/eleves/${l.eleveId}`}
                          className="font-medium hover:underline"
                        >
                          {l.eleve}
                        </Link>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">
                          {l.matricule}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.classe}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{LIBELLE_MOTIF[l.motif] ?? l.motif}</Badge>
                      </TableCell>
                      <TableCell className="max-w-72 text-muted-foreground text-sm">
                        {l.justification}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {l.accordePar ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formaterFcfa(l.montantEffectif)}
                        {l.pourcentage !== null ? (
                          <span className="text-muted-foreground block text-xs font-normal">
                            {l.pourcentage} %{l.nature ? ` · ${l.nature.toLowerCase()}` : ""}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
