"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Sélection multiple et actions en lot (E-38).
 *
 * LA SÉLECTION NE PORTE QUE SUR CE QUI EST À L'ÉCRAN
 * ---------------------------------------------------
 * « Tout sélectionner » coche les lignes visibles, pas les 640 élèves du
 * fichier. Un « tout » qui embrasse des lignes qu'on n'a pas vues est la
 * mécanique exacte par laquelle une classe entière se retrouve transférée par
 * erreur : l'utilisateur croit agir sur sa page filtrée, et agit sur la base.
 *
 * Le compte est donc toujours affiché en toutes lettres — « 12 élèves
 * sélectionnés » — et jamais remplacé par « tous ».
 *
 * ELLE SE VIDE QUAND LA LISTE CHANGE
 * -----------------------------------
 * Changer de page ou de filtre efface la sélection. La conserver donnerait une
 * sélection invisible : on agirait sur des lignes qu'on ne peut plus relire
 * avant de confirmer. C'est ce que fait `useEffect` sur la signature des ids —
 * pas un oubli de persistance, une garantie.
 *
 * L'état vit en mémoire et non dans l'URL : deux cents identifiants dans une
 * barre d'adresse ne se partagent pas, et une sélection n'a pas vocation à
 * survivre au rechargement.
 */

interface Contexte {
  selection: Set<string>;
  basculer: (id: string) => void;
  vider: () => void;
  ids: string[];
}

const ContexteSelection = createContext<Contexte | null>(null);

export function useSelection(): Contexte {
  const c = useContext(ContexteSelection);
  if (!c) throw new Error("useSelection hors d'un <ZoneSelection>");
  return c;
}

/**
 * Enveloppe la liste et détient la sélection.
 *
 * `ids` est l'ensemble des lignes affichées, dans l'ordre. Il sert à la fois de
 * référence pour « tout cocher » et de signature de changement de liste.
 */
export function ZoneSelection({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const signature = ids.join(",");
  useEffect(() => {
    setSelection(new Set());
  }, [signature]);

  const basculer = useCallback((id: string) => {
    setSelection((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }, []);

  const vider = useCallback(() => setSelection(new Set()), []);

  const valeur = useMemo(
    () => ({ selection, basculer, vider, ids }),
    [selection, basculer, vider, ids],
  );

  return <ContexteSelection.Provider value={valeur}>{children}</ContexteSelection.Provider>;
}

/** En-tête « tout cocher », limité aux lignes affichées. */
export function EnTeteSelection({ className }: { className?: string }) {
  const { selection, ids } = useSelection();
  const contexte = useContext(ContexteSelection)!;

  const toutes = ids.length > 0 && ids.every((i) => selection.has(i));
  const partielle = selection.size > 0 && !toutes;

  function basculerTout() {
    // On reconstruit la sélection au lieu de basculer ligne à ligne : si
    // certaines lignes sont déjà cochées, un basculement individuel les
    // décocherait, et l'utilisateur obtiendrait l'inverse de ce qu'il demande.
    const nouvelles = toutes ? [] : ids;
    contexte.vider();
    for (const id of nouvelles) contexte.basculer(id);
  }

  return (
    <th className={cn("w-10 px-4 py-2.5", className)}>
      <Checkbox
        checked={toutes ? true : partielle ? "indeterminate" : false}
        onCheckedChange={basculerTout}
        aria-label={toutes ? "Tout décocher" : "Cocher les lignes affichées"}
      />
    </th>
  );
}

/** Case d'une ligne. À placer dans une cellule à part, jamais sur une ligne cliquable. */
export function CaseSelection({ id, className }: { id: string; className?: string }) {
  const { selection, basculer } = useSelection();
  return (
    <td className={cn("px-4 py-2.5", className)} onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={selection.has(id)}
        onCheckedChange={() => basculer(id)}
        aria-label="Sélectionner cette ligne"
      />
    </td>
  );
}

/**
 * Barre d'actions, affichée seulement quand quelque chose est sélectionné.
 *
 * Elle flotte au-dessus du contenu plutôt que d'occuper une place permanente :
 * une barre vide en permanence apprend à l'œil à l'ignorer, et on ne la voit
 * plus le jour où elle porte une action destructrice.
 */
export function BarreSelection({
  singulier,
  pluriel,
  children,
}: {
  singulier: string;
  pluriel: string;
  children: React.ReactNode;
}) {
  const { selection, vider } = useSelection();
  if (selection.size === 0) return null;

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
      <div className="bg-background pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border py-2 pr-2 pl-4 shadow-lg">
        <span className="text-sm font-medium tabular-nums">
          {selection.size} {selection.size === 1 ? singulier : pluriel}
        </span>
        <span className="bg-border h-5 w-px" aria-hidden />
        {children}
        <Button variant="ghost" size="icon" onClick={vider} aria-label="Annuler la sélection">
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
