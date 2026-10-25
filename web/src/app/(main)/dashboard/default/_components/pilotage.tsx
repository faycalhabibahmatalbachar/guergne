"use client";

import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Banknote, BarChart3, Bell,
  BookOpenCheck, CheckCircle2, ChevronRight, CircleHelp, Clock3,
  GraduationCap, School, ShieldAlert, TrendingUp, Users, UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formaterFcfa } from "@/lib/finances-format";
import type {
  Alerte, IndicateursCles, PointClasse, PointMatiere, PointMois,
  PointNiveau, PointRecouvrement,
} from "@/server/domain/pilotage";

export interface AccesTableauDeBord {
  eleves: boolean;
  classes: boolean;
  assiduite: boolean;
  notes: boolean;
  finances: boolean;
  communication: boolean;
  personnel: boolean;
}

interface Props {
  indicateurs: IndicateursCles;
  niveaux: PointNiveau[];
  absences: PointMois[];
  classes: PointClasse[];
  matieres: PointMatiere[];
  recouvrement: PointRecouvrement[];
  listeAlertes: Alerte[];
  acces: AccesTableauDeBord;
}

const AXE = { fontSize: 11, fill: "#64748b" };
const tooltip = {
  contentStyle: { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 },
};
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");

function Indicateur({ titre, valeur, detail, icone: Icone, couleur, href }: {
  titre: string;
  valeur: string;
  detail: string;
  icone: LucideIcon;
  couleur: string;
  href?: string;
}) {
  const contenu = (
    <div className="group flex h-full min-w-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm transition-colors hover:border-slate-300 dark:border-border dark:bg-card dark:hover:border-slate-600">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{titre}</span>
        <span className={"flex size-9 shrink-0 items-center justify-center rounded-xl " + couleur}>
          <Icone className="size-[18px]" aria-hidden />
        </span>
      </div>
      <div>
        <p className="text-[28px] font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-foreground">{valeur}</p>
        <p className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{contenu}</Link> : contenu;
}

function EnTeteBloc({ titre, description, icone: Icone, href, lien = "Voir le détail" }: {
  titre: string;
  description?: string;
  icone: LucideIcon;
  href?: string;
  lien?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-muted dark:text-foreground">
          <Icone className="size-[18px]" aria-hidden />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950 dark:text-foreground">{titre}</h2>
          {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {href ? <Link href={href} className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-2 dark:text-blue-300">
        {lien}<ChevronRight className="size-3.5" aria-hidden />
      </Link> : null}
    </div>
  );
}

function AucunResultat({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm text-slate-500 dark:text-muted-foreground">{children}</div>;
}

export function Pilotage({
  indicateurs: i, niveaux, absences, classes, matieres, recouvrement, listeAlertes, acces,
}: Props) {
  const dernierRecouvrement = recouvrement.length ? recouvrement[recouvrement.length - 1] : null;
  const risques = [...listeAlertes].sort((a, b) => {
    const gravite = { danger: 0, alerte: 1, info: 2 };
    return gravite[a.gravite] - gravite[b.gravite] || b.nombre - a.nombre;
  });
  const cards = [
    { titre: "Élèves inscrits", valeur: nombre(i.effectif), detail: nombre(i.nouveauxInscrits) + " nouvelles inscriptions", icone: Users, couleur: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", href: acces.eleves ? "/dashboard/eleves" : undefined },
    { titre: "Classes actives", valeur: nombre(i.classes), detail: "Répartition de l'établissement", icone: School, couleur: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", href: acces.classes ? "/dashboard/classes" : undefined },
    { titre: "Enseignants", valeur: nombre(i.enseignants), detail: "Personnel enseignant actif", icone: UserRoundCheck, couleur: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", href: acces.personnel ? "/dashboard/personnel" : undefined },
    ...(acces.notes ? [
      { titre: "Taux de réussite", valeur: i.tauxReussite === null ? "—" : nombre(i.tauxReussite) + " %", detail: i.moyenneGenerale === null ? "Moyennes non disponibles" : "Moyenne : " + nombre(i.moyenneGenerale) + "/20", icone: GraduationCap, couleur: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", href: "/dashboard/notes" },
    ] : []),
  ];
  return (
    <div className="space-y-5 text-slate-950 dark:text-foreground">
      <section aria-label="Indicateurs clés" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => <Indicateur key={c.titre} {...c} />)}
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]" aria-label="Priorités et suivi du jour">
        <Card className="min-w-0 rounded-2xl border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <EnTeteBloc titre="À traiter en priorité" description="Situations détectées dans les données de l'établissement." icone={ShieldAlert} />
            {risques.length ? (
              <div className="space-y-2.5">
                {risques.slice(0, 6).map((alerte) => {
                  const fort = alerte.gravite === "danger";
                  const Icone = fort ? AlertTriangle : alerte.gravite === "alerte" ? Clock3 : Bell;
                  return <Link key={alerte.categorie + alerte.libelle} href={alerte.url}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200/90 px-3 py-2.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-border dark:hover:bg-muted/40">
                    <span className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + (fort ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" : alerte.gravite === "alerte" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300")}>
                      <Icone className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-5">{alerte.libelle}</p>
                      <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{alerte.categorie}</p>
                    </div>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold tabular-nums dark:bg-muted">{nombre(alerte.nombre)}</span>
                    <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>;
                })}
                {risques.length > 6 ? <p className="text-xs text-slate-500">{risques.length - 6} autres situations disponibles dans les modules concernés.</p> : null}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="size-5 shrink-0" aria-hidden />
                Aucune alerte active dans les modules auxquels vous avez accès.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <CardContent className="space-y-4 p-4 sm:p-5">
            {acces.assiduite ? (
              <>
                <EnTeteBloc titre="Assiduité du jour" description="Signalements enregistrés aujourd'hui." icone={BookOpenCheck} href="/dashboard/assiduite" lien="Suivre" />
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <div className="flex items-start gap-2">
                    <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                    <div>
                      <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">Présence non certifiée</p>
                      <p className="mt-1 text-[11px] leading-5 text-amber-900/90 dark:text-amber-200/80">
                        Les absences signalées ne constituent pas un pointage complet. Aucun nombre de présents n'est déduit automatiquement.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-muted/40">
                    <p className="text-xs text-slate-500 dark:text-muted-foreground">Absents signalés</p>
                    <p className="mt-1 text-[27px] font-bold tabular-nums">{nombre(i.absentsAujourdhui)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-muted/40">
                    <p className="text-xs text-slate-500 dark:text-muted-foreground">Retards signalés</p>
                    <p className="mt-1 text-[27px] font-bold tabular-nums">{nombre(i.retardsAujourdhui)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-border">
                  <span className="text-slate-500 dark:text-muted-foreground">Taux d'absentéisme estimé</span>
                  <span className="font-semibold tabular-nums">{i.tauxAbsenteisme == null ? "—" : nombre(i.tauxAbsenteisme) + " %"}</span>
                </div>
              </>
            ) : (
              <>
                <EnTeteBloc titre="Repères de scolarité" description="État global des inscriptions." icone={School} />
                <div className="space-y-3">
                  <p className="flex justify-between text-sm"><span>Inscrits</span><strong className="tabular-nums">{nombre(i.effectif)}</strong></p>
                  <p className="flex justify-between text-sm"><span>Nouvelles inscriptions</span><strong className="tabular-nums">{nombre(i.nouveauxInscrits)}</strong></p>
                  <p className="flex justify-between text-sm"><span>Réinscriptions</span><strong className="tabular-nums">{nombre(i.reinscriptions)}</strong></p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Analyses de l'établissement">
        {acces.eleves ? <Card className="min-w-0 rounded-2xl border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="pb-2">
            <EnTeteBloc titre="Répartition des effectifs" description="Filles et garçons par niveau scolaire." icone={Users} href="/dashboard/eleves" />
          </CardHeader>
          <CardContent className="min-w-0 px-3 pb-4 sm:px-5">
            {niveaux.length ? <div className="min-w-0" role="img" aria-label="Histogramme des effectifs par niveau et par sexe">
              <ResponsiveContainer width="100%" height={276}>
                <BarChart data={niveaux} margin={{ top: 10, right: 10, left: -16, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.6} />
                  <XAxis dataKey="niveau" tick={AXE} tickLine={false} axisLine={false} />
                  <YAxis tick={AXE} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="garcons" name="Garçons" stackId="total" fill="#1E429F" maxBarSize={38} />
                  <Bar dataKey="filles" name="Filles" stackId="total" fill="#34A485" radius={[4, 4, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div> : <AucunResultat>Aucun effectif à représenter.</AucunResultat>}
          </CardContent>
        </Card> : null}

        {acces.notes ? <Card className="min-w-0 rounded-2xl border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="pb-2">
            <EnTeteBloc titre="Performances par matière" description="Moyennes enregistrées pour la période active, sur 20." icone={TrendingUp} href="/dashboard/notes" />
          </CardHeader>
          <CardContent className="min-w-0 px-3 pb-4 sm:px-5">
            {matieres.length ? <div className="min-w-0" role="img" aria-label="Comparaison des moyennes par matière">
              <ResponsiveContainer width="100%" height={276}>
                <BarChart data={matieres.slice(0, 9)} layout="vertical" margin={{ top: 6, right: 14, left: 4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" opacity={0.6} />
                  <XAxis type="number" domain={[0, 20]} tick={AXE} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="matiere" width={105} tick={AXE} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltip} />
                  <Bar dataKey="moyenne" name="Moyenne /20" radius={[0, 4, 4, 0]} maxBarSize={19}>
                    {matieres.slice(0, 9).map((m, index) => <Cell key={m.matiere + index} fill={m.couleur ?? "#1E429F"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div> : <AucunResultat>Aucune moyenne par matière disponible.</AucunResultat>}
            {matieres.length > 9 ? <p className="mt-1 text-right text-[11px] text-slate-500">9 matières affichées sur {matieres.length}. Consultez les notes pour le détail.</p> : null}
          </CardContent>
        </Card> : null}

        {acces.finances ? <Card className="min-w-0 rounded-2xl border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="pb-2">
            <EnTeteBloc titre="Recouvrement des frais" description="Évolution des versements et cumul de l'année active." icone={Banknote} href="/dashboard/finances" />
          </CardHeader>
          <CardContent className="min-w-0 px-3 pb-4 sm:px-5">
            {dernierRecouvrement ? (
              <>
                <div className="mb-3 px-2">
                  <p className="text-xs text-slate-500 dark:text-muted-foreground">Total encaissé depuis la rentrée</p>
                  <p className="mt-1 text-[24px] font-bold tracking-tight tabular-nums">{formaterFcfa(dernierRecouvrement.cumul)}</p>
                </div>
                <div className="min-w-0" role="img" aria-label="Évolution du recouvrement scolaire">
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={recouvrement} margin={{ top: 6, right: 10, left: -12, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.6} />
                      <XAxis dataKey="libelle" tick={AXE} tickLine={false} axisLine={false} />
                      <YAxis tick={AXE} tickFormatter={(value) => nombre(Math.round(Number(value) / 1000000)) + " M"} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltip} formatter={(value) => formaterFcfa(Number(value))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line dataKey="encaisse" name="Encaissements du mois" type="monotone" stroke="#D29D48" strokeWidth={2} dot={false} />
                      <Line dataKey="cumul" name="Cumul" type="monotone" stroke="#1E429F" strokeWidth={2.5} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : <AucunResultat>Aucun encaissement enregistré pour l'année.</AucunResultat>}
          </CardContent>
        </Card> : null}

        {acces.assiduite ? <Card className="min-w-0 rounded-2xl border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="pb-2">
            <EnTeteBloc titre="Évolution des absences" description="Heures justifiées et non justifiées par mois." icone={BarChart3} href="/dashboard/assiduite" />
          </CardHeader>
          <CardContent className="min-w-0 px-3 pb-4 sm:px-5">
            {absences.length ? <div className="min-w-0" role="img" aria-label="Histogramme mensuel des absences">
              <ResponsiveContainer width="100%" height={276}>
                <BarChart data={absences} margin={{ top: 6, right: 10, left: -12, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.6} />
                  <XAxis dataKey="libelle" tick={AXE} tickLine={false} axisLine={false} />
                  <YAxis tick={AXE} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="justifiees" name="Justifiées" stackId="a" fill="#34A485" maxBarSize={35} />
                  <Bar dataKey="nonJustifiees" name="Non justifiées" stackId="a" fill="#D97745" radius={[4, 4, 0, 0]} maxBarSize={35} />
                </BarChart>
              </ResponsiveContainer>
            </div> : <AucunResultat>Aucune absence enregistrée pour l'année.</AucunResultat>}
          </CardContent>
        </Card> : null}
      </section>

      {(acces.eleves || acces.classes || acces.communication || acces.finances) ? (
        <section aria-label="Accès opérationnels" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
          <EnTeteBloc titre="Accès rapides aux modules" description="Reprendre le travail sans parcourir les menus." icone={BookOpenCheck} />
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {([
              acces.eleves ? { titre: "Dossiers des élèves", href: "/dashboard/eleves", Icone: Users } : null,
              acces.classes ? { titre: "Gestion des classes", href: "/dashboard/classes", Icone: School } : null,
              acces.communication ? { titre: "Communication", href: "/dashboard/communication", Icone: Bell } : null,
              acces.finances ? { titre: "Gestion financière", href: "/dashboard/finances", Icone: Banknote } : null,
            ].filter((lien) => lien !== null)).map((lien) => (
              <Link key={lien.href} href={lien.href} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-border dark:hover:bg-muted/40">
                <lien.Icone className="size-4 shrink-0 text-blue-800 dark:text-blue-300" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{lien.titre}</span>
                <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
