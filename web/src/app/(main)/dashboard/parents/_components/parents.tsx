"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, KeyRound,
  Search, Send, Smartphone, Users, UserRoundCheck, AlertTriangle, ShieldOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { LigneTuteur, StatistiquesParents } from "@/server/domain/parents";
import { InvitationClasse } from "./invitation-classe";
import statistiquesStyles from "./statistiques-parents.module.css";
import { ActionsParent } from "./actions-parent";
import { NotificationParent } from "./notification-parent";
import { etatCompteParent } from "@/lib/etat-compte-parent";

interface Option { id: string; libelle: string }

const dateFr = (valeur: string | null) =>
  valeur ? new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function CarteStatistique({
  titre, valeur, icone: Icone, couleur, fond, detail,
}: {
  titre: string; valeur: number; icone: typeof Users; couleur: string; fond: string; detail: string;
}) {
  return <article className={statistiquesStyles.card + " flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card"}>
    <div className="flex min-w-0 items-start justify-between gap-2">
      <h2 className="min-w-0 pt-0.5 text-[12px] font-semibold leading-snug text-slate-600 dark:text-muted-foreground">{titre}</h2>
      <span className={`flex size-[40px] shrink-0 items-center justify-center rounded-xl ${fond}`}>
        <Icone className={`size-[22px] ${couleur}`} strokeWidth={1.9} aria-hidden />
      </span>
    </div>
    <p className="mt-0.5 text-[32px] font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-foreground">{valeur.toLocaleString("fr-FR")}</p>
    <p className="mt-auto border-t border-slate-100 pt-2.5 text-[11px] leading-snug text-slate-500 dark:border-border dark:text-muted-foreground">{detail}</p>
  </article>;
}

