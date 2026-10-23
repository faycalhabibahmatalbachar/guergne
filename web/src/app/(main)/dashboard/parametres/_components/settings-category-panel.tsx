import Link from "next/link";
import {
  ArrowRight, Bell, BookOpen, Calculator, CalendarDays,
  ClipboardCheck, GraduationCap, KeyRound, School,
  ScrollText, Wallet, type LucideIcon,
} from "lucide-react";

import type { SettingsCard } from "../settings-catalog";
import type { SETTINGS_CATEGORIES } from "@/navigation/sidebar/settings-categories";

type Category = (typeof SETTINGS_CATEGORIES)[number];

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

export function SettingsCategoryPanel({
  category,
  items,
}: {
  category: Category;
  items: SettingsCard[];
}) {
  const IconeCategorie = category.icon;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <IconeCategorie className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl dark:text-foreground">
              {category.heading}
            </h2>
            <p className="text-sm text-slate-500 dark:text-muted-foreground">
              {category.description}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs tabular-nums text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground">
          {items.length} {items.length > 1 ? "réglages" : "réglage"}
        </span>
      </div>

      <section aria-label={"Réglages : " + category.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="divide-y divide-slate-100 dark:divide-border">
          {items.map((item) => {
            const Icone = ICONS[item.icon] ?? School;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className="group flex min-h-20 items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:gap-4 sm:px-5 dark:hover:bg-muted/50"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-700 dark:border-border dark:bg-muted dark:text-muted-foreground">
                  <Icone className="size-5" strokeWidth={1.9} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-950 dark:text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500 sm:text-[13px] dark:text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                  <span className="hidden sm:inline">{item.action}</span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-slate-500 dark:text-muted-foreground">
        Seuls les réglages correspondant à vos autorisations sont affichés. Les modifications sont contrôlées côté serveur.
      </p>
    </div>
  );
}
