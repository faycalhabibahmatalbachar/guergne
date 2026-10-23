import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";
import { exigerSession, peut } from "@/server/guard";

import { SettingsNavigation } from "./_components/settings-navigation";
import { SETTINGS_CARDS, SETTINGS_PERMISSIONS } from "./settings-catalog";

export default async function LayoutParametres({ children }: { children: ReactNode }) {
  const principal = await exigerSession();
  const resultats = await Promise.all(SETTINGS_PERMISSIONS.map((droit) => peut(principal, droit)));
  const autorises = new Set(SETTINGS_PERMISSIONS.filter((_, i) => resultats[i]));
  const items = SETTINGS_CARDS.filter((s) => s.droits.some((droit) => autorises.has(droit)))
    .map(({ droits: _droits, description: _description, action: _action, ...item }) => item);

  if (!items.length) redirect("/unauthorized");

  return (
    <div className="min-w-0 space-y-5 pb-8 text-slate-950 dark:text-foreground">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-border">
        <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-muted-foreground">
          <Link href="/dashboard/default" className="hover:text-blue-700 hover:underline">Tableau de bord</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page">Paramètres</span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            <Settings2 className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">Paramètres</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              Configurez les règles de {APP_CONFIG.name} selon vos autorisations.
            </p>
          </div>
        </div>
      </header>

      <SettingsNavigation items={items} />
      <section aria-label="Contenu des paramètres" className="min-w-0">
        {children}
      </section>
    </div>
  );
}
