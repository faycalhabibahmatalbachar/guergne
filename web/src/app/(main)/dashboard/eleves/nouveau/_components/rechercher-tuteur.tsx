"use client";

import { useEffect, useState } from "react";

import { Check, LoaderCircle, Search, UserRoundCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { rechercherParentsInscription } from "../../actions";

type Parent = Awaited<ReturnType<typeof rechercherParentsInscription>>[number];

export function RechercherTuteur({
  nomSelectionne,
  onSelection,
  onEffacer,
  champId,
}: {
  nomSelectionne: string | null;
  champId: string;
  onSelection: (parent: Parent) => void;
  onEffacer: () => void;
}) {
  const [terme, setTerme] = useState("");
  const [lignes, setLignes] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let actif = true;
    if (terme.trim().length < 3 || nomSelectionne) return;
    const minuteur = setTimeout(async () => {
      setLoading(true);
      try {
        const resultats = await rechercherParentsInscription(terme);
        if (actif) {
          setLignes(resultats);
          setErreur(false);
        }
      } catch {
        if (actif) {
          setLignes([]);
          setErreur(true);
        }
      } finally {
        if (actif) setLoading(false);
      }
    }, 350);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [terme, nomSelectionne]);

  if (nomSelectionne)
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-info-trait bg-info-doux px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-info">
          <UserRoundCheck className="size-4" aria-hidden />
          Parent existant : {nomSelectionne}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTerme("");
            setLignes([]);
            onEffacer();
          }}
        >
          <X className="size-3.5" aria-hidden /> Détacher
        </Button>
      </div>
    );

  return (
    <div className="space-y-2">
      <label htmlFor={champId} className="text-xs font-semibold text-foreground">
        Associer un compte parent existant (facultatif)
      </label>
      <div className="relative">
        {loading ? (
          <LoaderCircle
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : (
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        )}
        <Input
          id={champId}
          value={terme}
          onChange={(e) => {
            setTerme(e.target.value);
            setLignes([]);
          }}
          placeholder="Nom, prénom ou numéro de téléphone (3 caractères minimum)"
          className="h-10 pl-9"
          autoComplete="off"
        />
      </div>
      {terme.trim().length >= 3 && !loading && (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
          {lignes.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onSelection(p);
                setTerme("");
                setLignes([]);
              }}
              className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-info-doux/90 dark:hover:bg-muted/30"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {p.prenom} {p.nom}
                </span>
                <span className="block text-xs text-muted-foreground">{p.telephone}</span>
              </span>
              <Check className="size-4 shrink-0 text-info" aria-hidden />
            </button>
          ))}
          {!lignes.length && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {erreur
                ? "Recherche indisponible."
                : "Aucun compte correspondant. Remplissez les champs pour créer un nouveau parent."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
