import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  ArrowLeft, ArrowRight, BellRing, BookOpen, CalendarDays, Check,
  ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Eye,
  FileText, GraduationCap, Info, Pencil, Printer, Search,
  ShieldCheck, School, UserRoundCheck, Users,
} from "lucide-react";

import { db } from "@/server/db";
import { exigerPage, peut } from "@/server/guard";
import { getInitials } from "@/lib/utils";
import { imageProfilEleve } from "@/lib/avatar-eleve";
import { libelleStatut } from "@/lib/eleves-constantes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listerAnnees, listerClassesAnnee } from "@/server/domain/parametres";
import { rechercherElevesClasses } from "../eleves-actions";
import { urlImpressionClasses } from "../impression-url";
import { BoutonNotifier } from "../../_components/bouton-notifier";
import { SelecteurClasse } from "./selecteur-classe";

export const metadata: Metadata = { title: "Détails de la classe" };
export const dynamic = "force-dynamic";

type StatutDossier = "VALIDE" | "A_VALIDER" | "INCOMPLET" | "BROUILLON" | "REFUSE";
const STATUTS: { id: StatutDossier; label: string; couleur: string }[] = [
  { id: "VALIDE", label: "Validés", couleur: "bg-emerald-500" },
  { id: "A_VALIDER", label: "À valider", couleur: "bg-blue-500" },
  { id: "INCOMPLET", label: "Incomplets", couleur: "bg-amber-500" },
  { id: "BROUILLON", label: "Brouillons", couleur: "bg-slate-400" },
  { id: "REFUSE", label: "Refusés", couleur: "bg-rose-500" },
];

const lien = "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:text-foreground";
const carte = "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card";

