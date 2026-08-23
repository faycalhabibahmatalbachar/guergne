import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DossierScolarite } from "@/server/domain/dossier-eleve";

const n2 = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));
const fcfa = (v: number) => `${v.toLocaleString("fr-FR")} F`;
const dateFr = (v: string) => new Date(v).toLocaleDateString("fr-FR");

/** Rien à afficher : on dit POURQUOI, pas seulement « aucune donnée ». */
function Vide({ texte }: { texte: string }) {
  return <p className="text-muted-foreground py-10 text-center text-sm">{texte}</p>;
}

// ---------------------------------------------------------------------------
// E-29 — Relevé de notes, et E-34 — évolution
// ---------------------------------------------------------------------------

export function OngletNotes({ dossier }: { dossier: DossierScolarite }) {
  const { releve, evolution, periodeReleve } = dossier;

  const notees = releve.filter((m) => m.moyenne !== null);
  const coeffs = notees.reduce((t, m) => t + m.coefficient, 0);
  const points = notees.reduce((t, m) => t + (m.moyenne ?? 0) * m.coefficient, 0);
  const generale = coeffs > 0 ? points / coeffs : null;

  return (
    <div className="space-y-6">
      {/* E-34 : la progression se lit d'abord. Un parent, comme un professeur
          principal, regarde si l'élève monte ou décroche avant de regarder le
          détail par matière. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Évolution sur l&apos;année</CardTitle>
          <CardDescription>
            La moyenne de la classe est rappelée à côté : une baisse de 12 à 11 n&apos;a pas le
            même sens si la classe a baissé autant.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">Moyenne</TableHead>
                <TableHead className="text-right">Classe</TableHead>
                <TableHead className="text-right">Écart</TableHead>
                <TableHead className="text-right">Rang</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evolution.map((p) => {
                const ecart =
                  p.moyenne !== null && p.moyenneClasse !== null ? p.moyenne - p.moyenneClasse : null;
                return (
                  <TableRow key={p.periode} className={p.moyenne === null ? "opacity-55" : undefined}>
                    <TableCell>{p.periode}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {n2(p.moyenne)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {n2(p.moyenneClasse)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ecart === null ? (
                        "—"
                      ) : (
                        <Badge variant={ecart >= 0 ? "default" : "destructive"}>
                          {ecart > 0 ? "+" : ""}
                          {n2(ecart)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.rang === null ? "—" : `${p.rang}${p.effectif ? ` / ${p.effectif}` : ""}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Relevé par matière
            {periodeReleve ? (
              <span className="text-muted-foreground ml-2 font-normal">{periodeReleve}</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {releve.length === 0 ? (
            <Vide texte="Aucune moyenne calculée. Elles apparaissent après la production des bulletins." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matière</TableHead>
                  <TableHead className="text-right">Coeff.</TableHead>
                  <TableHead className="text-right">Moyenne</TableHead>
                  <TableHead className="text-right">Classe</TableHead>
                  <TableHead className="text-right">Rang</TableHead>
                  <TableHead className="text-right">Évaluations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releve.map((m) => (
                  <TableRow key={m.matiere}>
                    <TableCell>{m.matiere}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.coefficient}</TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        m.moyenne !== null && m.moyenne < 10
                          ? "text-destructive"
                          : m.moyenne !== null && m.moyenne >= 14
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                      }`}
                    >
                      {n2(m.moyenne)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {n2(m.moyenneClasse)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.rang ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {m.nbEvaluations}
                    </TableCell>
                  </TableRow>
                ))}
                {generale !== null ? (
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-semibold">Moyenne générale</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{coeffs}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {n2(generale)}
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// E-30 — Assiduité
// ---------------------------------------------------------------------------

export function OngletAssiduite({ dossier }: { dossier: DossierScolarite }) {
  const { assiduite } = dossier;

  const absences = assiduite.filter((l) => l.type === "absence");
  const retards = assiduite.filter((l) => l.type === "retard");
  const nonJustifiees = absences.filter((l) => l.statut === "NON_JUSTIFIEE").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Assiduité</CardTitle>
        <CardDescription>
          {absences.length} absence(s) dont {nonJustifiees} non justifiée(s), {retards.length}{" "}
          retard(s). Absences et retards sont mêlés volontairement : dix retards et zéro absence
          n&apos;est pas le même problème que l&apos;inverse.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {assiduite.length === 0 ? (
          <Vide texte="Aucune absence ni retard enregistré." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Nature</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Motif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assiduite.map((l) => (
                <TableRow key={`${l.type}-${l.id}`}>
                  <TableCell className="whitespace-nowrap tabular-nums">{dateFr(l.date)}</TableCell>
                  <TableCell>
                    <Badge variant={l.type === "absence" ? "secondary" : "outline"}>
                      {l.type === "absence" ? "Absence" : "Retard"}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{l.duree}</TableCell>
                  <TableCell className="text-muted-foreground">{l.matiere ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.statut === "JUSTIFIEE"
                          ? "default"
                          : l.statut === "EN_ATTENTE"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {l.statut.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {l.motif ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E-31 — Discipline
// ---------------------------------------------------------------------------

export function OngletDiscipline({ dossier }: { dossier: DossierScolarite }) {
  const { discipline } = dossier;
  const aExecuter = discipline.filter((l) => l.executee === false).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Discipline</CardTitle>
        <CardDescription>
          Incidents et sanctions, du plus récent au plus ancien.
          {aExecuter > 0
            ? ` ${aExecuter} sanction(s) prononcée(s) mais pas encore exécutée(s).`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {discipline.length === 0 ? (
          <Vide texte="Aucun incident ni sanction. Le dossier disciplinaire est vierge." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Nature</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Détail</TableHead>
                <TableHead>État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discipline.map((l) => (
                <TableRow key={`${l.nature}-${l.id}`}>
                  <TableCell className="whitespace-nowrap tabular-nums">{dateFr(l.date)}</TableCell>
                  <TableCell>
                    <Badge variant={l.nature === "sanction" ? "destructive" : "secondary"}>
                      {l.nature === "sanction" ? "Sanction" : "Incident"}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{l.libelle.toLowerCase()}</TableCell>
                  <TableCell className="text-muted-foreground max-w-sm truncate">
                    {l.detail ?? "—"}
                  </TableCell>
                  <TableCell>
                    {l.gravite ? (
                      <Badge variant="outline">{l.gravite.toLowerCase().replace(/_/g, " ")}</Badge>
                    ) : l.executee === false ? (
                      <Badge variant="destructive">À exécuter</Badge>
                    ) : l.executee ? (
                      <Badge>Exécutée</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E-32 — Finances
// ---------------------------------------------------------------------------

export function OngletFinances({ dossier }: { dossier: DossierScolarite }) {
  const { echeances, paiements } = dossier;

  const du = echeances.reduce((t, e) => t + e.du, 0);
  const paye = echeances.reduce((t, e) => t + e.paye, 0);
  const exonere = echeances.reduce((t, e) => t + e.exonere, 0);
  const reste = echeances.reduce((t, e) => t + e.reste, 0);
  const enRetard = echeances.filter((e) => e.enRetard).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Échéancier</CardTitle>
          <CardDescription>
            {enRetard > 0
              ? `${enRetard} échéance(s) dépassée(s) et non soldée(s) — ce sont celles qui justifient une relance.`
              : "Aucune échéance dépassée."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {echeances.length === 0 ? (
            <Vide texte="Aucune échéance. L'échéancier n'a pas encore été généré pour cet élève." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead className="text-right">Dû</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead className="text-right">Exonéré</TableHead>
                  <TableHead className="text-right">Reste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {echeances.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      {e.libelle}
                      <span className="text-muted-foreground ml-2 text-xs">{e.nature}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {dateFr(e.dateLimite)}
                      {e.enRetard ? (
                        <Badge variant="destructive" className="ml-2">
                          dépassée
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fcfa(e.du)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fcfa(e.paye)}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {e.exonere > 0 ? fcfa(e.exonere) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        e.reste > 0 ? "text-destructive" : ""
                      }`}
                    >
                      {e.reste > 0 ? fcfa(e.reste) : "soldé"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={2} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fcfa(du)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fcfa(paye)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fcfa(exonere)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fcfa(reste)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reçus émis</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {paiements.length === 0 ? (
            <Vide texte="Aucun versement enregistré." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° reçu</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Payeur</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right">Reçu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paiements.map((p) => (
                  <TableRow key={p.id} className={p.annule ? "opacity-55" : undefined}>
                    <TableCell className="font-mono text-xs">{p.numeroRecu}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {dateFr(p.date)}
                    </TableCell>
                    <TableCell>{p.mode.toLowerCase().replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-muted-foreground">{p.payeur ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fcfa(p.montant)}
                      {p.annule ? (
                        <Badge variant="destructive" className="ml-2">
                          annulé
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.annule ? (
                        "—"
                      ) : (
                        <a
                          href={`/api/documents/recu/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-sm hover:underline"
                        >
                          Imprimer
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
