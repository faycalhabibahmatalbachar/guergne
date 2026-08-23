"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * En-tête de colonne triable (E-37).
 *
 * LE TRI VIT DANS L'URL
 * ----------------------
 * Comme les filtres. Un tri qui disparaît au retour arrière oblige à le
 * reposer, et l'utilisateur cesse de s'en servir au bout de trois fois. Ici, la
 * liste triée par « reste à payer » se partage par simple copie du lien — ce
 * que le comptable fait pour transmettre au censeur.
 *
 * TROIS ÉTATS, PAS DEUX
 * ----------------------
 * Croissant, décroissant, puis retour à l'ordre naturel. Sans ce troisième
 * état, on ne peut plus revenir à l'ordre par défaut sans recharger la page —
 * or l'ordre par défaut n'est pas arbitraire : les élèves sont classés par
 * classe puis par nom, et c'est celui-là qu'on veut pour faire l'appel.
 *
 * LE TRI EST APPLIQUÉ EN BASE
 * ----------------------------
 * Ce composant ne fait que poser un paramètre dans l'URL. Trier côté navigateur
 * ne trierait que la page affichée, et donnerait un classement faux dès qu'une
 * liste est paginée — le premier de la page deux pouvant devancer le dernier de
 * la page un.
 */
export function EnTeteTriable({
  colonne,
  children,
  className,
  numerique = false,
}: {
  /** Nom du champ, tel que la requête serveur l'attend. */
  colonne: string;
  children: React.ReactNode;
  className?: string;
  /** Aligne à droite et inverse le sens par défaut : un montant se lit du plus grand. */
  numerique?: boolean;
}) {
  const routeur = useRouter();
  const params = useSearchParams();

  const actuel = params.get("tri");
  const sens = params.get("sens");
  const actif = actuel === colonne;

  function basculer() {
    const p = new URLSearchParams(params.toString());

    if (!actif) {
      p.set("tri", colonne);
      // Un montant ou un effectif se lit du plus grand au plus petit ; un nom,
      // de A à Z. Imposer le même sens aux deux ferait cliquer deux fois dans
      // la moitié des cas.
      p.set("sens", numerique ? "desc" : "asc");
    } else if (sens === (numerique ? "desc" : "asc")) {
      p.set("sens", numerique ? "asc" : "desc");
    } else {
      // Troisième clic : retour à l'ordre naturel.
      p.delete("tri");
      p.delete("sens");
    }

    // Le tri renvoie en première page : rester à la page trois d'un autre
    // classement n'aurait aucun sens.
    p.delete("page");

    routeur.push(`?${p.toString()}`);
  }

  const Fleche = !actif ? ChevronsUpDown : sens === "desc" ? ArrowDown : ArrowUp;

  return (
    <th className={cn("font-medium", numerique && "text-right", className)}>
      <button
        type="button"
        onClick={basculer}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1 transition-colors",
          actif ? "text-foreground font-semibold" : "text-muted-foreground",
        )}
        aria-label={`Trier par ${typeof children === "string" ? children : colonne}`}
      >
        {children}
        <Fleche aria-hidden className={cn("size-3.5", !actif && "opacity-40")} />
      </button>
    </th>
  );
}

/**
 * Traduit les paramètres d'URL en clause `ORDER BY`, côté serveur.
 *
 * La liste blanche n'est pas une précaution de style : `tri` vient de l'URL,
 * donc de l'utilisateur. L'interpoler directement dans du SQL laisserait
 * choisir n'importe quelle expression — c'est une injection.
 */
export function clauseTri(
  tri: string | undefined,
  sens: string | undefined,
  colonnes: Record<string, string>,
  defaut: string,
): string {
  const colonne = tri ? colonnes[tri] : undefined;
  if (!colonne) return defaut;

  const direction = sens === "desc" ? "DESC" : "ASC";
  // `NULLS LAST` dans les deux sens : une valeur absente n'est ni la plus
  // grande ni la plus petite, elle n'a rien à faire en tête de liste.
  return `${colonne} ${direction} NULLS LAST`;
}
