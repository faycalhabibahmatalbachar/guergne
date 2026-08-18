import Link from "next/link";

import { ArrowRight, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface EtapeManquante {
  libelle: string;
  /**
   * Laisser `url` vide tant que la page destinataire n'existe pas.
   * L'étape s'affiche alors comme une consigne, pas comme un bouton : un
   * bouton qui mène à une page 404 est pire que pas de bouton du tout.
   */
  url?: string;
}

/**
 * Écran affiché lorsqu'un module ne peut pas encore fonctionner parce qu'une
 * étape amont manque (pas d'année scolaire, pas de classe, pas d'évaluation).
 *
 * On explique CE QUI manque, dans l'ordre où il faut le traiter. Un module qui
 * s'ouvre sur un tableau vide, sans explication, est indiscernable d'une panne
 * — et le premier réflexe de l'utilisateur est d'appeler le support.
 */
export function Prerequis({
  titre,
  explication,
  manquants,
}: {
  titre: string;
  explication: string;
  manquants: EtapeManquante[];
}) {
  const cliquables = manquants.filter((m) => m.url);
  const consignes = manquants.filter((m) => !m.url);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <ListChecks className="size-8 text-muted-foreground" aria-hidden />

        <div className="max-w-lg">
          <p className="font-medium">{titre}</p>
          <p className="mt-1 text-muted-foreground text-sm">{explication}</p>
        </div>

        {consignes.length > 0 ? (
          <ol className="max-w-md space-y-1 text-left text-muted-foreground text-sm">
            {consignes.map((m, index) => (
              <li key={m.libelle} className="flex gap-2">
                <span className="tabular-nums">{index + 1}.</span>
                <span>{m.libelle}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {cliquables.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {cliquables.map((m) => (
              <Button key={m.libelle} asChild variant="outline" size="sm">
                <Link href={m.url as string}>
                  {m.libelle}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
