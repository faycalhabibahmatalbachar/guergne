"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { EyeOff, FileText, Play, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { genererPourClasse, type ResultatGeneration } from "../actions";
import { depublierClasse, publierClasse } from "../actions-conseil";
import { AvisConseil } from "./avis-conseil";

export interface BulletinListe {
  inscriptionId: string;
  eleve: string;
  matricule: string;
  moyenne: string | null;
  rang: number | null;
  mention: string | null;
  appreciation: string | null;
  decision: string | null;
  publie: boolean;
}

/**
 * Production des bulletins d'une classe.
 *
 * Le geste est LOURD : il fige des moyennes et un classement, et c'est sur ce
 * classement que le conseil décide d'un passage. D'où le rapport détaillé
 * après coup — combien de bulletins, combien d'élèves sans note exploitable,
 * et lesquels.
 *
 * Une regénération est sans danger : elle recalcule les chiffres mais conserve
 * les appréciations du conseil et l'état de publication. C'est dit à l'écran,
 * sans quoi personne n'ose relancer après une correction de note.
 */
export function GenerationBulletins({
  classes,
  periodes,
  classeChoisie,
  periodeChoisie,
  bulletins,
}: {
  classes: Array<{ id: string; libelle: string; effectif: number }>;
  periodes: Array<{ id: string; libelle: string }>;
  classeChoisie: string;
  periodeChoisie: string;
  bulletins: BulletinListe[];
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [rapport, setRapport] = useState<ResultatGeneration["rapport"] | null>(null);

  function naviguer(classe: string, periode: string) {
    const p = new URLSearchParams();
    if (classe) p.set("classe", classe);
    if (periode) p.set("periode", periode);
    routeur.push(`/dashboard/bulletins?${p.toString()}`);
  }

  function generer() {
    setRapport(null);
    demarrer(async () => {
      const r = await genererPourClasse(classeChoisie, periodeChoisie);
      setRapport(r.rapport ?? null);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  const publies = bulletins.filter((b) => b.publie).length;
  const brouillons = bulletins.length - publies;

  const classe = classes.find((c) => c.id === classeChoisie);
  const periode = periodes.find((p) => p.id === periodeChoisie);
  const pret = Boolean(classeChoisie && periodeChoisie);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produire les bulletins</CardTitle>
          <CardDescription>
            Les moyennes par matière, la moyenne générale et le rang sont recalculés pour
            toute la classe. Les appréciations du conseil et la publication sont conservées :
            relancer après une correction de note est sans danger.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="classe">Classe</Label>
              <NativeSelect
                id="classe"
                value={classeChoisie}
                onChange={(e) => naviguer(e.target.value, periodeChoisie)}
              >
                <option value="">Choisir…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle} ({c.effectif})
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="periode">Période</Label>
              <NativeSelect
                id="periode"
                value={periodeChoisie}
                onChange={(e) => naviguer(classeChoisie, e.target.value)}
              >
                <option value="">Choisir…</option>
                {periodes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.libelle}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex items-end">
              <Button onClick={generer} disabled={!pret || enCours} className="w-full">
                <Play aria-hidden />
                {enCours ? "Calcul en cours…" : "Produire les bulletins"}
              </Button>
            </div>
          </div>

          {rapport ? (
            <div className="bg-muted/50 space-y-2 rounded-md border p-3 text-sm">
              <p>
                <strong>{rapport.bulletinsEcrits}</strong> bulletin(s) produit(s) pour{" "}
                {rapport.classe} — {rapport.periode}, soit{" "}
                <strong>{rapport.moyennesEcrites}</strong> moyennes de matière.
              </p>
              {rapport.ignores.length > 0 ? (
                <div>
                  <p className="text-amber-600 dark:text-amber-400">
                    {rapport.sansNote} élève(s) sans bulletin :
                  </p>
                  <ul className="text-muted-foreground mt-1 space-y-0.5">
                    {rapport.ignores.map((i) => (
                      <li key={i.nom}>
                        • {i.nom} — {i.raison}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {pret ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {classe?.libelle} — {periode?.libelle}
              <span className="text-muted-foreground ml-2 font-normal">
                {bulletins.length} bulletin{bulletins.length > 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bulletins.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <p className="text-muted-foreground text-sm">
                  {publies} publié{publies > 1 ? "s" : ""} · {brouillons} en brouillon.
                  {brouillons > 0
                    ? " Publier rend les bulletins visibles aux familles et les prévient."
                    : ""}
                </p>
                <div className="flex gap-2">
                  {brouillons > 0 ? (
                    <Button
                      size="sm"
                      disabled={enCours}
                      onClick={() =>
                        demarrer(async () => {
                          const r = await publierClasse(classeChoisie, periodeChoisie);
                          toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
                          routeur.refresh();
                        })
                      }
                    >
                      <Send aria-hidden />
                      Publier la classe
                    </Button>
                  ) : null}
                  {publies > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={enCours}
                      onClick={() => {
                        if (
                          !window.confirm(
                            [
                              "Retirer ces bulletins de la publication ?",
                              "Les familles ne les verront plus, mais les notifications",
                              "déjà envoyées ne sont pas rappelées.",
                            ].join(" "),
                          )
                        ) {
                          return;
                        }
                        demarrer(async () => {
                          const r = await depublierClasse(classeChoisie, periodeChoisie);
                          toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
                          routeur.refresh();
                        });
                      }}
                    >
                      <EyeOff aria-hidden />
                      Dépublier
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {bulletins.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                Aucun bulletin pour cette classe et cette période. Lancez la production.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rang</TableHead>
                      <TableHead>Élève</TableHead>
                      <TableHead>Matricule</TableHead>
                      <TableHead className="text-right">Moyenne</TableHead>
                      <TableHead>Mention</TableHead>
                      <TableHead>État</TableHead>
                      <TableHead className="text-right">Conseil</TableHead>
                      <TableHead className="text-right">Bulletin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulletins.map((b) => (
                      <TableRow key={b.inscriptionId}>
                        <TableCell className="tabular-nums font-medium">
                          {b.rang ?? "—"}
                        </TableCell>
                        <TableCell>{b.eleve}</TableCell>
                        <TableCell className="font-mono text-xs">{b.matricule}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {b.moyenne ? Number(b.moyenne).toFixed(2).replace(".", ",") : "—"}
                        </TableCell>
                        <TableCell>
                          {b.mention && b.mention !== "AUCUNE" ? (
                            <Badge variant="secondary">{b.mention.replace(/_/g, " ")}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.publie ? "default" : "outline"}>
                            {b.publie ? "Publié" : "Brouillon"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <AvisConseil
                            inscriptionId={b.inscriptionId}
                            periodeId={periodeChoisie}
                            eleve={b.eleve}
                            mention={b.mention}
                            appreciation={b.appreciation}
                            decision={b.decision}
                            publie={b.publie}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={`/api/bulletins/${b.inscriptionId}/${periodeChoisie}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileText aria-hidden />
                              Imprimer
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
