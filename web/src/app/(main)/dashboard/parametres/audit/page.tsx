import { Activity, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { acteursAudit, famillesAudit, listerAudit } from "@/server/domain/audit";
import { exigerPage } from "@/server/guard";

import { VueAudit } from "./vue-audit";

export const metadata: Metadata = { title: "Journal d'audit et traçabilité" };
export const dynamic = "force-dynamic";

export default async function PageAudit({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    entite?: string;
    eleve?: string;
    acteur?: string;
    recherche?: string;
    depuis?: string;
    jusqua?: string;
    correlation?: string;
    page?: string;
  }>;
}) {
  // Ne jamais charger les données d'audit avant la vérification serveur.
  await exigerPage("audit:lire");
  const p = await searchParams;
  const [journal, familles, acteurs] = await Promise.all([
    listerAudit({
      action: p.action,
      entite: p.entite,
      eleveId: p.eleve,
      acteurId: p.acteur,
      recherche: p.recherche,
      depuis: p.depuis,
      jusqua: p.jusqua,
      correlation: p.correlation,
      page: Number(p.page) || 1,
    }),
    famillesAudit(),
    acteursAudit(),
  ]);

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-muted/40 text-foreground">
            <Activity className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Journal d&apos;audit</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Qui a fait quoi, quand, comment, sur quel dossier, et ce qui a changé.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-succes-trait bg-succes-doux px-3 py-2 text-xs font-semibold text-succes">
          <ShieldCheck className="size-4" aria-hidden />
          Consultation réservée aux personnes autorisées
        </span>
      </header>
      <VueAudit
        journal={journal}
        familles={familles}
        acteurs={acteurs}
        filtres={{
          action: p.action ?? "",
          entite: p.entite ?? "",
          acteur: p.acteur ?? "",
          recherche: p.recherche ?? "",
          depuis: p.depuis ?? "",
          jusqua: p.jusqua ?? "",
          correlation: p.correlation ?? "",
        }}
      />
    </div>
  );
}
