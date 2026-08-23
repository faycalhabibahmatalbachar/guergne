import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RangClasse } from "@/server/domain/pilotage";

const n2 = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));

/**
 * Classement des classes (E-26).
 *
 * L'ÉCART COMPTE PLUS QUE LE RANG
 * --------------------------------
 * Une classe première avec 11,2 dans un établissement à 11,0 n'a rien
 * d'exceptionnel ; une dernière à 8,1 quand la moyenne est à 11,0 appelle une
 * décision. Le rang seul masque cela — d'où la colonne d'écart, colorée, qui
 * est la vraie information de ce tableau.
 *
 * Les classes sans note gardent leur ligne. Les faire disparaître laisserait
 * croire qu'elles n'existent pas, alors qu'elles signalent une saisie en
 * retard — ce qui est précisément ce qu'un directeur veut voir avant un
 * conseil.
 */
export function ClassementClasses({ lignes }: { lignes: RangClasse[] }) {
  const notees = lignes.filter((l) => l.moyenne !== null);
  const sansNote = lignes.length - notees.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Classement des classes</CardTitle>
        <CardDescription>
          Toutes les classes sur une même échelle, du meilleur au moins bon. L&apos;écart à la
          moyenne de l&apos;établissement dit ce que le rang ne dit pas.
          {sansNote > 0
            ? ` ${sansNote} classe(s) sans note : la saisie n'est pas terminée.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {lignes.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Aucune classe pour cette année.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Rang</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead className="text-right">Effectif</TableHead>
                  <TableHead className="text-right">Notés</TableHead>
                  <TableHead className="text-right">Moyenne</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead className="text-right">Réussite</TableHead>
                  <TableHead className="text-right">Min — Max</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lignes.map((l) => (
                  <TableRow key={l.classe} className={l.moyenne === null ? "opacity-60" : undefined}>
                    <TableCell className="font-semibold tabular-nums">
                      {l.rang > 0 ? l.rang : "—"}
                    </TableCell>
                    <TableCell>
                      {l.classe}
                      <span className="text-muted-foreground ml-2 text-xs">{l.niveau}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.effectif}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/*
                        Un effectif de cinquante pour dix notés signale une
                        saisie incomplète : la moyenne affichée ne vaut alors
                        pas grand-chose, et il faut le voir.
                      */}
                      <span
                        className={
                          l.notes > 0 && l.notes < l.effectif
                            ? "text-amber-600 dark:text-amber-400"
                            : undefined
                        }
                      >
                        {l.notes}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {n2(l.moyenne)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.ecart === null ? (
                        "—"
                      ) : (
                        <Badge
                          variant={
                            l.ecart >= 0.5
                              ? "default"
                              : l.ecart <= -0.5
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {l.ecart > 0 ? "+" : ""}
                          {n2(l.ecart)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.tauxReussite === null ? "—" : `${l.tauxReussite} %`}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums text-sm">
                      {l.plusFaible === null ? "—" : `${n2(l.plusFaible)} — ${n2(l.meilleure)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
