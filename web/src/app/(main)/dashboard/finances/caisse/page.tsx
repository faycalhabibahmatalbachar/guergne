import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { journalDeCaisse } from "@/server/domain/caisse";
import { exigerPage } from "@/server/guard";

import { VueCaisse } from "./vue-caisse";

export const metadata: Metadata = { title: "Journal de caisse" };
export const dynamic = "force-dynamic";

/**
 * Journal de caisse du jour (E-57).
 *
 * Le droit exigé est `finance:lire` et non `finance:encaisser` : le proviseur
 * doit pouvoir contrôler la caisse sans avoir le droit d'y toucher. C'est
 * même la séparation qui donne son sens au contrôle.
 */
export default async function PageCaisse({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await exigerPage("finance:lire");

  const params = await searchParams;

  // Par défaut aujourd'hui : on ouvre cet écran à la fermeture, pour la
  // journée qui s'achève. Demander de choisir une date ajouterait un geste à
  // l'usage unique.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : new Date().toISOString().slice(0, 10);

  const journal = await journalDeCaisse(date);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Journal de caisse</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/finances">
            <ArrowLeft aria-hidden />
            Suivi financier
          </Link>
        </Button>
      </div>

      <VueCaisse journal={journal} />
    </div>
  );
}
