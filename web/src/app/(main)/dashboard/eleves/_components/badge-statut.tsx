import { Badge } from "@/components/ui/badge";
import { libelleStatut, tonStatut } from "@/lib/eleves-constantes";
import { cn } from "@/lib/utils";

/**
 * Badge de statut d'un élève.
 *
 * Le libellé est TOUJOURS affiché, jamais la seule couleur : environ un homme
 * sur douze distingue mal le rouge du vert, et un statut disciplinaire ne peut
 * pas dépendre de cette perception.
 */
const CLASSES: Record<"succes" | "alerte" | "danger" | "neutre", string> = {
  succes: "border-succes-trait bg-succes-doux text-succes",
  alerte: "border-alerte-trait bg-alerte-doux text-alerte",
  danger: "border-danger-trait bg-danger-doux text-danger",
  neutre: "border-border bg-muted text-muted-foreground",
};

export function BadgeStatut({ statut, className }: { statut: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn(CLASSES[tonStatut(statut)], "font-medium", className)}>
      {libelleStatut(statut)}
    </Badge>
  );
}