function EtatCompte({ t }: { t: LigneTuteur }) {
  const classe = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium";
  switch (etatCompteParent(t)) {
    case "sans_compte": return <span className={classe + " bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"}><span className="size-2 rounded-full bg-slate-400" />Sans compte</span>;
    case "revoque": return <span className={classe + " bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}><span className="size-2 rounded-full bg-red-500" />Révoqué</span>;
    case "invite": return <span className={classe + " bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}><span className="size-2 rounded-full bg-blue-500" />Invité</span>;
    case "actif": return <span className={classe + " bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}><span className="size-2 rounded-full bg-emerald-500" />Actif</span>;
  }
}

export function Parents({
  tuteurs, total, page, parPage, classes, stats, filtres, peutInviter, peutNotifier,
}: {
  tuteurs: LigneTuteur[];
  total: number;
  page: number;
  parPage: number;
  classes: Option[];
  stats: StatistiquesParents;
  peutInviter: boolean;
  peutNotifier: boolean;
  filtres: { recherche: string; etat: string; classeId: string };
}) {
  const routeur = useRouter();
  const [recherche, setRecherche] = useState(filtres.recherche);
  const [destinataire, setDestinataire] = useState<LigneTuteur | null>(null);

  const naviguer = (params: Record<string, string>) => {
    const url = new URLSearchParams({
      recherche: filtres.recherche, etat: filtres.etat,
      classe: filtres.classeId, parPage: String(parPage), ...params,
    });
    for (const [cle, valeur] of [...url.entries()]) if (!valeur) url.delete(cle);
    routeur.push(`/dashboard/parents?${url}`);
  };

  const nbPages = Math.max(1, Math.ceil(total / parPage));
  const premier = total ? (page - 1) * parPage + 1 : 0;
  const dernier = Math.min(page * parPage, total);

  const cartes = [
    { titre: "Tuteurs enregistrés", valeur: stats.total, icone: Users, couleur: "text-emerald-600", fond: "bg-emerald-50", detail: "Responsables recensés" },
    { titre: "Comptes actifs", valeur: stats.actifs, icone: UserRoundCheck, couleur: "text-blue-600", fond: "bg-blue-50", detail: "Au moins une connexion" },
    { titre: "Sans compte", valeur: stats.sansCompte, icone: KeyRound, couleur: "text-amber-600", fond: "bg-amber-50", detail: "Accès non créé" },
    { titre: "Invitations en attente", valeur: stats.invites, icone: Send, couleur: "text-violet-600", fond: "bg-violet-50", detail: "Jamais connectés" },
    { titre: "Appareil actif", valeur: stats.avecAppareil, icone: Smartphone, couleur: "text-teal-600", fond: "bg-teal-50", detail: "Compte actif avec appareil" },
  ];

  const pages = [...new Set([1, Math.max(1, page - 1), page, Math.min(nbPages, page + 1), nbPages])]
    .filter(n => n >= 1 && n <= nbPages);
  const naviguerPage = (numero: number, taille = parPage) => {
    if (numero < 1 || numero > (taille === parPage ? nbPages : Math.max(1, Math.ceil(total / taille)))) return;
    naviguer({ page: String(numero), parPage: String(taille) });
  };

  return <div className="space-y-4">
    {peutNotifier && <NotificationParent parent={destinataire} onFermer={() => setDestinataire(null)} />}
    <section aria-label="Indicateurs des comptes parents" className={statistiquesStyles.region}>
      <div className={statistiquesStyles.grid}>
        {cartes.map(c => <CarteStatistique key={c.titre} {...c} />)}
      </div>
    </section>

    {(stats.doublons > 0 || stats.revoques > 0) ? <section aria-label="Contrôles de qualité des comptes parents" className="flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/65 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
      <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
      <span className="mr-1 text-xs font-semibold text-amber-950 dark:text-amber-100">Comptes à contrôler :</span>
      {stats.doublons > 0 ? <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg border-amber-200 bg-white text-amber-900 dark:border-amber-800 dark:bg-card dark:text-amber-200"
        onClick={() => naviguer({ etat: "doublon", page: "" })}>
        {stats.doublons.toLocaleString("fr-FR")} fiche(s) partageant un numéro
      </Button> : null}
      {stats.revoques > 0 ? <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-red-200 bg-white text-red-700 dark:border-red-900 dark:bg-card dark:text-red-300"
        onClick={() => naviguer({ etat: "revoque", page: "" })}>
        <ShieldOff className="size-3.5" aria-hidden />{stats.revoques.toLocaleString("fr-FR")} compte(s) révoqué(s)
      </Button> : null}
      <span className="text-[11px] text-amber-800 dark:text-amber-200">Ces fiches ne sont pas fusionnées automatiquement.</span>
    </section> : null}

    {peutInviter && stats.sansCompte > 0 ? <InvitationClasse classes={classes} sansCompte={stats.sansCompte} /> : null}

    <section aria-label="Filtres des tuteurs" className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-border dark:bg-card">
      <form className="relative min-w-[220px] flex-1" onSubmit={e => {
        e.preventDefault(); naviguer({ recherche, page: "" });
      }}>
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input className="h-10 border-slate-200 pl-9 shadow-none dark:border-border" value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Nom, prénom, téléphone…" aria-label="Rechercher un parent" />
      </form>
      <NativeSelect value={filtres.etat} onChange={e => naviguer({ etat: e.target.value, page: "" })}
        className="h-10 w-full rounded-lg border-slate-200 bg-white sm:w-48" aria-label="Filtrer par état du compte">
        <option value="">Tous les états</option>
        <option value="sans_compte">Sans compte</option><option value="invite">Invité, jamais connecté</option><option value="actif">Compte actif</option><option value="revoque">Compte révoqué</option><option value="doublon">Numéro partagé / à vérifier</option>
      </NativeSelect>
      <NativeSelect value={filtres.classeId} onChange={e => naviguer({ classe: e.target.value, page: "" })}
        className="h-10 w-full rounded-lg border-slate-200 bg-white sm:w-48" aria-label="Filtrer par classe">
        <option value="">Toutes les classes</option>
        {classes.map(c => <option value={c.id} key={c.id}>{c.libelle}</option>)}
      </NativeSelect>

    </section>

    <section aria-label="Liste des comptes parents" className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
      {tuteurs.length === 0 ? <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Users className="size-9 text-slate-400" aria-hidden />
        <p className="text-sm font-semibold">Aucun tuteur ne correspond à cette recherche.</p>
        <Button size="sm" variant="outline" onClick={() => { setRecherche(""); naviguer({ recherche: "", etat: "", classe: "", page: "" }); }}>Réinitialiser les filtres</Button>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1030px] border-collapse text-left text-[13px]">
          <thead className="bg-slate-50/90 text-xs text-slate-500 dark:bg-muted/30 dark:text-muted-foreground">
            <tr className="border-b border-slate-200 dark:border-border">
              <th scope="col" className="px-4 py-3 font-medium">Parent / Tuteur</th>
              <th scope="col" className="px-4 py-3 font-medium">Téléphone</th>
              <th scope="col" className="px-4 py-3 font-medium">Enfants</th>
              <th scope="col" className="px-4 py-3 font-medium">Accès</th>
              <th scope="col" className="px-4 py-3 font-medium">Dernière connexion</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tuteurs.map(t => {
              return <tr key={t.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-emerald-50/40 dark:border-border dark:hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700 dark:bg-sky-950">
                      {(t.prenom[0] ?? "") + (t.nom[0] ?? "")}
                    </span>
                    <div className="min-w-0">
                      <Link href={`/dashboard/parents/${t.id}`} className="block max-w-[225px] truncate font-semibold text-slate-950 hover:text-emerald-700 hover:underline dark:text-foreground" title={t.prenom + " " + t.nom}>{t.prenom} {t.nom}</Link>
                      <span className="block text-[11px] text-slate-500">{t.profession || "Profession non renseignée"}</span>
                      {t.doublonTelephone ? <span title="Au moins une autre fiche porte le même numéro. Vérification humaine requise." className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><AlertTriangle className="size-3" aria-hidden />Numéro partagé</span> : null}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                  <a href={`tel:${t.telephone.replace(/[^+0-9]/g,"")}`} className="text-slate-700 hover:underline dark:text-foreground">{t.telephone}</a>
                  {!t.accepteSms ? <span className="block text-[11px] text-amber-700">SMS refusé</span> : null}
                </td>
                <td className="max-w-[275px] px-4 py-3">
                  <span className="font-medium tabular-nums">{t.nbEnfants} enfant{t.nbEnfants > 1 ? "s" : ""}</span>
                  <span className="block max-w-[270px] truncate text-[11px] text-slate-500" title={t.enfants}>{t.enfants || "Aucun enfant rattaché"}</span>
                </td>
                <td className="px-4 py-3"><EtatCompte t={t} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 tabular-nums dark:text-muted-foreground">{dateFr(t.derniereConnexion)}</td>
                <td className="px-4 py-3"><ActionsParent t={t} peutInviter={peutInviter} peutNotifier={peutNotifier} onNotifier={setDestinataire} /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}

      <footer aria-label="Pied du tableau des parents" className="border-t border-slate-200/80 bg-slate-50/60 px-4 py-3.5 text-sm dark:border-border dark:bg-muted/15 sm:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="whitespace-nowrap text-slate-600 dark:text-muted-foreground" aria-live="polite">
              <span className="font-semibold text-slate-900 tabular-nums dark:text-foreground">{premier}–{dernier}</span> sur <span className="font-semibold text-slate-900 tabular-nums dark:text-foreground">{total.toLocaleString("fr-FR")}</span> parents
            </p>
            <span aria-hidden className="hidden h-5 w-px bg-slate-200 dark:bg-border sm:block" />
            <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-600 dark:text-muted-foreground">
              Par page
              <select aria-label="Nombre de parents par page" className="h-9 min-w-16 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-border dark:bg-background dark:text-foreground"
                value={parPage} onChange={e => naviguerPage(1, Number(e.target.value))}>
                {[8, 16, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <nav aria-label="Pagination des parents" className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-xs font-medium text-slate-600 tabular-nums dark:text-muted-foreground sm:hidden">Page {page} sur {nbPages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="hidden size-9 bg-white shadow-none sm:inline-flex dark:bg-card" disabled={page <= 1} onClick={() => naviguerPage(1)} aria-label="Première page"><ChevronsLeft className="size-4" aria-hidden /></Button>
              <Button variant="outline" size="icon" className="size-9 bg-white shadow-none dark:bg-card" disabled={page <= 1} onClick={() => naviguerPage(page - 1)} aria-label="Page précédente"><ChevronLeft className="size-4" aria-hidden /></Button>
              <div className="hidden items-center gap-1 sm:flex">
                {pages.map((numero, index) => <span key={numero} className="flex items-center gap-1">
                  {index > 0 && numero - pages[index - 1] > 1 ? <span className="px-1 text-slate-400" aria-hidden>…</span> : null}
                  <Button size="icon" variant={numero === page ? "default" : "outline"}
                    className={`size-9 font-semibold tabular-nums shadow-none ${numero === page ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-white dark:bg-card"}`}
                    aria-label={`Aller à la page ${numero}`} aria-current={numero === page ? "page" : undefined}
                    onClick={() => naviguerPage(numero)}>{numero}</Button>
                </span>)}
              </div>
              <Button variant="outline" size="icon" className="size-9 bg-white shadow-none dark:bg-card" disabled={page >= nbPages} onClick={() => naviguerPage(page + 1)} aria-label="Page suivante"><ChevronRight className="size-4" aria-hidden /></Button>
              <Button variant="outline" size="icon" className="hidden size-9 bg-white shadow-none sm:inline-flex dark:bg-card" disabled={page >= nbPages} onClick={() => naviguerPage(nbPages)} aria-label="Dernière page"><ChevronsRight className="size-4" aria-hidden /></Button>
            </div>
          </nav>
        </div>
      </footer>
    </section>
  </div>;
}
