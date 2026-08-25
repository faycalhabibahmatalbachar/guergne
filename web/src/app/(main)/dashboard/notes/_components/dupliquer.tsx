"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { dupliquerEvaluation } from "../actions";

/**
 * Reprendre la même évaluation dans d'autres classes (E-44).
 *
 * Un professeur qui a la 6e A, B et C fait passer le même contrôle aux trois.
 * Le ressaisir trois fois coûte du temps et produit des écarts : un barème sur
 * 20 ici, sur 40 là — et les moyennes ne sont plus comparables entre classes
 * du même niveau.
 *
 * LA DATE EST PROPOSÉE, PAS IMPOSÉE
 * ----------------------------------
 * Le même devoir se donne rarement le même jour dans trois classes : l'emploi
 * du temps ne le permet pas. Champ vide = on garde la date d'origine, ce qui
 * couvre le cas où les trois classes composent ensemble.
 *
 * Les classes où la matière n'est pas au programme sont écartées côté serveur
 * plutôt que masquées ici : la liste vient de l'écran, et l'écran peut se
 * tromper. La réponse dit combien ont été écartées.
 */
export function BoutonDupliquer({
  evaluationId,
  titre,
  classeOrigine,
  classes,
}: {
  evaluationId: string;
  titre: string;
  classeOrigine: string;
  classes: Array<{ id: string; libelle: string }>;
}) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [enCours, demarrer] = useTransition();

  const candidates = classes.filter((c) => c.id !== classeOrigine);

  function basculer(id: string) {
    setChoisies((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  function dupliquer() {
    demarrer(async () => {
      const r = await dupliquerEvaluation(evaluationId, [...choisies], date || undefined);
      toast[r.ok ? "success" : "error"](r.message ?? (r.ok ? "Dupliquée." : "Échec."));
      if (r.ok) {
        setOuvert(false);
        setChoisies(new Set());
        setDate("");
        routeur.refresh();
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Reprendre dans d'autres classes">
          <Copy aria-hidden />
          <span className="sr-only">Dupliquer</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Reprendre « {titre} »</DialogTitle>
          <DialogDescription>
            Type, titre, barème, poids et durée sont recopiés. Les notes ne le sont pas — ce sont
            d&apos;autres élèves. Le professeur affecté à la classe d&apos;arrivée devient
            responsable de la saisie.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Classes de destination</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                >
                  <Checkbox checked={choisies.has(c.id)} onCheckedChange={() => basculer(c.id)} />
                  {c.libelle}
                </label>
              ))}
              {candidates.length === 0 ? (
                <p className="text-muted-foreground px-2 py-1.5 text-sm">
                  Aucune autre classe disponible.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dup-date">Nouvelle date (facultatif)</Label>
            <Input
              id="dup-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Laissez vide pour garder la date d&apos;origine — le cas où les classes composent
              ensemble.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOuvert(false)}>
            Annuler
          </Button>
          <Button onClick={dupliquer} disabled={enCours || choisies.size === 0}>
            {enCours ? "Copie…" : `Créer dans ${choisies.size} classe(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
