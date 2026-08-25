"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Banknote, FileSpreadsheet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formaterFcfa } from "@/lib/finances-format";
import type { JournalCaisse } from "@/server/domain/caisse";

/**
 * Journal de caisse du jour (E-57).
 *
 * IL RÉPOND À UNE SEULE QUESTION : COMBIEN DOIS-JE AVOIR DANS LE TIROIR
 * ----------------------------------------------------------------------
 * L'export comptable (E-18) sert à rapprocher un trimestre entier, une fois.
 * Celui-ci sert le soir même, à la fermeture. C'est pourquoi les ESPÈCES sont
 * isolées et mises en tête : le mobile money et les virements n'entrent jamais
 * dans la caisse physique, et les additionner donnerait un total qu'aucun
 * comptage de billets ne retrouvera.
 *
 * LES ANNULATIONS RESTENT VISIBLES
 * ---------------------------------
 * Elles portent un montant négatif et figurent dans la liste. Une caisse dont
 * on efface les erreurs n'est plus vérifiable — et c'est exactement ce qu'un
 * contrôle cherche à lire.
 */

const LIBELLES: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
};

export function VueCaisse({ journal }: { journal: JournalCaisse }) {
  const routeur = useRouter();
  const params = useSearchParams();

  function changerDate(v: string) {
    const p = new URLSearchParams(params.toString());
    if (v) p.set("date", v);
    else p.delete("date");
    routeur.push(`/dashboard/finances/caisse?${p.toString()}`);
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const autres = journal.totalNet - journal.especesNet;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="c-date">Journée</Label>
            <Input
              id="c-date"
              type="date"
              className="w-44"
              max={aujourdhui}
              value={journal.date}
              onChange={(e) => changerDate(e.target.value)}
            />
          </div>

          {/*
            L'export comptable couvre la période entière et n'obéit pas à cette
            date : les deux documents ne servent pas le même contrôle, et
            laisser croire qu'ils se recoupent ligne à ligne serait trompeur.
          */}
          <Button asChild variant="outline" size="sm">
            <a href="/api/export/comptable">
              <FileSpreadsheet aria-hidden />
              Export comptable de la période
            </a>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Banknote aria-hidden className="size-4" />
              En caisse ce soir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">
              {formaterFcfa(journal.especesNet)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Espèces uniquement, annulations déduites. C&apos;est ce qui doit se compter dans le
              tiroir.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Encaissé hors caisse</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">{formaterFcfa(autres)}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Mobile Money, virements, chèques — à rapprocher des relevés, pas du tiroir.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de la journée</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">{formaterFcfa(journal.totalNet)}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {journal.lignes.length} écriture(s)
              {journal.nbAnnulations > 0 ? `, dont ${journal.nbAnnulations} annulation(s)` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {journal.parMode.length > 1 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Répartition par mode</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {journal.parMode.map((m) => (
              <div key={m.mode} className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{LIBELLES[m.mode] ?? m.mode}</p>
                <p className="font-medium tabular-nums">{formaterFcfa(m.total)}</p>
                <p className="text-muted-foreground text-xs">{m.nombre} écriture(s)</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Écritures du jour</CardTitle>
          <CardDescription>
            Dans l&apos;ordre d&apos;encaissement. Les annulations apparaissent en négatif et ne
            sont jamais retirées — une caisse dont on efface les erreurs n&apos;est plus
            vérifiable.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {journal.lignes.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              Aucun encaissement ce jour-là.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Heure</TableHead>
                    <TableHead>Reçu</TableHead>
                    <TableHead>Élève</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Payeur</TableHead>
                    <TableHead>Encaissé par</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journal.lignes.map((l) => (
                    <TableRow key={l.id} className={l.estAnnulation ? "bg-destructive/5" : ""}>
                      <TableCell className="tabular-nums">{l.heure}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {l.numeroRecu}
                        {l.annule && !l.estAnnulation ? (
                          <Badge variant="outline" className="text-destructive ml-1.5">
                            annulé
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {l.eleve}
                        <span className="text-muted-foreground ml-2 font-mono text-xs">
                          {l.matricule}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.classe}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {LIBELLES[l.mode] ?? l.mode}
                        {l.reference ? (
                          <span className="ml-1.5 font-mono text-xs">{l.reference}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.payeur ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {l.encaissePar ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium tabular-nums ${
                          l.montant < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formaterFcfa(l.montant)}
                        {l.motifAnnulation ? (
                          <span className="text-muted-foreground block text-xs font-normal">
                            {l.motifAnnulation}
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
