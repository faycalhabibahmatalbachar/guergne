import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LIBELLES_STATUT, type StatutEleve, TONS_STATUT } from "@/lib/eleves-constantes";

/**
 * Badge de statut d'un élève.
 *
 * Le libellé est TOUJOURS affiché, jamais la seule couleur : environ un homme
 * sur douze distingue mal le rouge du vert, et un statut disciplinaire ne peut
 * pas dépendre de cette perception.
 */
const CLASSES: Record<"succes" | "alerte" | "danger" | "neutre", string> = {
  succes: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  alerte: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
  neutre: "border-border bg-muted text-muted-foreground",
};

export function BadgeStatut({ statut, className }: { statut: StatutEleve; className?: string }) {
  return (
    <Badge variant="outline" className={cn(CLASSES[TONS_STATUT[statut]], "font-medium", className)}>
      {LIBELLES_STATUT[statut]}
    </Badge>
  );
}