function BadgeDossier({ valeur }: { valeur: string }) {
  const d: Record<string, { nom: string; classe: string }> = {
    VALIDE: { nom: "Validé", classe: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" },
    A_VALIDER: { nom: "À valider", classe: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" },
    INCOMPLET: { nom: "Incomplet", classe: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" },
    BROUILLON: { nom: "Brouillon", classe: "bg-slate-100 text-slate-600 dark:bg-muted dark:text-foreground" },
    REFUSE: { nom: "Refusé", classe: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" },
  };
  const s = d[valeur] ?? { nom: valeur.replaceAll("_", " "), classe: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.classe}`}>
    <span aria-hidden className="size-1.5 rounded-full bg-current opacity-75" />{s.nom}
  </span>;
}

function StatCard({
  titre, valeur, sousTitre, icon: Icon, teinte,
}: {
  titre: string; valeur: string | number; sousTitre: string; icon: typeof Users; teinte: string;
}) {
  return <div className={`${carte} flex min-w-0 items-center gap-3 p-3.5 sm:p-4`}>
    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${teinte}`}>
      <Icon className="size-5" aria-hidden />
    </span>
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-slate-500 dark:text-muted-foreground">{titre}</p>
      <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums tracking-tight">{valeur}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-muted-foreground">{sousTitre}</p>
    </div>
  </div>;
}

/** Données administratives réellement disponibles, sans créer de fausses statistiques. */
export default async function DetailClasse({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ annee?: string; q?: string; page?: string; dossier?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const principal = await exigerPage("classe:lire");
  const annees = await listerAnnees();
  const annee = annees.find(a => a.id === p.annee)
    ?? (p.annee ? null : annees.find(a => a.estCourante));
  if (!annee) notFound();

  const classes = await listerClassesAnnee(annee.id);
  const classe = classes.find(c => c.id === id);
  if (!classe) notFound();

  const [peutVoirEleves, peutNotifier, peutModifier, peutInscrire] = await Promise.all([
    peut(principal, "eleve:lire", { classeId: id }),
    peut(principal, "message:envoyer", { classeId: id }),
    peut(principal, "classe:modifier", { classeId: id }),
    peut(principal, "eleve:inscrire", { classeId: id }),
  ]);
  const recherche = (p.q ?? "").trim().slice(0, 80);
  const dossier = STATUTS.find(s => s.id === p.dossier)?.id;
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(p.page) || 1)));

  const [annuaire, resume] = peutVoirEleves ? await Promise.all([
    rechercherElevesClasses({ anneeId: annee.id, classesIds: [id], recherche, dossier, page }),
    db.execute<{
      filles: number; garcons: number; valides: number; a_valider: number;
      incomplets: number; brouillons: number; refuses: number;
    }>(sql`
      SELECT count(*) FILTER (WHERE e.sexe = 'F')::int AS filles,
        count(*) FILTER (WHERE e.sexe = 'M')::int AS garcons,
        count(*) FILTER (WHERE i.statut_dossier::text = 'VALIDE')::int AS valides,
        count(*) FILTER (WHERE i.statut_dossier::text = 'A_VALIDER')::int AS a_valider,
        count(*) FILTER (WHERE i.statut_dossier::text = 'INCOMPLET')::int AS incomplets,
        count(*) FILTER (WHERE i.statut_dossier::text = 'BROUILLON')::int AS brouillons,
        count(*) FILTER (WHERE i.statut_dossier::text = 'REFUSE')::int AS refuses
      FROM inscriptions i
      JOIN eleves e ON e.id = i.eleve_id
      WHERE i.classe_id = ${id}::uuid AND i.annee_id = ${annee.id}::uuid AND i.active
    `),
  ]) : [null, null];

  const effectif = Number(classe.effectif);
  const capacite = Number(classe.capaciteMax);
  const restant = Math.max(0, capacite - effectif);
  const taux = capacite ? Math.round(effectif / capacite * 100) : 0;
  const femmes = Number(resume?.rows[0]?.filles ?? 0);
  const hommes = Number(resume?.rows[0]?.garcons ?? 0);
  const nonRenseignes = Math.max(0, effectif - femmes - hommes);
  const valides = Number(resume?.rows[0]?.valides ?? 0);
  const aValider = Number(resume?.rows[0]?.a_valider ?? 0);
  const incomplets = Number(resume?.rows[0]?.incomplets ?? 0);
  const brouillons = Number(resume?.rows[0]?.brouillons ?? 0);
  const refuses = Number(resume?.rows[0]?.refuses ?? 0);
  const decompte: Record<StatutDossier, number> = {
    VALIDE: valides, A_VALIDER: aValider, INCOMPLET: incomplets,
    BROUILLON: brouillons, REFUSE: refuses,
  };
  const pages = Math.max(1, Math.ceil((annuaire?.total ?? 0) / 25));
  const indexClasse = classes.findIndex(c => c.id === id);
  const anneeCouranteModifiable = annee.estCourante && !annee.estCloturee;

  function hrefFiltres(modifs: { dossier?: string | null; recherche?: string; page?: number } = {}) {
    const q = new URLSearchParams({ annee: annee!.id });
    const valeurRecherche = modifs.recherche ?? recherche;
    const valeurDossier = modifs.dossier === undefined ? dossier : modifs.dossier;
    if (valeurRecherche) q.set("q", valeurRecherche);
    if (valeurDossier) q.set("dossier", valeurDossier);
    if (modifs.page && modifs.page > 1) q.set("page", String(modifs.page));
    return `/dashboard/classes/${id}?${q.toString()}`;
  }

  return <main className="mx-auto w-full max-w-[1600px] space-y-4 pb-8 text-slate-950 dark:text-foreground">
    <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
      <Link href="/dashboard/default" className="hover:text-blue-600">Tableau de bord</Link>
      <ChevronRight className="size-3.5" aria-hidden />
      <Link href={`/dashboard/classes?annee=${annee.id}`} className="hover:text-blue-600">Classes</Link>
      <ChevronRight className="size-3.5" aria-hidden />
      <strong className="text-slate-800 dark:text-foreground">{classe.libelle}</strong>
    </nav>

    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-border">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <GraduationCap className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[29px]">Classe {classe.libelle}</h1>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${classe.active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-muted"}`}>
              {classe.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">{classe.niveauLibelle}{classe.serieCode ? " · Série " + classe.serieCode : ""} · Année scolaire {annee.libelle} · Code {classe.code}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SelecteurClasse anneeId={annee.id} active={id} classes={classes.map(c => ({ id: c.id, libelle: c.libelle }))} />
        {peutVoirEleves && <a className={lien} href={urlImpressionClasses(annee.id, [id])} target="_blank" rel="noopener noreferrer">
          <Printer className="size-4" aria-hidden /> Imprimer
        </a>}
        {peutModifier && anneeCouranteModifiable && <Link className={lien} href={`/dashboard/classes?annee=${annee.id}&modifier=${id}`}>
          <Pencil className="size-4" aria-hidden /> Modifier
        </Link>}
        {peutNotifier && (classe.active && effectif > 0 ?
          <BoutonNotifier contexteClasses cible={{ type: "classe", id, nom: classe.libelle }} libelle="Prévenir les parents" /> :
          <button type="button" disabled aria-disabled="true" className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400 dark:border-border dark:bg-muted">
            <BellRing className="size-4" aria-hidden /> Aucun parent à prévenir
          </button>)}
      </div>
    </header>

    <section aria-label="Indicateurs de la classe" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard titre="Élèves inscrits" valeur={effectif} sousTitre="Effectif de la classe" icon={Users} teinte="bg-blue-50 text-blue-600 dark:bg-blue-950/30" />
      <StatCard titre="Places disponibles" valeur={restant} sousTitre={`Sur ${capacite} places`} icon={School} teinte="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" />
      <StatCard titre="Remplissage" valeur={taux + " %"} sousTitre={taux >= 100 ? "Capacité atteinte" : "Taux d'occupation"} icon={GraduationCap} teinte="bg-violet-50 text-violet-600 dark:bg-violet-950/30" />
      {peutVoirEleves ?
        <StatCard titre="Dossiers à traiter" valeur={aValider + incomplets + brouillons} sousTitre="À valider, incomplets ou brouillons" icon={ClipboardCheck} teinte="bg-amber-50 text-amber-600 dark:bg-amber-950/30" /> :
        <StatCard titre="Année scolaire" valeur={annee.libelle} sousTitre="Période sélectionnée" icon={CalendarDays} teinte="bg-slate-100 text-slate-600 dark:bg-muted" />}
    </section>

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(310px,.8fr)]">
      <section id="eleves" className={`${carte} min-w-0 overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-border">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold"><Users className="size-4 text-blue-600" aria-hidden /> Élèves de la classe</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">Liste des inscriptions actives · Recherche et suivi des dossiers</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              {annuaire ? annuaire.total : effectif} résultat(s)
            </span>
            {peutVoirEleves && <Link className={lien} href={`/dashboard/eleves?annee=${annee.id}&classe=${id}`}>
              <ArrowRight className="size-3.5" aria-hidden /> Gestion des élèves
            </Link>}
          </div>
        </div>

        {!peutVoirEleves ? <div className="flex items-center gap-3 p-6 text-sm text-slate-500">
          <ShieldCheck className="size-5 shrink-0" aria-hidden /> Votre compte ne dispose pas des droits de consultation des dossiers individuels.
        </div> : <>
          <div className="space-y-3 border-b border-slate-100 px-4 py-3 dark:border-border">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="annee" value={annee.id} />
              {dossier && <input type="hidden" name="dossier" value={dossier} />}
              <div className="relative min-w-[170px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input type="search" name="q" defaultValue={recherche} placeholder="Rechercher un élève, un matricule…" aria-label="Rechercher les élèves de la classe"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-border dark:bg-muted/20" />
              </div>
              <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">
                <Search className="size-3.5" aria-hidden /> Rechercher
              </button>
              {(recherche || dossier) && <Link href={hrefFiltres({ dossier: null, recherche: "" })} className={lien}>Réinitialiser</Link>}
            </form>
            <div className="flex flex-wrap items-center gap-2" aria-label="Filtrer les dossiers">
              <Link href={hrefFiltres({ dossier: null })} aria-current={!dossier ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${!dossier ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-muted/30 dark:text-foreground"}`}>
                Tous ({effectif})
              </Link>
              {STATUTS.map(item => <Link key={item.id} href={hrefFiltres({ dossier: item.id })}
                aria-current={dossier === item.id ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${dossier === item.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-muted/30 dark:text-foreground"}`}>
                <span className={`size-2 rounded-full ${item.couleur}`} aria-hidden />{item.label} ({decompte[item.id]})
              </Link>)}
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold text-slate-500 dark:border-border dark:bg-muted/30">
                <tr>
                  <th scope="col" className="px-4 py-3">Élève</th>
                  <th scope="col" className="px-3 py-3">Matricule</th>
                  <th scope="col" className="px-3 py-3">Sexe</th>
                  <th scope="col" className="px-3 py-3">Dossier</th>
                  <th scope="col" className="px-3 py-3">Statut scolaire</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-border">
                {annuaire?.lignes.map(e => <tr key={e.id} className="transition-colors hover:bg-blue-50/40 dark:hover:bg-muted/20">
                  <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar className="size-9 border border-slate-100 dark:border-border">
                        <AvatarImage src={imageProfilEleve({ id: e.id, sexe: e.sexe, photoUrl: e.photoUrl })} alt="" />
                        <AvatarFallback>{getInitials(`${e.prenom} ${e.nom}`)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate">{e.prenom} {e.nom}</span>
                    </div>
                  </th>
                  <td className="px-3 py-2.5 font-medium tabular-nums text-slate-600 dark:text-muted-foreground">{e.matricule}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-muted-foreground">{e.sexe === "F" ? "Fille" : e.sexe === "M" ? "Garçon" : "—"}</td>
                  <td className="px-3 py-2.5"><BadgeDossier valeur={e.dossier} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-muted-foreground">{libelleStatut(e.statut)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/dashboard/eleves/${e.id}`} title={"Ouvrir le dossier de " + e.prenom + " " + e.nom}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-border dark:text-foreground">
                      <Eye className="size-3.5" aria-hidden /> Voir
                    </Link>
                  </td>
                </tr>)}
                {annuaire?.lignes.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <Users className="size-8 text-slate-300" aria-hidden />
                    <strong className="text-sm">Aucun élève trouvé</strong>
                    <p className="text-xs text-slate-500">Essayez un autre filtre ou une recherche différente.</p>
                    {(recherche || dossier) && <Link href={hrefFiltres({ dossier: null, recherche: "" })} className="mt-1 text-xs font-semibold text-blue-700 hover:underline">Afficher tous les élèves</Link>}
                  </div>
                </td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-border">
            <p className="text-xs text-slate-500 dark:text-muted-foreground">
              {annuaire?.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, annuaire.total)} sur ${annuaire.total}` : "0 résultat"} · Page {page} sur {pages}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? <Link className={lien} href={hrefFiltres({ page: page - 1 })}><ChevronLeft className="size-4" aria-hidden /> Précédent</Link> :
                <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 px-3 text-xs text-slate-400">Précédent</span>}
              {page < pages ? <Link className={lien} href={hrefFiltres({ page: page + 1 })}>Suivant <ChevronRight className="size-4" aria-hidden /></Link> :
                <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 px-3 text-xs text-slate-400">Suivant</span>}
            </div>
          </footer>
        </>}
      </section>

      <aside id="informations" className="min-w-0 space-y-4">
        <section className={`${carte} overflow-hidden`}>
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-border">
            <Info className="size-4 text-blue-600" aria-hidden />
            <h2 className="text-sm font-bold">Fiche de la classe</h2>
          </div>
          <dl className="space-y-0 px-4">
            {[
              ["Année scolaire", annee.libelle],
              ["Niveau", classe.niveauLibelle],
              ["Série", classe.serieCode || "Non applicable"],
              ["Code", classe.code],
              ["État", classe.active ? "Active" : "Inactive"],
              ["Capacité maximale", String(capacite) + " élèves"],
            ].map(([k,v]) => <div key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-3 text-xs last:border-b-0 dark:border-border">
              <dt className="text-slate-500 dark:text-muted-foreground">{k}</dt>
              <dd className="font-semibold text-slate-800 dark:text-foreground">{v}</dd>
            </div>)}
          </dl>
        </section>

        <section className={`${carte} p-4`}>
          <h2 className="flex items-center gap-2 text-sm font-bold"><GraduationCap className="size-4 text-blue-600" aria-hidden /> Occupation de la classe</h2>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold tabular-nums">{effectif} <span className="text-sm font-medium text-slate-500">/ {capacite}</span></span>
            <span className={`text-xs font-bold ${taux >= 100 ? "text-rose-600" : taux >= 90 ? "text-amber-600" : "text-emerald-700"}`}>{taux}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, taux)} aria-label="Taux de remplissage">
            <div className={`h-full rounded-full ${taux >= 100 ? "bg-rose-500" : taux >= 90 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: Math.min(100, taux) + "%" }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{restant ? `${restant} place(s) encore disponibles` : "Aucune place disponible"}</p>
        </section>

        {peutVoirEleves && <section className={`${carte} p-4`}>
          <h2 className="flex items-center gap-2 text-sm font-bold"><Users className="size-4 text-blue-600" aria-hidden /> Répartition des élèves</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/25">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Filles</span><p className="mt-1 text-xl font-bold tabular-nums">{femmes}</p>
            </div>
            <div className="rounded-lg bg-violet-50 p-3 dark:bg-violet-950/25">
              <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Garçons</span><p className="mt-1 text-xl font-bold tabular-nums">{hommes}</p>
            </div>
          </div>
          {nonRenseignes > 0 && <p className="mt-2 text-xs text-slate-500">{nonRenseignes} inscription(s) sans sexe renseigné.</p>}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
            <div className="flex h-full">
              {effectif > 0 && <><span className="bg-blue-600" style={{ width: 100 * femmes / effectif + "%" }} /><span className="bg-violet-500" style={{ width: 100 * hommes / effectif + "%" }} /></>}
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ClipboardCheck className="size-3.5 text-emerald-600" aria-hidden /> {valides} dossier(s) validé(s) sur {effectif} inscrits</p>
          {refuses > 0 && <p className="mt-1 text-xs text-rose-600">{refuses} dossier(s) refusé(s)</p>}
        </section>}

        <section className={`${carte} p-4`}>
          <h2 className="flex items-center gap-2 text-sm font-bold"><BookOpen className="size-4 text-blue-600" aria-hidden /> Accès rapides</h2>
          <div className="mt-3 grid gap-2">
            {peutVoirEleves && <a href={urlImpressionClasses(annee.id, [id])} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-blue-50 dark:border-border">
              <span className="flex items-center gap-2"><Printer className="size-4 text-blue-600" aria-hidden /> Liste officielle des élèves</span><ArrowRight className="size-4 text-slate-400" aria-hidden />
            </a>}
            {peutVoirEleves && <Link href={`/dashboard/eleves?annee=${annee.id}&classe=${id}`} className="flex min-h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-blue-50 dark:border-border">
              <span className="flex items-center gap-2"><FileText className="size-4 text-blue-600" aria-hidden /> Gestion des dossiers élèves</span><ArrowRight className="size-4 text-slate-400" aria-hidden />
            </Link>}
            {peutInscrire && anneeCouranteModifiable && <Link href={`/dashboard/eleves?inscription=1`} className="flex min-h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-blue-50 dark:border-border">
              <span className="flex items-center gap-2"><UserRoundCheck className="size-4 text-blue-600" aria-hidden /> Inscrire un élève</span><ArrowRight className="size-4 text-slate-400" aria-hidden />
            </Link>}
            <Link href={`/dashboard/classes?annee=${annee.id}`} className="flex min-h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-blue-50 dark:border-border">
              <span className="flex items-center gap-2"><ArrowLeft className="size-4 text-blue-600" aria-hidden /> Toutes les classes</span><ArrowRight className="size-4 text-slate-400" aria-hidden />
            </Link>
          </div>
        </section>
      </aside>
    </div>
  </main>;
}
