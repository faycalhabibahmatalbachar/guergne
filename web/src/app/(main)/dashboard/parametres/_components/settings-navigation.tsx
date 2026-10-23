"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell, BookOpen, Calculator, CalendarDays, ChevronDown,
  ClipboardCheck, GraduationCap, KeyRound, Menu, Search,
  School, ScrollText, ShieldCheck, Wallet, X,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";

export type SettingsSection = {
  id: string;
  label: string;
  group: "ÉTABLISSEMENT" | "SCOLARITÉ ET PÉDAGOGIE" | "COMMUNICATION" | "FINANCES ET CONTRÔLE";
  href: string;
  icon: string;
  keywords: string;
};

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
  shield: ShieldCheck,
};

const GROUPS = [
  "ÉTABLISSEMENT",
  "SCOLARITÉ ET PÉDAGOGIE",
  "COMMUNICATION",
  "FINANCES ET CONTRÔLE",
] as const;

function normalize(value: string) {
  return value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function SettingsNavigation({ items }: { items: SettingsSection[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeHref = pathname === "/dashboard/parametres"
    ? "/dashboard/parametres?onglet=" + (params.get("onglet") ?? "")
    : pathname;

  const current = items.find((item) => item.href === activeHref) ?? null;
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.filter((item) =>
      normalize(item.label + " " + item.keywords + " " + item.group).includes(q),
    );
  }, [items, query]);

  return (
    <aside
      aria-label="Navigation des paramètres"
      className="min-w-0 self-start lg:sticky lg:top-20"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left font-semibold text-sm text-slate-900 lg:hidden dark:text-foreground"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="settings-navigation-items"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Menu className="size-4 shrink-0 text-blue-600" aria-hidden />
            <span className="truncate">{current?.label ?? "Choisir une rubrique"}</span>
          </span>
          <ChevronDown className={"size-4 shrink-0 transition-transform " + (mobileOpen ? "rotate-180" : "")} aria-hidden />
        </button>
        <div id="settings-navigation-items" className={(mobileOpen ? "block" : "hidden") + " border-t p-3 lg:block lg:border-t-0"}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un réglage…"
              aria-label="Rechercher un réglage"
              className="h-10 rounded-lg border-slate-200 bg-slate-50 pr-9 pl-9 shadow-none dark:border-border dark:bg-background"
            />
            {query ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <nav className="mt-3 max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto pr-1 lg:max-h-[calc(100vh-14rem)]" aria-label="Rubriques de configuration">
            {GROUPS.map((group) => {
              const groupItems = filtered.filter((item) => item.group === group);
              if (!groupItems.length) return null;
              return (
                <div key={group} className="space-y-1">
                  <p className="px-2 pb-1 text-[10px] font-bold tracking-wider text-slate-500 dark:text-muted-foreground">
                    {group}
                  </p>
                  {groupItems.map((item) => {
                    const Icon = ICONS[item.icon] ?? ShieldCheck;
                    const selected = item.href === activeHref;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        prefetch={false}
                        aria-current={selected ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={
                          "group flex min-h-10 items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 " +
                          (selected
                            ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground")
                        }
                      >
                        <Icon className="size-[17px] shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
            {!filtered.length ? (
              <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
                Aucun réglage ne correspond à « {query} ».
              </p>
            ) : null}
          </nav>
        </div>
      </div>
    </aside>
  );
}
