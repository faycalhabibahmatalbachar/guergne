"use client";

import Link from "next/link";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, Info, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formaterFcfa } from "@/lib/finances-format";
import type {
  Alerte,
  IndicateursCles,
  PointClasse,
  PointMatiere,
  PointMois,
  PointNiveau,
  PointRecouvrement,
} from "@/server/domain/pilotage";

/**
 * Tableau de bord de pilotage.
 *
 * Les indicateurs sont regroupés par thème plutôt qu'entassés : une direction
 * lit quatre chiffres justes, pas quatorze en vrac. Les graphiques vivent dans
 * des onglets pour la même raison — les afficher tous ensemble rendrait la
 * page illisible et lente à charger sur une connexion tchadienne.
 */

const AXE = { fontSize: 11, fill: "currentColor", opacity: 0.6 };

const infobulle = {
  contentStyle: {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
};

export function Pilotage({
  indicateurs,
  niveaux,
  absences,
  classes,
  matieres,
  recouvrement,
  listeAlertes,
}: {
  indicateurs: IndicateursCles;
  niveaux: PointNiveau[];
  absences: PointMois[];
  classes: PointClasse[];
  matieres: PointMatiere[];
  recouvrement: PointRecouvrement[];
  listeAlertes: Alerte[];
}) {
  const i = indicateurs;

  interface Carte {
    libelle: string;
    valeur: number | string;
    ton?: "bon" | "alerte" | "danger";
    aide?: string;
  }

  const groupes: Array<{ titre: string; cartes: Carte[] }> = [
    {
      titre: "Effectifs",
      cartes: [
        { libelle: "Élèves inscrits", valeur: i.effectif },
        { libelle: "Nouveaux inscrits", valeur: i.nouveauxInscrits },
        { libelle: "Réinscriptions", valeur: i.reinscriptions },
        { libelle: "Classes", valeur: i.classes },
        { libelle: "Enseignants", valeur: i.enseignants },
      ],
    },
    {
      titre: "Présence du jour",
      cartes: [
        { libelle: "Présents", valeur: i.presentsAujourdhui, ton: "bon" },
        { libelle: "Absents", valeur: i.absentsAujourdhui, ton: i.absentsAujourdhui > 0 ? "alerte" : undefined },
        { libelle: "Retards", valeur: i.retardsAujourdhui, ton: i.retardsAujourdhui > 0 ? "alerte" : undefined },
      ],
    },
    {
      titre: "Situations particulières",
      cartes: [
        { libelle: "Suspendus", valeur: i.suspendus, ton: i.suspendus > 0 ? "alerte" : undefined },
        { libelle: "Exclus", valeur: i.exclus, ton: i.exclus > 0 ? "danger" : undefined },
        { libelle: "Transférés", valeur: i.transferes },
      ],
    },
    {
      titre: "Résultats",
      cartes: [
        {
          libelle: "Moyenne générale",
          valeur: i.moyenneGenerale != null ? `${i.moyenneGenerale}/20` : "—",
          aide: i.moyenneGenerale == null ? "Aucune moyenne calculée" : undefined,
        },
        {
          libelle: "Taux de réussite",
          valeur: i.tauxReussite != null ? `${i.tauxReussite} %` : "—",
          aide: i.tauxReussite == null ? "Aucun bulletin produit" : undefined,
        },
        {
          libelle: "Taux d'absentéisme",
          valeur: i.tauxAbsenteisme != null ? `${i.tauxAbsenteisme} %` : "—",
          ton: (i.tauxAbsenteisme ?? 0) > 5 ? "alerte" : undefined,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Alertes en tête : ce qui demande une action aujourd'hui */}
      {listeAlertes.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
              Ce qui demande une action
            </CardTitle>
            <CardDescription>
              Seules les situations réellement en cours sont listées — une alerte à zéro noierait
              les vraies.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {listeAlertes.map((a) => (
              <Link
                key={`${a.categorie}-${a.libelle}`}
                href={a.url}
                className="group flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="flex items-center gap-2.5 text-sm">
                  {a.gravite === "danger" ? (
                    <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
                  ) : a.gravite === "alerte" ? (
                    <TriangleAlert
                      className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                  ) : (
                    <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>
                    <span className="font-semibold tabular-nums">{a.nombre}</span> {a.libelle}
                    <span className="block text-muted-foreground text-xs">{a.categorie}</span>
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Indicateurs, groupés par thème */}
      {groupes.map((groupe) => (
        <section key={groupe.titre} className="space-y-3">
          <h2 className="font-medium text-muted-foreground text-sm">{groupe.titre}</h2>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {groupe.cartes.map((c) => (
              <Card key={c.libelle}>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-xs">{c.libelle}</p>
                  <p
                    className={`mt-1 font-semibold text-2xl tabular-nums ${
                      c.ton === "danger"
                        ? "text-destructive"
                        : c.ton === "alerte"
                          ? "text-amber-600 dark:text-amber-400"
                          : c.ton === "bon"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                    }`}
                  >
                    {c.valeur}
                  </p>
                  {c.aide ? <p className="mt-0.5 text-muted-foreground text-xs">{c.aide}</p> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {/* Graphiques, répartis par onglet */}
      <Tabs defaultValue="effectifs">
        <TabsList>
          <TabsTrigger value="effectifs">Effectifs</TabsTrigger>
          <TabsTrigger value="resultats">Résultats</TabsTrigger>
          <TabsTrigger value="vie-scolaire">Vie scolaire</TabsTrigger>
          <TabsTrigger value="finances">Finances</TabsTrigger>
        </TabsList>

        {/* --- Effectifs --- */}
        <TabsContent value="effectifs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Répartition par niveau et par sexe</CardTitle>
              <CardDescription>
                La parité par niveau révèle les décrochages : au Tchad, l&apos;écart se creuse
                généralement à partir de la 4ème.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {niveaux.length === 0 ? (
                <Vide message="Aucun élève inscrit." />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={niveaux}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                    <XAxis dataKey="niveau" tick={AXE} />
                    <YAxis tick={AXE} allowDecimals={false} />
                    <Tooltip {...infobulle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="garcons" name="Garçons" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="filles" name="Filles" fill="#e11d48" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Résultats --- */}
        <TabsContent value="resultats" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Moyennes par classe</CardTitle>
              <CardDescription>
                Comparer les classes d&apos;un même niveau met en évidence les écarts
                pédagogiques.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {classes.filter((c) => c.moyenne != null).length === 0 ? (
                <Vide message="Aucune moyenne calculée — les notes ne sont pas encore saisies." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={classes.filter((c) => c.moyenne != null)}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                    <XAxis dataKey="classe" tick={AXE} />
                    <YAxis domain={[0, 20]} tick={AXE} />
                    <Tooltip {...infobulle} />
                    <Bar dataKey="moyenne" name="Moyenne /20" fill="#1e429f" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Résultats par matière</CardTitle>
              <CardDescription>
                Identifie les matières où la classe entière décroche — c&apos;est souvent un signal
                pédagogique, pas un problème d&apos;élèves.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {matieres.length === 0 ? (
                <Vide message="Aucune moyenne par matière." />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={matieres} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" domain={[0, 20]} tick={AXE} />
                    <YAxis dataKey="matiere" type="category" width={120} tick={AXE} />
                    <Tooltip {...infobulle} />
                    <Bar dataKey="moyenne" name="Moyenne /20" radius={[0, 3, 3, 0]}>
                      {matieres.map((m) => (
                        <Cell key={m.matiere} fill={m.couleur ?? "#64748b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Vie scolaire --- */}
        <TabsContent value="vie-scolaire" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Absences par mois</CardTitle>
              <CardDescription>
                Le rapport entre justifiées et non justifiées mesure l&apos;efficacité du suivi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {absences.length === 0 ? (
                <Vide message="Aucune absence enregistrée." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={absences}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                    <XAxis dataKey="libelle" tick={AXE} />
                    <YAxis tick={AXE} />
                    <Tooltip {...infobulle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="justifiees" name="Justifiées (h)" stackId="a" fill="#16a34a" />
                    <Bar
                      dataKey="nonJustifiees"
                      name="Non justifiées (h)"
                      stackId="a"
                      fill="#e11d48"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Finances --- */}
        <TabsContent value="finances" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Évolution du recouvrement</CardTitle>
              <CardDescription>
                Le cumul montre la trésorerie réellement encaissée depuis la rentrée.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recouvrement.length === 0 ? (
                <Vide message="Aucun encaissement enregistré." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={recouvrement}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="libelle" tick={AXE} />
                    <YAxis
                      tick={AXE}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)} M`}
                    />
                    <Tooltip {...infobulle} formatter={(v) => formaterFcfa(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="encaisse"
                      name="Encaissé dans le mois"
                      stroke="#c98a3c"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumul"
                      name="Cumul depuis la rentrée"
                      stroke="#1e429f"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Classement des classes */}
      {classes.filter((c) => c.moyenne != null).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Classement des classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...classes]
              .filter((c) => c.moyenne != null)
              .sort((a, b) => (b.moyenne ?? 0) - (a.moyenne ?? 0))
              .map((c, index) => (
                <div
                  key={c.classeId}
                  className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
                >
                  <span className="flex items-center gap-3">
                    <Badge variant="outline" className="tabular-nums">
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{c.classe}</span>
                    <span className="text-muted-foreground text-xs">{c.effectif} élèves</span>
                  </span>
                  <span className="flex items-center gap-4 text-sm tabular-nums">
                    <span className="font-semibold">{c.moyenne}/20</span>
                    <span className="text-muted-foreground">{c.tauxReussite ?? "—"} % de réussite</span>
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Vide({ message }: { message: string }) {
  return (
    <p className="py-16 text-center text-muted-foreground text-sm">{message}</p>
  );
}
