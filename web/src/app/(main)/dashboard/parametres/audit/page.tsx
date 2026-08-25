import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { famillesAudit, listerAudit } from "@/server/domain/audit";
import { exigerPage } from "@/server/guard";

import { VueAudit } from "./vue-audit";

export const metadata: Metadata = { title: "Journal d'audit" };
export const dynamic = "force-dynamic";

/**
 * Journal d'audit (E-61).
 *
 * Sixième table écrite par tout le logiciel et lue par personne. Chaque action
 * y passe — note modifiée, élève exclu, paiement annulé, bulletin publié — mais
 * rien ne permettait de la relire.
 *
 * Or c'est l'unique réponse à la seule question qui se pose vraiment un jour :
 * « qui a changé cette note ? ». Sans écran, elle exigeait un accès direct à la
 * base — autant dire qu'elle n'existait pas pour l'établissement.
 *
 * Le droit exigé est `audit:lire`, distinct de tout le reste : lire le journal,
 * c'est voir ce que TOUS les autres ont fait. Ce n'est pas un corollaire du
 * droit de configurer l'établissement.
 */
export default async function PageAudit({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    entite?: string;
    eleve?: string;
    depuis?: string;
    jusqua?: string;
    page?: string;
  }>;
}) {
  await exigerPage("audit:lire");

  const params = await searchParams;

  const [journal, familles] = await Promise.all([
    listerAudit({
      action: params.action,
      entite: params.entite,
      eleveId: params.eleve,
      depuis: params.depuis,
      jusqua: params.jusqua,
      page: Number(params.page) || 1,
    }),
    famillesAudit(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Journal d&apos;audit</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Qui a fait quoi, quand, et sur quel dossier. {journal.total} action(s) enregistrée(s).
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/parametres">
            <ArrowLeft aria-hidden />
            Paramètres
          </Link>
        </Button>
      </div>

      <VueAudit
        journal={journal}
        familles={familles}
        action={params.action ?? ""}
        depuis={params.depuis ?? ""}
        jusqua={params.jusqua ?? ""}
      />
    </div>
  );
}
