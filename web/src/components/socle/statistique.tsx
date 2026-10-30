import type { ComponentType, ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils";

export type TonStatistique = "neutre" | "succes" | "alerte" | "danger" | "info";

const TEINTE_VALEUR: Record<TonStatistique, string> = {
  neutre: "text-foreground",
  succes: "text-succes",
  alerte: "text-alerte",
  danger: "text-danger",
  info: "text-info",
};

const TEINTE_ICONE: Record<TonStatistique, string> = {
  neutre: "bg-muted text-muted-foreground",
  succes: "bg-succes-doux text-succes",
  alerte: "bg-alerte-doux text-alerte",
  danger: "bg-danger-doux text-danger",
  info: "bg-info-doux text-info",
};

/**
 * Tuile d'indicateur — la seule de l'application.
 *
 * Il en existait quatre : celle du tableau de bord (balisage Gentelella injecté
 * en HTML brut), celle de Classes (pastille d'icône en aplat de couleur, 52 px),
 * celle de Parents (icône à droite, 40 px, feuille de style séparée) et celle
 * d'une fiche de classe. Quatre dispositions, quatre tailles d'icône, trois
 * emplacements de libellé — pour afficher un chiffre et son intitulé.
 *
 * L'icône est posée dans une pastille teintée, jamais en aplat plein : un carré
 * de couleur vive attire l'œil plus que le chiffre, qui est l'information.
 *
 * Le ton signale un état réel, pas une humeur. Un effectif n'est ni bon ni
 * mauvais — il reste neutre. Seul ce qui demande une action se colore.
 */
export function Statistique({
  libelle,
  valeur,
  aide,
  ton = "neutre",
  icone: Icone,
  href,
  className,
}: {
  libelle: ReactNode;
  valeur: ReactNode;
  /** Une précision courte sous la valeur : unité, période, raison d'un tiret. */
  aide?: ReactNode;
  ton?: TonStatistique;
  icone?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Rend la tuile cliquable : un chiffre qui alerte doit mener où on le traite. */
  href?: string;
  className?: string;
}) {
  const contenu = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium text-muted-foreground text-xs leading-tight">{libelle}</p>
        {Icone ? (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TEINTE_ICONE[ton])}>
            <Icone className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>

      <p className={cn("mt-2 font-semibold text-2xl leading-none tabular-nums", TEINTE_VALEUR[ton])}>{valeur}</p>

      {aide ? <p className="mt-1.5 text-muted-foreground text-xs leading-tight">{aide}</p> : null}
    </>
  );

  const classes = cn(
    "rounded-xl border bg-card px-4 py-3.5 text-card-foreground shadow-carte",
    href ? "transition-colors hover:border-ring/40 hover:bg-accent/40" : null,
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(classes, "block focus-visible:ring-3 focus-visible:ring-ring/50")}>
        {contenu}
      </Link>
    );
  }

  return <div className={classes}>{contenu}</div>;
}

/**
 * Rangée d'indicateurs. Deux colonnes sur téléphone : une tuile par ligne
 * obligerait à faire défiler quatre écrans pour lire quatre chiffres.
 */
export function RangeeStatistiques({
  children,
  colonnes = 4,
  className,
}: {
  children: ReactNode;
  colonnes?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        colonnes === 3 ? "lg:grid-cols-3" : null,
        colonnes === 4 ? "lg:grid-cols-4" : null,
        colonnes === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : null,
        colonnes === 6 ? "sm:grid-cols-3 lg:grid-cols-6" : null,
        className,
      )}
    >
      {children}
    </div>
  );
}
