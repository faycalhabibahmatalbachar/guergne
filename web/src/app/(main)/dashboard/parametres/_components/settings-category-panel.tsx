import Link from "next/link";
import {
  ArrowRight, Bell, BookOpen, Calculator, CalendarDays,
  ClipboardCheck, GraduationCap, KeyRound, School,
  ScrollText, Wallet, type LucideIcon,
} from "lucide-react";

import type { SettingsCard } from "../settings-catalog";
import type { SETTINGS_CATEGORIES } from "@/navigation/sidebar/settings-categories";

type Category = (typeof SETTINGS_CATEGORIES)[number];

export interface IndicateurParametre {
  icone: LucideIcon;
  titre: string;
  valeur: string;
  precision: string;
}

export interface AccesModule {
  titre: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const ICONS: Record<string, LucideIcon> = {
  school: School,
  calendar: CalendarDays,
  book: BookOpen,
  calculator: Calculator,
  class: GraduationCap,
  parents: KeyRound,
  bell: Bell,
  wallet: Wallet,
  diagnostic: ClipboardCheck,
  audit: ScrollText,
};

/**
 * All category pages use the same dashboard layout:
 * - aligned top header, never centred in a narrow column
 * - optional REAL database-backed indicators, like Élèves/Classes/Parents
 * - compact setting rows with a single icon and fixed action alignment
 * - module shortcuts shown only if the actor can access their real routes
 */
export function SettingsCategoryPanel({
  category,
  items,
  indicateurs = [],
  accesModules = [],
}: {
  category: Category;
  items: SettingsCard[];
  indicateurs?: IndicateurParametre[];
  accesModules?: AccesModule[];
}) {
  const CategoryIcon = category.icon;

  return (
    <div className="min-w-0 space-y-4 pb-6">
      <header className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <CategoryIcon className="size-[19px]" strokeWidth={1.9} aria-hidden />
            </span>
            <h2 className="min-w-0 text-xl font-bold leading-tight tracking-tight text-slate-950 sm:text-[23px] dark:text-foreground">
              {category.heading}
            </h2>
          </div>
          <p className="mt-1.5 text-[13px] text-slate-500 sm:pl-[46px] dark:text-muted-foreground">
            {category.description}
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 self-start items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 tabular-nums sm:self-center dark:border-border dark:bg-card dark:text-muted-foreground">
          {items.length} {items.length > 1 ? "réglages disponibles" : "réglage disponible"}
        </span>
      </header>

      {indicateurs.length > 0 ? (
        <section aria-label={"Indicateurs de " + category.title} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {indicateurs.map((indicateur) => {
            const IconeIndicateur = indicateur.icone;
            return <div
              key={indicateur.titre}
              className="flex min-h-[94px] min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm dark:border-border dark:bg-card"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-slate-500 dark:text-muted-foreground">{indicateur.titre}</p>
                <p className="mt-1 truncate text-xl font-bold leading-tight tracking-tight text-slate-950 tabular-nums dark:text-foreground" title={indicateur.valeur}>
                  {indicateur.valeur}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-muted-foreground">{indicateur.precision}</p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <IconeIndicateur className="size-4" aria-hidden />
              </span>
            </div>;
          })}
        </section>
      ) : null}

      <div className={"grid min-w-0 items-start gap-4 " + (accesModules.length ? "xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]" : "")}>
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card" aria-label={"Réglages : " + category.title}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-border">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Configuration</h3>
            <span className="text-xs text-slate-500 tabular-nums dark:text-muted-foreground">{items.length} {items.length > 1 ? "options" : "option"}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-border">
            {items.map((item) => {
              const Icon = ICONS[item.icon] ?? School;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  aria-label={item.action + " : " + item.label}
                  className="group flex min-h-[82px] min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-5 dark:hover:bg-muted/50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-700 dark:border-border dark:bg-muted dark:text-muted-foreground">
                    <Icon className="size-[19px]" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-slate-950 dark:text-foreground">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">{item.description}</span>
                  </span>
                  <span className="ml-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-blue-700 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50 sm:min-w-24 dark:border-border dark:bg-card dark:text-blue-300">
                    <span className="hidden sm:inline">{item.action}</span>
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {accesModules.length > 0 ? (
          <aside className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card" aria-label="Accès aux modules du lycée">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-border">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Accès rapides</h3>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-muted-foreground">
                Ouvrir les modules opérationnels existants.
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-border">
              {accesModules.map((lien) => {
                const Icon = lien.icon;
                return (
                  <Link
                    href={lien.href}
                    key={lien.href}
                    prefetch={false}
                    className="group flex min-h-[68px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-5 dark:hover:bg-muted/50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-slate-800 dark:text-foreground">{lien.titre}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-muted-foreground">{lien.description}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-blue-600" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-muted-foreground">
        Les réglages et accès rapides affichés dépendent de vos permissions. Les modifications sont vérifiées côté serveur.
      </p>
    </div>
  );
}
