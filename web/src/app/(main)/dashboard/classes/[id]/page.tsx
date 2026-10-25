import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, ClipboardList,
  GraduationCap, Printer, School, Search, Users, UserRound,
} from "lucide-react";

import { db } from "@/server/db";
import { exigerPage, peut } from "@/server/guard";
import { listerAnnees, listerClassesAnnee } from "@/server/domain/parametres";
import { rechercherElevesClasses } from "../eleves-actions";
import { urlImpressionClasses } from "../impression-url";
import { BoutonNotifier } from "../../_components/bouton-notifier";

export const metadata: Metadata = { title: "Détails de la classe" };
export const dynamic = "force-dynamic";

const carte = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-card";
const lien = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-border dark:bg-card dark:text-foreground";

export default async function DetailClasse({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ annee?: string; q?: string; page?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const principal = await exigerPage("classe:lire");
  const annees = await listerAnnees();
  const annee = annees.find((a) => a.id === p.annee)
    ?? (p.annee ? null : annees.find((a) => a.estCourante));
  if (!annee) notFound();

  const classes = await listerClassesAnnee(annee.id);
  const classe = classes.find((c) => c.id === id);
  if (!classe) notFound();
  const peutVoirEleves = await peut(principal, "eleve:lire", { classeId: id });
  const peutNotifier = await peut(principal, "message:envoyer", { classeId: id });
  const page = Math.max(1, Math.min(10000, Number(p.page) || 1));
  const recherche = (p.q ?? "").slice(0, 80);
  const [annuaire, repartition] = peutVoirEleves ? await Promise.all([
    rechercherElevesClasses({ anneeId: annee.id, classesIds: [id], recherche, page }),
    db.execute<{ filles: number; garcons: number }>(sql`
      SELECT
        count(*) FILTER (WHERE e.sexe = 'F')::int AS filles,
        count(*) FILTER (WHERE e.sexe = 'M')::int AS garcons
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      WHERE i.classe_id = ${id}::uuid AND i.annee_id = ${annee.id}::uuid AND i.active
    `),
  ]) : [null, null];
  const effectif = Number(classe.effectif);
  const capacite = Number(classe.capaciteMax);
  const taux = capacite > 0 ? Math.round(effectif / capacite * 100) : 0;
  const pages = Math.max(1, Math.ceil((annuaire?.total ?? 0) / 25));
  function adresse(suivante: number) {
    const q = new URLSearchParams({ annee: annee!.id, page: String(suivante) });
    if (recherche) q.set("q", recherche);
    return `/dashboard/classes/${id}?${q.toString()}`;
  }
  const classeTitre = classe.libelle;
  return <main className="mx-auto max-w-[1520px] space-y-4 pb-8 text-slate-950 dark:text-foreground">
    <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <Link href="/dashboard/classes" className="hover:text-blue-600">Classes</Link><span>/</span><span className="font-semibold text-slate-800 dark:text-foreground">{classeTitre}</span>
    </nav>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-border">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <GraduationCap className="size-6" aria-hidden />
        </span>
        <div><h1 className="text-2xl font-bold tracking-tight">{classeTitre} <span className="ml-1 align-middle text-sm font-medium text-slate-500">({classe.code})</span></h1>
          <p className="mt-1 text-sm text-slate-500">{classe.niveauLibelle}{classe.serieCode ? " · Série " + classe.serieCode : ""} · {annee.libelle}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className={lien} href={`/dashboard/classes?annee=${annee.id}`}><ArrowLeft className="size-4" aria-hidden />Retour aux classes</Link>
        {peutVoirEleves && <a className={lien} href={urlImpressionClasses(annee.id, [id])} target="_blank" rel="noopener noreferrer"><Printer className="size-4" aria-hidden />Imprimer la liste</a>}
        {peutNotifier && effectif > 0 && classe.active && <BoutonNotifier contexteClasses cible={{ type:"classe",id,nom:classeTitre }} libelle="Prévenir les parents" />}
      </div>
    </header>

    <section aria-label="Indicateurs de la classe" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        { icon: Users, label: "Élèves inscrits", value: effectif, detail: "Année sélectionnée" },
        { icon: School, label: "Capacité", value: capacite, detail: "Places autorisées" },
        { icon: BookOpen, label: "Places disponibles", value: Math.max(0, capacite - effectif), detail: "Capacité restante" },
        { icon: GraduationCap, label: "Remplissage", value: taux + " %", detail: classe.active ? "Classe active" : "Classe inactive" },
      ].map(({icon: Icon,label,value,detail}) => <article key={label} className={carte}>
        <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/25"><Icon className="size-4" aria-hidden /></span>
        <p className="mt-3 text-xs text-slate-500">{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
      </article>)}
    </section>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)]">
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-border">
          <div><h2 className="text-base font-bold">Élèves de {classeTitre}</h2><p className="mt-1 text-xs text-slate-500">Dossiers inscrits dans la classe pour {annee.libelle}</p></div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{annuaire ? annuaire.total : effectif} élèves</span>
        </div>
        {!peutVoirEleves ? <p className="p-5 text-sm text-slate-500">Votre compte n'a pas l'autorisation de consulter les dossiers des élèves.</p> : <>
          <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-border">
            <input type="hidden" name="annee" value={annee.id} />
            <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="search" name="q" defaultValue={recherche} placeholder="Rechercher un nom ou matricule…" aria-label="Rechercher un élève de la classe"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 dark:border-border dark:bg-card" /></div>
            <button type="submit" className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Rechercher</button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[590px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-muted/30"><tr>
                <th className="px-4 py-3 font-semibold">Élève</th><th className="px-4 py-3 font-semibold">Matricule</th>
                <th className="px-4 py-3 font-semibold">État du dossier</th><th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-border">
                {annuaire?.lignes.map(e => <tr key={e.id} className="hover:bg-blue-50/50 dark:hover:bg-muted/20">
                  <td className="px-4 py-3 font-semibold">{e.prenom} {e.nom}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-600 dark:text-muted-foreground">{e.matricule}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium dark:bg-muted">{e.dossier.replaceAll("_", " ")}</span></td>
                  <td className="px-4 py-3 text-right"><Link href={`/dashboard/eleves/${e.id}`} className="text-xs font-semibold text-blue-700 hover:underline">Ouvrir le dossier</Link></td>
                </tr>)}
                {annuaire?.lignes.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">Aucun élève trouvé.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs dark:border-border">
            <span className="text-slate-500">Page {page} / {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={adresse(page-1)} className={lien}><ChevronLeft className="size-3.5" aria-hidden />Précédent</Link>}
              {page < pages && <Link href={adresse(page+1)} className={lien}>Suivant<ChevronRight className="size-3.5" aria-hidden /></Link>}
            </div>
          </div>
        </>}
      </section>

      <aside className="min-w-0 space-y-3">
        <section className={carte}>
          <h2 className="flex items-center gap-2 text-sm font-bold"><ClipboardList className="size-4 text-blue-600" aria-hidden />Informations de classe</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ["Année scolaire", annee.libelle],
              ["Niveau", classe.niveauLibelle],
              ["Série", classe.serieCode ?? "Sans série"],
              ["Code", classe.code],
              ["Statut", classe.active ? "Active" : "Inactive"],
            ].map(([k,v]) => <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 dark:border-border">
              <dt className="text-slate-500">{k}</dt><dd className="text-right font-semibold">{v}</dd>
            </div>)}
          </dl>
        </section>
        {peutVoirEleves && <section className={carte}>
          <h2 className="flex items-center gap-2 text-sm font-bold"><UserRound className="size-4 text-blue-600" aria-hidden />Répartition des élèves</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/25"><p className="text-xs text-slate-500">Filles</p><p className="mt-1 text-xl font-bold">{Number(repartition?.rows[0]?.filles ?? 0)}</p></div>
            <div className="rounded-lg bg-violet-50 p-3 dark:bg-violet-950/25"><p className="text-xs text-slate-500">Garçons</p><p className="mt-1 text-xl font-bold">{Number(repartition?.rows[0]?.garcons ?? 0)}</p></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Calculé uniquement sur les inscriptions actives de l'année sélectionnée.</p>
        </section>}
        <section className={carte}>
          <h2 className="text-sm font-bold">Gestion</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Pour changer l'affectation, consulter les parents ou modifier le dossier d'un élève, ouvrez sa fiche depuis le tableau. La modification de la classe reste accessible sur la page Classes.</p>
          <Link href={`/dashboard/classes?annee=${annee.id}`} className={"mt-3 " + lien}>Revenir à la gestion des classes</Link>
        </section>
      </aside>
    </div>
  </main>;
}
