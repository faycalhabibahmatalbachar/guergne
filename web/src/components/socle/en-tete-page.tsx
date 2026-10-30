import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * En-tête de page unique de l'administration.
 *
 * Avant ce composant, le bloc titre + description était recopié à la main sur
 * dix-huit pages, avec des tailles, des marges et des dispositions d'actions
 * qui divergeaient d'un module à l'autre. Toute page passe désormais par ici.
 *
 * Trois emplacements, toujours dans le même ordre de lecture :
 *   - `titre`       ce qu'on regarde ;
 *   - `description` une phrase de contexte, jamais un mode d'emploi ;
 *   - `actions`     les gestes possibles, l'action principale en dernier,
 *                   donc la plus à droite et la plus proche du pouce.
 *
 * Le fil d'Ariane n'est pas ici : il vit dans l'en-tête global, au-dessus,
 * pour exister sur toutes les pages sans que chacune ait à le déclarer.
 */
export function EnTetePage({
  titre,
  description,
  actions,
  className,
}: {
  titre: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b pb-4", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate">{titre}</h1>
        {description ? <p className="max-w-3xl text-pretty text-muted-foreground text-sm">{description}</p> : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Conteneur de page. Impose le rythme vertical commun à tous les modules :
 * sans lui, chaque page choisissait son propre `space-y-4`, `space-y-6` ou
 * `space-y-8`, et deux onglets voisins n'avaient pas la même respiration.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

/**
 * Section à l'intérieur d'une page : un titre de second niveau et son contenu.
 * Sert à découper une fiche longue sans empiler des cartes qui n'apportent
 * qu'une bordure de plus.
 */
export function Section({
  titre,
  description,
  actions,
  children,
  className,
}: {
  titre: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <h2>{titre}</h2>
          {description ? <p className="text-pretty text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
