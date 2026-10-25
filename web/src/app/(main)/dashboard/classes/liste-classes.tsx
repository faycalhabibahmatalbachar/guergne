"use client";

import Link from "next/link";
import { BarChart3, BellRing, Eye, GraduationCap, Pencil, Printer, Users } from "lucide-react";
import type { LigneClasseParametre } from "@/server/domain/parametres";
import { BoutonNotifier } from "../_components/bouton-notifier";
import { urlImpressionClasses } from "./impression-url";

type Props = {
  classes: LigneClasseParametre[];
  toutesClasses?: LigneClasseParametre[];
  peutModifier: boolean;
  peutNotifier: boolean;
  peutImprimer: boolean;
  anneeId: string;
  ouvrir: (classe: LigneClasseParametre) => void;
  selection: string[];
  basculerSelection: (id: string) => void;
  ouvrirEleves: (ids: string[]) => void;
};

const COULEURS = [
  { fond: "bg-blue-50 dark:bg-blue-500/15", texte: "text-blue-700 dark:text-blue-300", barre: "bg-blue-600" },
  { fond: "bg-emerald-50 dark:bg-emerald-500/15", texte: "text-emerald-700 dark:text-emerald-300", barre: "bg-emerald-500" },
  { fond: "bg-violet-50 dark:bg-violet-500/15", texte: "text-violet-700 dark:text-violet-300", barre: "bg-violet-500" },
  { fond: "bg-rose-50 dark:bg-rose-500/15", texte: "text-rose-700 dark:text-rose-300", barre: "bg-rose-500" },
  { fond: "bg-amber-50 dark:bg-amber-500/15", texte: "text-amber-700 dark:text-amber-300", barre: "bg-amber-500" },
] as const;

function TauxOccupation({ classe, index }: { classe: LigneClasseParametre; index: number }) {
  const effectif = Number(classe.effectif);
  const capacite = Number(classe.capaciteMax);
  const taux = capacite > 0 ? Math.round((effectif / capacite) * 100) : 0;
  const largeur = Math.max(0, Math.min(100, taux));
  const couleur = COULEURS[index % COULEURS.length];
  return (
    <div className="min-w-[112px] max-w-40">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{capacite > 0 ? taux + "%" : "—"}</span>
        {capacite > 0 && taux >= 100 && <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Complet</span>}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
        role="progressbar"
        aria-label={"Remplissage de " + classe.libelle}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={largeur}
      >
        <div className={"h-full rounded-full " + couleur.barre} style={{ width: largeur + "%" }} />
      </div>
    </div>
  );
}

function Statut({ actif }: { actif: boolean }) {
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " + (
      actif
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    )}>
      <span aria-hidden className={"size-1.5 rounded-full " + (actif ? "bg-emerald-500" : "bg-slate-400")} />
      {actif ? "Active" : "Inactive"}
    </span>
  );
}

function Actions({ classe, peutModifier, peutNotifier, peutImprimer, anneeId, ouvrir, ouvrirEleves, compact = false }: {
  classe: LigneClasseParametre;
  peutModifier: boolean;
  peutNotifier: boolean;
  peutImprimer: boolean;
  anneeId: string;
  ouvrir: (classe: LigneClasseParametre) => void;
  ouvrirEleves: (ids: string[]) => void;
  compact?: boolean;
}) {
  const classesBouton = "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
  return (
    <div className={"classes-list-actions flex items-center gap-2 " + (compact ? "flex-wrap" : "justify-end")}>
      <Link href={`/dashboard/classes/${classe.id}?annee=${anneeId}`} className={classesBouton} title="Ouvrir les détails de la classe">
        <Eye className="size-3.5 shrink-0" aria-hidden /> Détails
      </Link>
      <button type="button" className={classesBouton} onClick={() => ouvrirEleves([classe.id])}>
        <Users className="size-3.5 shrink-0" aria-hidden />
        <span>Élèves</span>
      </button>
      {peutImprimer && (
        <a href={urlImpressionClasses(anneeId, [classe.id])} target="_blank" rel="noopener noreferrer" className={classesBouton}
          title={"Imprimer la liste officielle des élèves de " + classe.libelle}
          aria-label={"Imprimer la liste des élèves de " + classe.libelle}>
          <Printer className="size-3.5 shrink-0" aria-hidden />
          <span className={compact ? "" : "sr-only"}>Imprimer</span>
        </a>
      )}
      {peutModifier && (
        <button type="button" className={classesBouton} onClick={() => ouvrir(classe)}>
          <Pencil className="size-3.5 shrink-0" aria-hidden />
          <span>Modifier</span>
        </button>
      )}
      {peutNotifier && (
        classe.active && Number(classe.effectif) > 0
          ? <div className={compact ? "classes-list-notify min-w-[150px] flex-1 sm:flex-none" : "classes-list-notify w-[168px] shrink-0"}>
              <BoutonNotifier contexteClasses cible={{ type: "classe", id: classe.id, nom: classe.libelle }} libelle="Prévenir les parents" />
            </div>
          : <span title="Cette classe ne compte aucun élève actif à notifier" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              <BellRing className="size-3.5" aria-hidden />
              Aucun parent à prévenir
            </span>
      )}
    </div>
  );
}

