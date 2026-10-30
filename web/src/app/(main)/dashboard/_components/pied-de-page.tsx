import { APP_CONFIG } from "@/config/app-config";

/**
 * Pied de page de l'administration.
 *
 * Il n'en existait aucun : `APP_CONFIG.copyright` était défini et jamais
 * affiché, et rien à l'écran ne disait quelle version tournait — information
 * dont on a besoin dès le premier appel au support.
 *
 * Il reste volontairement maigre : une ligne, hauteur fixe, pas de colonnes de
 * liens. L'espace de travail est ce qui compte sur ces écrans.
 */
export function PiedDePage() {
  return (
    <footer className="mt-auto shrink-0 border-t px-4 py-3 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <p>{APP_CONFIG.copyright}</p>
        <p className="tabular-nums">
          {APP_CONFIG.sigle} · version {APP_CONFIG.version}
        </p>
      </div>
    </footer>
  );
}
