"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { MessageSquare, Smartphone, SmartphoneNfc, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { definirPolitique, definirSeuilIncident, POLITIQUES } from "../actions";

export interface LignePolitique {
  type: string;
  libelle: string;
  politique: string;
  volumeAttendu: string | null;
  description: string | null;
  dejaProduites: number;
  coutTotalFcfa: number;
}

const GRAVITES = [
  { valeur: "MINEURE", libelle: "Mineure — tout est signalé" },
  { valeur: "MOYENNE", libelle: "Moyenne — recommandé" },
  { valeur: "GRAVE", libelle: "Grave" },
  { valeur: "TRES_GRAVE", libelle: "Très grave uniquement" },
];

/** Le pictogramme dit d'un coup d'œil ce que coûte la politique retenue. */
function Canal({ politique }: { politique: string }) {
  if (politique === "AUCUN") {
    return (
      <Badge variant="outline" className="gap-1.5">
        <XCircle aria-hidden className="size-3.5" />
        Désactivé
      </Badge>
    );
  }
  if (politique === "PUSH_SEUL") {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Smartphone aria-hidden className="size-3.5" />
        Gratuit
      </Badge>
    );
  }
  if (politique === "PUSH_ET_SMS") {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <SmartphoneNfc aria-hidden className="size-3.5" />
        Facturé à chaque envoi
      </Badge>
    );
  }
  if (politique === "SMS_SEUL") {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <MessageSquare aria-hidden className="size-3.5" />
        Facturé
      </Badge>
    );
  }
  return (
    <Badge className="gap-1.5">
      <Smartphone aria-hidden className="size-3.5" />
      Facturé au repli
    </Badge>
  );
}

/**
 * Réglage des canaux, type par type.
 *
 * La colonne « coût » n'est pas décorative : sans elle, personne ne peut
 * arbitrer entre prévenir les familles et dépenser. Un établissement qui
 * bascule les devoirs en « Application ET SMS » doit voir, à l'écran, que cela
 * représente soixante messages par famille et par semaine.
 */
export function TablePolitiques({
  lignes,
  seuilIncident,
}: {
  lignes: LignePolitique[];
  seuilIncident: string;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();

  function changer(type: string, politique: string) {
    demarrer(async () => {
      const r = await definirPolitique({ type, politique });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      routeur.refresh();
    });
  }

  const factures = lignes.filter((l) =>
    ["PUSH_ET_SMS", "SMS_SEUL", "PUSH_SINON_SMS"].includes(l.politique),
  ).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Canal par type d&apos;événement</CardTitle>
          <CardDescription>
            Le SMS est le seul poste de dépense variable de l&apos;établissement. Les
            notifications de l&apos;application sont gratuites, mais n&apos;atteignent que les
            parents qui l&apos;ont installée. {factures} type(s) sur {lignes.length} peuvent
            engendrer un SMS.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Événement</TableHead>
                  <TableHead className="w-64">Canal</TableHead>
                  <TableHead>Effet</TableHead>
                  <TableHead className="text-right">Envoyées</TableHead>
                  <TableHead className="text-right">Coût cumulé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lignes.map((l) => (
                  <TableRow key={l.type}>
                    <TableCell>
                      <p className="font-medium">{l.libelle}</p>
                      {l.description ? (
                        <p className="text-muted-foreground max-w-md text-xs">{l.description}</p>
                      ) : null}
                      {l.volumeAttendu ? (
                        <p className="text-muted-foreground mt-0.5 text-xs italic">
                          {l.volumeAttendu}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <NativeSelect
                        aria-label={`Canal pour ${l.libelle}`}
                        value={l.politique}
                        disabled={enCours}
                        onChange={(e) => changer(l.type, e.target.value)}
                      >
                        {POLITIQUES.map((p) => (
                          <option key={p.valeur} value={p.valeur}>
                            {p.libelle}
                          </option>
                        ))}
                      </NativeSelect>
                      <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                        {POLITIQUES.find((p) => p.valeur === l.politique)?.explication}
                      </p>
                    </TableCell>

                    <TableCell>
                      <Canal politique={l.politique} />
                    </TableCell>

                    <TableCell className="text-right tabular-nums">{l.dejaProduites}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.coutTotalFcfa > 0 ? `${l.coutTotalFcfa.toLocaleString("fr-FR")} F` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seuil de signalement des incidents</CardTitle>
          <CardDescription>
            Ce réglage ne choisit pas un canal mais ce qui mérite d&apos;être signalé. Un
            bavardage en classe ne justifie pas de faire sonner le téléphone d&apos;un parent au
            travail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="seuil">Gravité minimale notifiée</Label>
            <NativeSelect
              id="seuil"
              defaultValue={seuilIncident}
              disabled={enCours}
              onChange={(e) =>
                demarrer(async () => {
                  const r = await definirSeuilIncident(e.target.value);
                  toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
                  routeur.refresh();
                })
              }
            >
              {GRAVITES.map((g) => (
                <option key={g.valeur} value={g.valeur}>
                  {g.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