/** Vue liste cohérente avec la vue cartes, sans tableau débordant sur mobile. */
export function ListeClasses({ classes, toutesClasses = classes, peutModifier, peutNotifier, peutImprimer, anneeId, ouvrir, selection, basculerSelection, ouvrirEleves }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Liste des classes">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <BarChart3 className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#0d1d3a] dark:text-white">Répertoire des classes</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Effectifs et capacités de l’année sélectionnée</p>
          </div>
        </div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          {classes.length} classe{classes.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="hidden 2xl:block">
        <table className="w-full table-fixed text-left" aria-label="Classes, effectifs et actions">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[17%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
            <col className="w-[29%]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-[#f3f7fd] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:border-slate-800 dark:bg-slate-800/75 dark:text-slate-300">
            <tr>
              <th scope="col" className="px-3 py-3.5"><span className="sr-only">Sélection</span></th>
              <th scope="col" className="px-5 py-3.5">Classe</th>
              <th scope="col" className="px-3 py-3.5">Niveau</th>
              <th scope="col" className="px-3 py-3.5 text-center">Effectif</th>
              <th scope="col" className="px-3 py-3.5 text-center">Capacité</th>
              <th scope="col" className="px-3 py-3.5">Remplissage</th>
              <th scope="col" className="px-3 py-3.5">Statut</th>
              <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {classes.map((classe) => {
              const paletteIndex = Math.max(0, toutesClasses.findIndex((c) => c.id === classe.id));
              const couleur = COULEURS[paletteIndex % COULEURS.length];
              return (
                <tr key={classe.id} className="group transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/55">
                  <td className="pl-3"><input type="checkbox" aria-label={"Sélectionner " + classe.libelle} checked={selection.includes(classe.id)} onChange={() => basculerSelection(classe.id)} className="size-4 accent-blue-600" /></td>
                  <th scope="row" className="py-3.5 pl-5 pr-3 text-left">
                    <div className="flex min-w-0 items-center gap-2.5">
                  <span className={"flex size-10 shrink-0 items-center justify-center rounded-xl " + couleur.fond + " " + couleur.texte}>
                        <GraduationCap className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <Link href={`/dashboard/classes/${classe.id}?annee=${anneeId}`} className="block truncate text-sm font-bold text-[#102244] hover:text-blue-700 hover:underline dark:text-white">{classe.libelle}</Link>
                        <span className="mt-0.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{classe.code}</span>
                      </span>
                    </div>
                  </th>
                  <td className="px-3 py-3.5 text-sm text-slate-600 dark:text-slate-300">{classe.niveauLibelle}</td>
                  <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-slate-900 dark:text-white">{classe.effectif}</td>
                  <td className="px-3 py-3.5 text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">{classe.capaciteMax}</td>
                  <td className="px-3 py-3.5"><TauxOccupation classe={classe} index={paletteIndex} /></td>
                  <td className="px-3 py-3.5"><Statut actif={classe.active} /></td>
                  <td className="px-5 py-3.5"><Actions classe={classe} peutModifier={peutModifier} peutNotifier={peutNotifier} peutImprimer={peutImprimer} anneeId={anneeId} ouvrir={ouvrir} ouvrirEleves={ouvrirEleves} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 2xl:hidden">
        {classes.map((classe, index) => {
          const paletteIndex = Math.max(0, toutesClasses.findIndex((c) => c.id === classe.id));
          const couleur = COULEURS[paletteIndex % COULEURS.length];
          return (
            <article key={classe.id} className="space-y-3 border-l-4 px-4 py-4 transition-colors hover:bg-blue-50/30 dark:hover:bg-slate-800/40 sm:px-5" style={{borderLeftColor:["#2563eb","#059669","#7c3aed","#e11d48","#d97706"][paletteIndex%5]}}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" checked={selection.includes(classe.id)} onChange={() => basculerSelection(classe.id)} aria-label={"Sélectionner " + classe.libelle} className="size-4 shrink-0 accent-blue-600" />
                  <span className={"flex size-10 shrink-0 items-center justify-center rounded-xl " + couleur.fond + " " + couleur.texte}>
                    <GraduationCap className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-[#102244] dark:text-white"><Link href={`/dashboard/classes/${classe.id}?annee=${anneeId}`} className="hover:text-blue-700 hover:underline">{classe.libelle}</Link> <span className="ml-1 text-xs font-medium text-slate-400">({classe.code})</span></h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{classe.niveauLibelle}</p>
                  </div>
                </div>
                <Statut actif={classe.active} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Élèves / capacité</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-white">{classe.effectif} <span className="font-medium text-slate-400">/ {classe.capaciteMax}</span></p>
                </div>
                <TauxOccupation classe={classe} index={paletteIndex} />
              </div>
              <Actions compact classe={classe} peutModifier={peutModifier} peutNotifier={peutNotifier} peutImprimer={peutImprimer} anneeId={anneeId} ouvrir={ouvrir} ouvrirEleves={ouvrirEleves} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
