"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, History, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsSearch, type SettingsSection } from "./settings-navigation";

export function SettingsPageHeading({
  items,
  lyceeName,
  peutAuditer,
}: {
  items: SettingsSection[];
  lyceeName: string;
  peutAuditer: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const communication = pathname === "/dashboard/parametres" && params.get("section") === "communication";

  return (
    <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-border">
      <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-muted-foreground">
        <Link href="/dashboard/default" className="hover:text-blue-700 hover:underline">Tableau de bord</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        {communication ? (
          <>
            <Link href="/dashboard/parametres" className="hover:text-blue-700 hover:underline">Paramètres</Link>
            <ChevronRight className="size-3.5" aria-hidden />
            <span aria-current="page" className="font-semibold text-slate-700 dark:text-foreground">Communication</span>
          </>
        ) : (
          <span aria-current="page" className="font-medium text-slate-700 dark:text-foreground">Paramètres</span>
        )}
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {!communication ? (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
              <Settings2 className="size-6" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">
              {communication ? "Communication et familles" : "Paramètres"}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              {communication
                ? "Pilotez les invitations, les canaux de contact et le suivi des notifications aux familles."
                : "Configurez les règles de " + lyceeName + " selon vos autorisations."}
            </p>
          </div>
        </div>
        {communication ? (
          peutAuditer ? (
            <Button asChild variant="outline" className="h-9 shrink-0 gap-2 self-start border-slate-200 bg-white text-xs font-semibold shadow-none sm:self-center dark:border-border dark:bg-card">
              <Link href="/dashboard/parametres/audit">
                <History className="size-4" aria-hidden />
                Journal d'audit
              </Link>
            </Button>
          ) : null
        ) : (
          <SettingsSearch items={items} />
        )}
      </div>
    </header>
  );
}
