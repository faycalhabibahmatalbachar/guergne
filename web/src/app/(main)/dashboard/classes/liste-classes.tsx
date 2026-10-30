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
  { fond: "bg-info-doux", texte: "text-info", barre: "bg-primary" },
  { fond: "bg-succes-doux", texte: "text-succes", barre: "bg-succes" },
  { fond: "bg-info-doux", texte: "text-info", barre: "bg-primary" },
  { fond: "bg-danger-doux", texte: "text-danger", barre: "bg-danger" },
  { fond: "bg-alerte-doux", texte: "text-alerte", barre: "bg-alerte" },
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
        <span className="text-sm font-bold tabular-nums text-foreground dark:text-primary-foreground">
          {capacite > 0 ? taux + "%" : "—"}
        </span>
        {capacite > 0 && taux >= 100 && <span className="text-xs font-semibold text-alerte">Complet</span>}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
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
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " +
        (actif ? "border-succes-trait bg-succes-doux text-succes" : "border-border bg-muted text-muted-foreground")
      }
    >
      <span aria-hidden className={"size-1.5 rounded-full " + (actif ? "bg-succes" : "bg-muted")} />
      {actif ? "Active" : "Inactive"}
    </span>
  );
}

function Actions({
  classe,
  peutModifier,
  peutNotifier,
  peutImprimer,
  anneeId,
  ouvrir,
  ouvrirEleves,
  compact = false,
}: {
  classe: LigneClasseParametre;
  peutModifier: boolean;
  peutNotifier: boolean;
  peutImprimer: boolean;
  anneeId: string;
  ouvrir: (classe: LigneClasseParametre) => void;
  ouvrirEleves: (ids: string[]) => void;
  compact?: boolean;
}) {
  const classesBouton =
    "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-info-trait hover:bg-info-doux/90 hover:text-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-card/90";
  return (
    <div
      className={
        "classes-list-actions min-w-0 gap-1.5 " +
        (compact ? "grid grid-cols-2 sm:grid-cols-3" : "flex w-full flex-wrap items-center justify-end")
      }
    >
      <Link
        href={`/dashboard/classes/${classe.id}?annee=${anneeId}`}
        className={classesBouton}
        title="Ouvrir les détails de la classe"
      >
        <Eye className="size-3.5 shrink-0" aria-hidden /> Détails
      </Link>
      <button type="button" className={classesBouton} onClick={() => ouvrirEleves([classe.id])}>
        <Users className="size-3.5 shrink-0" aria-hidden />
        <span>Élèves</span>
      </button>
      {peutImprimer && (
        <a
          href={urlImpressionClasses(anneeId, [classe.id])}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBouton}
          title={"Imprimer la liste officielle des élèves de " + classe.libelle}
          aria-label={"Imprimer la liste des élèves de " + classe.libelle}
        >
          <Printer className="size-3.5 shrink-0" aria-hidden />
          <span>Imprimer</span>
        </a>
      )}
      {peutModifier && (
        <button type="button" className={classesBouton} onClick={() => ouvrir(classe)}>
          <Pencil className="size-3.5 shrink-0" aria-hidden />
          <span>Modifier</span>
        </button>
      )}
      {peutNotifier && (
        <div
          className={compact ? "classes-list-notify col-span-2 w-full sm:col-span-3" : "classes-list-notify shrink-0"}
        >
          {classe.active && Number(classe.effectif) > 0 ? (
            <BoutonNotifier
              contexteClasses
              cible={{ type: "classe", id: classe.id, nom: classe.libelle }}
              libelle="Prévenir les parents"
            />
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Aucun parent à prévenir pour cette classe"
              className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-muted/40 px-2.5 text-xs font-semibold text-muted-foreground"
            >
              <BellRing className="size-3.5 shrink-0" aria-hidden />
              Aucun parent à prévenir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Vue liste cohérente avec la vue cartes, sans tableau débordant sur mobile. */
export function ListeClasses({
  classes,
  toutesClasses = classes,
  peutModifier,
  peutNotifier,
  peutImprimer,
  anneeId,
  ouvrir,
  selection,
  basculerSelection,
  ouvrirEleves,
}: Props) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-label="Liste des classes"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-info-doux text-info">
            <BarChart3 className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground dark:text-primary-foreground">Répertoire des classes</h2>
            <p className="text-xs text-muted-foreground">Effectifs et capacités de l’année sélectionnée</p>
          </div>
        </div>
        <span className="rounded-full border border-info-trait bg-info-doux px-3 py-1 text-xs font-semibold text-info">
          {classes.length} classe{classes.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="hidden 2xl:block">
        <table className="w-full table-fixed text-left" aria-label="Classes, effectifs et actions">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[45%]" />
          </colgroup>
          <thead className="border-b border-border bg-muted/40 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3.5">
                <span className="sr-only">Sélection</span>
              </th>
              <th scope="col" className="px-5 py-3.5">
                Classe
              </th>
              <th scope="col" className="px-3 py-3.5">
                Niveau
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                Effectif
              </th>
              <th scope="col" className="px-3 py-3.5 text-center">
                Capacité
              </th>
              <th scope="col" className="px-3 py-3.5">
                Remplissage
              </th>
              <th scope="col" className="px-3 py-3.5">
                Statut
              </th>
              <th scope="col" className="px-3 py-3.5 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {classes.map((classe) => {
              const paletteIndex = Math.max(
                0,
                toutesClasses.findIndex((c) => c.id === classe.id),
              );
              const couleur = COULEURS[paletteIndex % COULEURS.length];
              return (
                <tr key={classe.id} className="group transition-colors hover:bg-info-doux/90 dark:hover:bg-card/90">
                  <td className="pl-3">
                    <input
                      type="checkbox"
                      aria-label={"Sélectionner " + classe.libelle}
                      checked={selection.includes(classe.id)}
                      onChange={() => basculerSelection(classe.id)}
                      className="size-4 accent-blue-600"
                    />
                  </td>
                  <th scope="row" className="py-3.5 pl-3 pr-2 text-left">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={
                          "flex size-10 shrink-0 items-center justify-center rounded-xl " +
                          couleur.fond +
                          " " +
                          couleur.texte
                        }
                      >
                        <GraduationCap className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/dashboard/classes/${classe.id}?annee=${anneeId}`}
                          className="block truncate text-sm font-bold text-foreground hover:text-info hover:underline dark:text-primary-foreground"
                        >
                          {classe.libelle}
                        </Link>
                        <span className="mt-0.5 inline-block rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          {classe.code}
                        </span>
                      </span>
                    </div>
                  </th>
                  <td className="px-3 py-3.5 text-sm text-muted-foreground">{classe.niveauLibelle}</td>
                  <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-foreground dark:text-primary-foreground">
                    {classe.effectif}
                  </td>
                  <td className="px-3 py-3.5 text-center text-sm tabular-nums text-muted-foreground">
                    {classe.capaciteMax}
                  </td>
                  <td className="px-3 py-3.5">
                    <TauxOccupation classe={classe} index={paletteIndex} />
                  </td>
                  <td className="px-3 py-3.5">
                    <Statut actif={classe.active} />
                  </td>
                  <td className="px-2 py-3">
                    <Actions
                      classe={classe}
                      peutModifier={peutModifier}
                      peutNotifier={peutNotifier}
                      peutImprimer={peutImprimer}
                      anneeId={anneeId}
                      ouvrir={ouvrir}
                      ouvrirEleves={ouvrirEleves}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border 2xl:hidden">
        {classes.map((classe, index) => {
          const paletteIndex = Math.max(
            0,
            toutesClasses.findIndex((c) => c.id === classe.id),
          );
          const couleur = COULEURS[paletteIndex % COULEURS.length];
          return (
            <article
              key={classe.id}
              className="space-y-3 border-l-4 px-4 py-4 transition-colors hover:bg-info-doux/90 dark:hover:bg-card/90 sm:px-5"
              style={{
                borderLeftColor: [
                  "var(--chart-1)",
                  "var(--succes)",
                  "var(--chart-4)",
                  "var(--danger)",
                  "var(--alerte)",
                ][paletteIndex % 5],
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selection.includes(classe.id)}
                    onChange={() => basculerSelection(classe.id)}
                    aria-label={"Sélectionner " + classe.libelle}
                    className="size-4 shrink-0 accent-blue-600"
                  />
                  <span
                    className={
                      "flex size-10 shrink-0 items-center justify-center rounded-xl " +
                      couleur.fond +
                      " " +
                      couleur.texte
                    }
                  >
                    <GraduationCap className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-foreground dark:text-primary-foreground">
                      <Link
                        href={`/dashboard/classes/${classe.id}?annee=${anneeId}`}
                        className="hover:text-info hover:underline"
                      >
                        {classe.libelle}
                      </Link>{" "}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">({classe.code})</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">{classe.niveauLibelle}</p>
                  </div>
                </div>
                <Statut actif={classe.active} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 rounded-xl bg-muted/40 p-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Élèves / capacité</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-foreground dark:text-primary-foreground">
                    {classe.effectif} <span className="font-medium text-muted-foreground">/ {classe.capaciteMax}</span>
                  </p>
                </div>
                <TauxOccupation classe={classe} index={paletteIndex} />
              </div>
              <Actions
                compact
                classe={classe}
                peutModifier={peutModifier}
                peutNotifier={peutNotifier}
                peutImprimer={peutImprimer}
                anneeId={anneeId}
                ouvrir={ouvrir}
                ouvrirEleves={ouvrirEleves}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
