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
import type { StatistiquesDiscipline } from "@/server/domain/conseil-discipline";

/**
 * Statistiques de discipline (E-55).
 *
 * LE COMPTE PAR CLASSE EST RAPPORTÉ À L'EFFECTIF
 * -----------------------------------------------
 * Une classe de 45 élèves produit mécaniquement plus d'incidents qu'une classe
 * de 20. Un classement brut désignerait toujours les grosses classes et ferait
 * conclure à un problème d'encadrement là où il n'y a qu'un problème de taille.
 * Le taux pour cent élèves est donc la colonne triée, et le nombre brut reste
 * affiché à côté pour qu'on ne surinterprète pas un taux calculé sur cinq
 * élèves.
 *
 * LA COURBE MENSUELLE EST LA PLUS UTILE
 * --------------------------------------
 * La discipline se dégrade par vagues — avant les compositions, après une
 * longue absence de professeur. Un total annuel ne le montre jamais.
 *
 * LE TABLEAU NOMINATIF EST ASSUMÉ
 * --------------------------------
 * C'est le seul, et c'est le but : la vie scolaire existe pour repérer les
 * quelques élèves qui décrochent avant qu'on ne les exclue. Un chiffre agrégé
 * ne permet d'agir sur personne.
 */

const LIBELLE_GRAVITE: Record<string, string> = {
  MINEURE: "Mineure",
  MOYENNE: "Moyenne",
  GRAVE: "Grave",
  TRES_GRAVE: "Très grave",
};

const LIBELLE_SANCTION: Record<string, string> = {
  AVERTISSEMENT: "Avertissement",
  BLAME: "Blâme",
  RETENUE: "Retenue",
  TRAVAIL_INTERET_GENERAL: "Travail d'intérêt général",
  EXCLUSION_TEMPORAIRE: "Exclusion temporaire",
  EXCLUSION_DEFINITIVE: "Exclusion définitive",
};

const moisFr = (v: string) => {
  const [a, m] = v.split("-");
  return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
};

