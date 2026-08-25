"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { LigneAudit } from "@/server/domain/audit";

/**
 * Lecture du journal d'audit (E-61).
 *
 * LA LIGNE SE LIT SEULE, LE DÉTAIL SE DÉPLIE
 * -------------------------------------------
 * « Qui, quoi, quand, sur qui » tient sur une ligne. Les valeurs avant/après
 * sont du JSON : les afficher toutes ferait un mur illisible où l'on ne
 * trouverait plus la ligne qu'on cherche. Elles se déplient sur demande, une à
 * la fois.
 *
 * LE FILTRE PORTE SUR LA FAMILLE D'ACTION, PAS SUR L'ACTION EXACTE
 * -----------------------------------------------------------------
 * On cherche « tout ce qui touche aux notes », pas « note.modifiee »
 * précisément. Les familles sont lues en base plutôt qu'écrites en dur : les
 * actions sont des chaînes libres posées par chaque module, et une liste figée
 * oublierait celles ajoutées depuis.
 *
 * LE MOTIF EST EN CLAIR SUR LA LIGNE
 * -----------------------------------
 * C'est lui qu'on relit en cas de litige — « exclu pour bagarre », « paiement
 * annulé, erreur de saisie ». Le cacher dans le détail reviendrait à ne pas
 * l'avoir demandé au moment de l'action.
 */

const dateHeure = (v: string) =>
  new Date(v).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const LIBELLE_ROLE: Record<string, string> = {
  SUPER_ADMIN: "Administrateur",
  DIRECTION: "Direction",
  CENSEUR: "Censeur",
  SURVEILLANT: "Surveillant",
  SECRETARIAT: "Secrétariat",
  COMPTABLE: "Comptable",
  ENSEIGNANT: "Enseignant",
  PARENT: "Parent",
};

export function VueAudit({
  journal,
  familles,
  action,
  depuis,
  jusqua,
}: {
  journal: { lignes: LigneAudit[]; total: number; page: number; nbPages: number };
  familles: Array<{ famille: string; nombre: number }>;
  action: string;
  depuis: string;
  jusqua: string;
}) {
  const routeur = useRouter();
  const params = useSearchParams();
  const [deplie, setDeplie] = useState<string | null>(null);

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    // Changer de filtre renvoie en première page : rester à la page sept d'un
    // autre filtrage afficherait un vide qu'on prendrait pour une absence.
    p.delete("page");
    routeur.push(`/dashboard/parametres/audit?${p.toString()}`);
  }

  function allerPage(n: number) {
    const p = new URLSearchParams(params.toString());
    p.set("page", String(n));
    routeur.push(`/dashboard/parametres/audit?${p.toString()}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="a-action">Type d&apos;action</Label>
            <NativeSelect
              id="a-action"
              className="w-52"
              value={action}
              onChange={(e) => naviguer("action", e.target.value)}
            >
              <option value="">Toutes</option>
              {familles.map((f) => (
                <option key={f.famille} value={f.famille}>
                  {f.famille} ({f.nombre})
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="a-depuis">Du</Label>
            <Input
              id="a-depuis"
              type="date"
              className="w-40"
              value={depuis}
              onChange={(e) => naviguer("depuis", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="a-jusqua">Au</Label>
            <Input
              id="a-jusqua"
              type="date"
              className="w-40"
              value={jusqua}
              onChange={(e) => naviguer("jusqua", e.target.value)}
            />
          </div>

          {action || depuis || jusqua ? (
            <Button variant="ghost" onClick={() => routeur.push("/dashboard/parametres/audit")}>
              Effacer
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {journal.total} action(s) · page {journal.page} sur {journal.nbPages}
          </CardTitle>
          <CardDescription>
            De la plus récente à la plus ancienne. Le nom de l&apos;auteur est figé au moment de
            l&apos;action : un compte supprimé depuis laisse une trace encore lisible.
          </CardDescription>
        </CardHeader>

        <CardContent className="divide-y p-0">
          {journal.lignes.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              Aucune action ne correspond à ces critères.
            </p>
          ) : (
            journal.lignes.map((l) => {
              const ouvert = deplie === l.id;
              const aDetail = Boolean(l.avant || l.apres);
              return (
                <div key={l.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-muted-foreground w-32 shrink-0 text-xs tabular-nums">
                      {dateHeure(l.date)}
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {l.action}
                    </Badge>
                    <span className="font-medium">{l.acteur}</span>
                    {l.role ? (
                      <span className="text-muted-foreground text-xs">
                        {LIBELLE_ROLE[l.role] ?? l.role}
                      </span>
                    ) : null}
                    {l.eleve ? (
                      <Link
                        href={`/dashboard/eleves/${l.eleveId}`}
                        className="text-primary hover:underline"
                      >
                        {l.eleve}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">{l.entite}</span>
                    )}

                    {aDetail ? (
                      <button
                        type="button"
                        onClick={() => setDeplie(ouvert ? null : l.id)}
                        className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
                      >
                        {ouvert ? (
                          <ChevronDown className="size-3.5" aria-hidden />
                        ) : (
                          <ChevronRight className="size-3.5" aria-hidden />
                        )}
                        détail
                      </button>
                    ) : null}
                  </div>

                  {/*
                    Le motif reste sur la ligne : c'est lui qu'on relit en cas
                    de litige. Le ranger dans le détail reviendrait à ne pas
                    l'avoir demandé au moment de l'action.
                  */}
                  {l.motif ? (
                    <p className="text-muted-foreground mt-0.5 pl-34 text-xs">« {l.motif} »</p>
                  ) : null}

                  {ouvert ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {l.avant ? (
                        <div>
                          <p className="text-muted-foreground mb-1 text-xs">Avant</p>
                          <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                            {JSON.stringify(l.avant, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {l.apres ? (
                        <div>
                          <p className="text-muted-foreground mb-1 text-xs">Après</p>
                          <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                            {JSON.stringify(l.apres, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {journal.nbPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {journal.page} sur {journal.nbPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={journal.page <= 1}
              onClick={() => allerPage(journal.page - 1)}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={journal.page >= journal.nbPages}
              onClick={() => allerPage(journal.page + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
