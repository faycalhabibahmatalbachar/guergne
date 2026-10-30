import Link from "next/link";

import {
  ArrowRight,
  Bell,
  BookOpen,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  type LucideIcon,
  School,
  ScrollText,
  Wallet,
} from "lucide-react";

import type { SETTINGS_CATEGORIES } from "@/navigation/sidebar/settings-categories";

import type { SettingsCard } from "../settings-catalog";

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
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-doux text-info">
              <CategoryIcon className="size-[19px]" strokeWidth={1.9} aria-hidden />
            </span>
            <h2 className="min-w-0 text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
              {category.heading}
            </h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground sm:pl-[46px]">{category.description}</p>
        </div>
        <span className="inline-flex h-8 shrink-0 self-start items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground tabular-nums sm:self-center">
          {items.length} {items.length > 1 ? "réglages disponibles" : "réglage disponible"}
        </span>
      </header>

      {indicateurs.length > 0 ? (
        <section aria-label={"Indicateurs de " + category.title} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {indicateurs.map((indicateur) => {
            const IconeIndicateur = indicateur.icone;
            return (
              <div
                key={indicateur.titre}
                className="flex min-h-[94px] min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{indicateur.titre}</p>
                  <p
                    className="mt-1 truncate text-xl font-bold leading-tight tracking-tight text-foreground tabular-nums"
                    title={indicateur.valeur}
                  >
                    {indicateur.valeur}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{indicateur.precision}</p>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-doux text-info">
                  <IconeIndicateur className="size-4" aria-hidden />
                </span>
              </div>
            );
          })}
        </section>
      ) : null}

      <div
        className={
          "grid min-w-0 items-start gap-4 " +
          (accesModules.length ? "xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]" : "")
        }
      >
        <section
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          aria-label={"Réglages : " + category.title}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {items.length} {items.length > 1 ? "options" : "option"}
            </span>
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => {
              const Icon = ICONS[item.icon] ?? School;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  aria-label={item.action + " : " + item.label}
                  className="group flex min-h-[82px] min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-5 dark:hover:bg-muted/50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground group-hover:border-info-trait group-hover:bg-info-doux/90 group-hover:text-info">
                    <Icon className="size-[19px]" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-foreground">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                  </span>
                  <span className="ml-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-info transition-colors group-hover:border-info-trait group-hover:bg-info-doux/90 sm:min-w-24">
                    <span className="hidden sm:inline">{item.action}</span>
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {accesModules.length > 0 ? (
          <aside
            className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            aria-label="Accès aux modules du lycée"
          >
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-foreground">Accès rapides</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Ouvrir les modules opérationnels existants.</p>
            </div>
            <div className="divide-y divide-border">
              {accesModules.map((lien) => {
                const Icon = lien.icon;
                return (
                  <Link
                    href={lien.href}
                    key={lien.href}
                    prefetch={false}
                    className="group flex min-h-[68px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-5 dark:hover:bg-muted/50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{lien.titre}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{lien.description}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-info" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Les réglages et accès rapides affichés dépendent de vos permissions. Les modifications sont vérifiées côté
        serveur.
      </p>
    </div>
  );
}
