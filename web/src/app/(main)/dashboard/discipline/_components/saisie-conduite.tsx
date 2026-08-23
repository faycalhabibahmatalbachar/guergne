"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { enregistrerConduite } from "../actions-conduite";

export interface LigneConduite {
  inscriptionId: string;
  matricule: string;
  eleve: string;
  note: number | null;
  appreciation: string | null;
  /** Ce que l'élève a accumulé sur la période — le contexte de la note. */
  incidents: number;
  sanctions: number;
  absencesNonJustifiees: number;
}

/**
 * Note de conduite d'une classe (E-53).
 *
 * LE CONTEXTE EST AFFICHÉ À CÔTÉ DE LA NOTE
 * ------------------------------------------
 * Incidents, sanctions et absences non justifiées de la période figurent sur
 * chaque ligne. Sans eux, la conduite se note de mémoire — et de mémoire, on
 * note l'élève dont on se souvient, pas celui dont le dossier le justifie.
 *
 * LA SAISIE SE FAIT CLASSE ENTIÈRE
 * ---------------------------------
 * La conduite s'attribue en comparant les élèves entre eux. Une saisie fiche
 * par fiche produirait des notes incohérentes d'un bout à l'autre de la liste.
 *
 * Une case vidée RETIRE la note : zéro de conduite est une sanction lourde,
 * ce n'est pas « pas encore noté ».
 */
export function SaisieConduite({
  periodeId,
  periodeLibelle,
  classe,
  lignes,
}: {
  periodeId: string;
  periodeLibelle: string;
  classe: string;
  lignes: LigneConduite[];
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();

  const [valeurs, setValeurs] = useState<Record<string, { note: string; appreciation: string }>>(
    Object.fromEntries(
      lignes.map((l) => [
        l.inscriptionId,
        { note: l.note === null ? "" : String(l.note), appreciation: l.appreciation ?? "" },
      ]),
    ),
  );

  const maj = (id: string, champ: "note" | "appreciation", v: string) =>
    setValeurs((p) => ({ ...p, [id]: { ...p[id], [champ]: v } }));

  function enregistrer() {
    demarrer(async () => {
      const r = await enregistrerConduite({
        periodeId,
        lignes: lignes.map((l) => {
          const v = valeurs[l.inscriptionId];
          return {
            inscriptionId: l.inscriptionId,
            note: v.note === "" ? null : Number(v.note),
            appreciation: v.appreciation,
          };
        }),
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  const saisies = Object.values(valeurs).filter((v) => v.note !== "").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Note de conduite — {classe}
              <span className="text-muted-foreground ml-2 font-normal">{periodeLibelle}</span>
            </CardTitle>
            <CardDescription>
              Sur 20, coefficient 2 au bulletin. Une conduite sous 8 fait basculer la mention en
              avertissement, quels que soient les résultats. {saisies} / {lignes.length} noté(s).
            </CardDescription>
          </div>
          <Button onClick={enregistrer} disabled={enCours}>
            <Save aria-hidden />
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead className="text-right">Sanctions</TableHead>
                <TableHead className="text-right">Abs. non just.</TableHead>
                <TableHead className="w-24">Note / 20</TableHead>
                <TableHead>Appréciation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((l) => {
                const v = valeurs[l.inscriptionId];
                const note = v.note === "" ? null : Number(v.note);
                return (
                  <TableRow key={l.inscriptionId}>
                    <TableCell>
                      {l.eleve}
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {l.matricule}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        l.incidents > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                      }`}
                    >
                      {l.incidents || "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        l.sanctions > 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {l.sanctions || "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        l.absencesNonJustifiees > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                      }`}
                    >
                      {l.absencesNonJustifiees || "—"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        step="0.5"
                        inputMode="decimal"
                        value={v.note}
                        onChange={(e) => maj(l.inscriptionId, "note", e.target.value)}
                        className={
                          note !== null && note < 8
                            ? "border-destructive text-destructive"
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={v.appreciation}
                        maxLength={200}
                        placeholder="Assez bon élève, élève sérieux…"
                        onChange={(e) => maj(l.inscriptionId, "appreciation", e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