export function VueStatistiques({
  stats,
  classes,
  periodes,
  classeId,
  periodeId,
}: {
  stats: StatistiquesDiscipline;
  classes: Array<{ id: string; libelle: string }>;
  periodes: Array<{ id: string; libelle: string }>;
  classeId: string;
  periodeId: string;
}) {
  const routeur = useRouter();
  const params = useSearchParams();

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/discipline/statistiques?${p.toString()}`);
  }

  const maxMois = Math.max(1, ...stats.parMois.map((m) => m.incidents + m.sanctions));

  // Le taux pour cent élèves : c'est lui qui rend deux classes comparables.
  // Les classes de moins de cinq élèves sont écartées du classement — un
  // incident sur trois élèves donnerait 33 %, un chiffre vrai et trompeur.
  const classement = [...stats.parClasse]
    .map((c) => ({
      ...c,
      taux: c.effectif > 0 ? ((c.incidents + c.sanctions) / c.effectif) * 100 : 0,
      comparable: c.effectif >= 5,
    }))
    .sort((a, b) => b.taux - a.taux);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="s-periode">Période</Label>
            <NativeSelect
              id="s-periode"
              className="w-44"
              value={periodeId}
              onChange={(e) => naviguer("periode", e.target.value)}
            >
              <option value="">Toute l&apos;année</option>
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="s-classe">Classe</Label>
            <NativeSelect
              id="s-classe"
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
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incidents signalés</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">{stats.totalIncidents}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sanctions prononcées</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl tabular-nums">{stats.totalSanctions}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {stats.totalIncidents > 0
                ? `${Math.round((stats.totalSanctions / stats.totalIncidents) * 100)} % des incidents`
                : "aucun incident"}
            </p>
          </CardContent>
        </Card>

        {stats.parGravite
          .filter((g) => g.gravite === "GRAVE" || g.gravite === "TRES_GRAVE")
          .slice(0, 2)
          .map((g) => (
            <Card key={g.gravite}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {LIBELLE_GRAVITE[g.gravite] ?? g.gravite}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive font-semibold text-2xl tabular-nums">{g.nombre}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      {stats.parMois.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Évolution mensuelle</CardTitle>
            <CardDescription>
              La discipline se dégrade par vagues — avant les compositions, après une longue
              absence de professeur. Un total annuel ne le montrerait pas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.parMois.map((m) => (
              <div key={m.mois} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-16 shrink-0 text-xs">
                  {moisFr(m.mois)}
                </span>
                <div className="bg-muted flex h-5 flex-1 overflow-hidden rounded-sm">
                  <div
                    className="bg-amber-500/70 h-full"
                    style={{ width: `${(m.incidents / maxMois) * 100}%` }}
                    title={`${m.incidents} incident(s)`}
                  />
                  <div
                    className="bg-destructive/70 h-full"
                    style={{ width: `${(m.sanctions / maxMois) * 100}%` }}
                    title={`${m.sanctions} sanction(s)`}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                  {m.incidents} / {m.sanctions}
                </span>
              </div>
            ))}
            <p className="text-muted-foreground pt-2 text-xs">
              <span className="bg-amber-500/70 mr-1 inline-block size-2 rounded-full" /> incidents
              <span className="bg-destructive/70 mx-1 ml-3 inline-block size-2 rounded-full" />{" "}
              sanctions
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Par gravité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.parGravite.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun incident sur la période.</p>
            ) : (
              stats.parGravite.map((g) => (
                <div key={g.gravite} className="flex justify-between text-sm">
                  <span>{LIBELLE_GRAVITE[g.gravite] ?? g.gravite}</span>
                  <span className="font-medium tabular-nums">{g.nombre}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Par type de sanction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.parType.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune sanction sur la période.</p>
            ) : (
              stats.parType.map((t) => (
                <div key={t.type} className="flex justify-between text-sm">
                  <span>{LIBELLE_SANCTION[t.type] ?? t.type}</span>
                  <span className="font-medium tabular-nums">{t.nombre}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Par classe</CardTitle>
          <CardDescription>
            Classé au taux pour cent élèves : une classe de 45 produit mécaniquement plus
            d&apos;incidents qu&apos;une classe de 20, et un classement brut désignerait toujours
            les grosses classes.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Classe</TableHead>
                  <TableHead className="text-right">Effectif</TableHead>
                  <TableHead className="text-right">Incidents</TableHead>
                  <TableHead className="text-right">Sanctions</TableHead>
                  <TableHead className="text-right">Pour 100 élèves</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classement.map((c) => (
                  <TableRow key={c.classe}>
                    <TableCell className="font-medium">{c.classe}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {c.effectif}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.incidents}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.sanctions}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {c.comparable ? Math.round(c.taux) : "—"}
                      {c.comparable ? null : (
                        <span className="text-muted-foreground block text-xs font-normal">
                          effectif trop faible
                        </span>
                      )}
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
          <CardTitle className="text-base">Élèves les plus signalés</CardTitle>
          <CardDescription>
            Le seul tableau nominatif, et il est assumé : la vie scolaire existe pour repérer les
            quelques élèves qui décrochent avant qu&apos;on ne les exclue. Un chiffre agrégé ne
            permet d&apos;agir sur personne.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recidivistes.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Aucun élève n&apos;a plus d&apos;un fait sur la période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Élève</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-right">Incidents</TableHead>
                    <TableHead className="text-right">Sanctions</TableHead>
                    <TableHead>Suite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recidivistes.map((r) => (
                    <TableRow key={r.inscriptionId}>
                      <TableCell>
                        <Link
                          href={`/dashboard/eleves/${r.eleveId}`}
                          className="font-medium hover:underline"
                        >
                          {r.eleve}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.classe}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.incidents}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.sanctions}</TableCell>
                      <TableCell>
                        {r.incidents >= 3 && r.sanctions === 0 ? (
                          <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                            signalé, jamais sanctionné
                          </Badge>
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
