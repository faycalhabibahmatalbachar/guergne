"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, Eye, KeyRound,
  Search, Send, ShieldOff, Smartphone, Users, UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { LigneTuteur, StatistiquesParents } from "@/server/domain/parents";
import { inviterClasse, inviterTuteur, revoquerAcces } from "../actions";

interface Option { id: string; libelle: string }

const dateFr = (valeur: string | null) =>
  valeur ? new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function CarteStatistique({
  titre, valeur, icone: Icone, couleur, fond, detail,
}: {
  titre: string; valeur: number; icone: typeof Users; couleur: string; fond: string; detail: string;
}) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-4 shadow-sm dark:border-border dark:bg-card">
    <div className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${fond}`}>
      <Icone className={`size-7 ${couleur}`} strokeWidth={1.8} aria-hidden />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[12px] font-medium text-slate-600 dark:text-muted-foreground">{titre}</p>
      <p className="mt-1 text-[27px] font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-foreground">{valeur.toLocaleString("fr-FR")}</p>
      <p className="mt-1.5 text-[11px] text-slate-400">{detail}</p>
    </div>
  </article>;
}

function EtatCompte({ t }: { t: LigneTuteur }) {
  const classBase = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium";
  if (t.compteActif === false) return <span className={classBase + " bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}><span className="size-2 rounded-full bg-red-500" />Révoqué</span>;
  if (!t.utilisateurId) return <span className={classBase + " bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"}><span className="size-2 rounded-full bg-slate-400" />Sans compte</span>;
  if (!t.derniereConnexion) return <span className={classBase + " bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}><span className="size-2 rounded-full bg-blue-500" />Invité</span>;
  return <span className={classBase + " bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}><span className="size-2 rounded-full bg-emerald-500" />Actif</span>;
}

export function Parents({
  tuteurs, total, page, parPage, classes, stats, filtres,
}: {
  tuteurs: LigneTuteur[];
  total: number;
  page: number;
  parPage: number;
  classes: Option[];
  stats: StatistiquesParents;
  filtres: { recherche: string; etat: string; classeId: string };
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [recherche, setRecherche] = useState(filtres.recherche);

  const naviguer = (params: Record<string, string>) => {
    const url = new URLSearchParams({
      recherche: filtres.recherche, etat: filtres.etat,
      classe: filtres.classeId, ...params,
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
    { titre: "Application installée", valeur: stats.avecAppareil, icone: Smartphone, couleur: "text-teal-600", fond: "bg-teal-50", detail: "Avec appareil actif" },
  ];

  const inviter = (t: LigneTuteur) => demarrer(async () => {
    const r = await inviterTuteur(t.id);
    if (r.ok) toast.success(r.message ?? "Invitation envoyée.", {
      duration: 12000,
      description: r.code ? `Code : ${r.code} — valable 7 jours, à communiquer au tuteur.` : undefined,
    });
    else toast.error(r.message ?? "Échec de l'invitation.");
    routeur.refresh();
  });

  const revoquer = (t: LigneTuteur) => {
    const motif = window.prompt(
      `Révoquer l'accès de ${t.prenom} ${t.nom} ?\n\nSes sessions seront fermées immédiatement.\n\nMotif :`,
    );
    if (!motif?.trim()) return;
    demarrer(async () => {
      const r = await revoquerAcces(t.id, motif.trim());
      toast[r.ok ? "success" : "error"](r.message ?? "Échec.");
      routeur.refresh();
    });
  };

  return <div className="space-y-4">
    <section aria-label="Indicateurs des comptes parents" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cartes.map(c => <CarteStatistique key={c.titre} {...c} />)}
    </section>

    {stats.sansCompte > 0 ? (
      <details className="group rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-[#17264c] marker:hidden dark:text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Send className="size-4 text-emerald-700" aria-hidden />Invitation des responsables par classe
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{stats.sansCompte} sans compte</span>
          </span>
          <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-border">
          <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">
            L'invitation par classe concerne les tuteurs principaux. Le second responsable peut être invité individuellement. Les envois SMS peuvent entraîner des frais.
          </p>
          <NativeSelect
            id="classe-masse" defaultValue=""
            className="h-10 w-full max-w-72 rounded-lg border-slate-200 bg-white"
            aria-label="Sélectionner la classe à inviter" disabled={enCours}
            onChange={e => {
              const classeId = e.target.value;
              if (!classeId) return;
              const libelle = classes.find(c => c.id === classeId)?.libelle ?? "";
              const approuve = window.confirm(
                `Ouvrir l'accès aux tuteurs principaux de ${libelle} ?\n\nUn SMS contenant un code d'activation peut partir vers chaque famille.`,
              );
              e.target.value = "";
              if (!approuve) return;
              demarrer(async () => {
                const r = await inviterClasse(classeId);
                toast[r.ok ? "success" : "error"](r.message ?? "Échec.");
                routeur.refresh();
              });
            }}
          >
            <option value="">Inviter toute une classe…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </NativeSelect>
        </div>
      </details>
    ) : null}

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
        <option value="sans_compte">Sans compte</option><option value="invite">Invité, jamais connecté</option><option value="actif">Compte actif</option>
      </NativeSelect>
      <NativeSelect value={filtres.classeId} onChange={e => naviguer({ classe: e.target.value, page: "" })}
        className="h-10 w-full rounded-lg border-slate-200 bg-white sm:w-48" aria-label="Filtrer par classe">
        <option value="">Toutes les classes</option>
        {classes.map(c => <option value={c.id} key={c.id}>{c.libelle}</option>)}
      </NativeSelect>
      <Button asChild variant="outline" className="h-10 gap-2 border-slate-200 bg-white shadow-none dark:bg-card">
        <a href="/api/export/parents" title="Exporter tous les parents, indépendamment des filtres"><Download className="size-4" aria-hidden />Exporter Excel</a>
      </Button>
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
              const sansCompte = !t.utilisateurId;
              const jamaisConnecte = !sansCompte && !t.derniereConnexion;
              const desactive = t.compteActif === false;
              return <tr key={t.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-emerald-50/40 dark:border-border dark:hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700 dark:bg-sky-950">
                      {(t.prenom[0] ?? "") + (t.nom[0] ?? "")}
                    </span>
                    <div className="min-w-0">
                      <Link href={`/dashboard/parents/${t.id}`} className="block max-w-[225px] truncate font-semibold text-slate-950 hover:text-emerald-700 hover:underline dark:text-foreground" title={t.prenom + " " + t.nom}>{t.prenom} {t.nom}</Link>
                      <span className="block text-[11px] text-slate-500">{t.profession || "Profession non renseignée"}</span>
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
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button asChild variant="outline" size="icon" className="size-8 rounded-lg border-slate-200 shadow-none" title="Voir le compte parent">
                      <Link href={`/dashboard/parents/${t.id}`} aria-label={`Consulter la fiche de ${t.prenom} ${t.nom}`}><Eye className="size-4" aria-hidden /></Link>
                    </Button>
                    {sansCompte || jamaisConnecte || desactive ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-slate-200 px-2.5 text-xs shadow-none" disabled={enCours} onClick={() => inviter(t)}>
                        <Send className="size-3.5" aria-hidden />{sansCompte ? "Inviter" : "Renvoyer"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-slate-200 px-2.5 text-xs text-red-700 shadow-none hover:text-red-800" disabled={enCours} onClick={() => revoquer(t)}>
                        <ShieldOff className="size-3.5" aria-hidden />Révoquer
                      </Button>
                    )}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-600 dark:border-border dark:bg-card dark:text-muted-foreground">
        <p className="tabular-nums">{premier.toLocaleString("fr-FR")}–{dernier.toLocaleString("fr-FR")} sur {total.toLocaleString("fr-FR")} parents</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg shadow-none" disabled={page <= 1 || enCours} onClick={() => naviguer({ page: String(page - 1) })}><ChevronLeft className="size-4" aria-hidden />Précédent</Button>
          <span className="min-w-12 text-center font-medium tabular-nums">{page}/{nbPages}</span>
          <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg shadow-none" disabled={page >= nbPages || enCours} onClick={() => naviguer({ page: String(page + 1) })}>Suivant<ChevronRight className="size-4" aria-hidden /></Button>
        </div>
      </footer>
    </section>
  </div>;
}
