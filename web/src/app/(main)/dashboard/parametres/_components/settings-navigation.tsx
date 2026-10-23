"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell, BookOpen, Calculator, CalendarDays, ClipboardCheck, GraduationCap,
  KeyRound, Search, School, ScrollText, ShieldCheck, Wallet, X,
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
  { id: "ÉTABLISSEMENT", label: "Établissement" },
  { id: "SCOLARITÉ ET PÉDAGOGIE", label: "Scolarité & pédagogie" },
  { id: "COMMUNICATION", label: "Communication" },
  { id: "FINANCES ET CONTRÔLE", label: "Finances & contrôle" },
] as const;

function normalize(value: string) {
  return value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Navigation horizontale : une rangée de catégories et une rangée de réglages.
 * Ne pas réintroduire le panneau latéral à défilement indépendant.
 * Tous les liens sont filtrés côté serveur dans le layout.
 */
export function SettingsNavigation({ items }: { items: SettingsSection[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [homeGroup, setHomeGroup] = useState<string | null>(null);
  const isOverview = pathname === "/dashboard/parametres" && !params.get("onglet");

  const activeHref = pathname === "/dashboard/parametres"
    ? "/dashboard/parametres?onglet=" + (params.get("onglet") ?? "")
    : pathname;

  const active = items.find((item) => item.href === activeHref) ?? items[0] ?? null;
  const group = active?.group;
  const siblings = items.filter((item) => item.group === group);
  const activeGroups = GROUPS.filter((g) => items.some((item) => item.group === g.id));
  const anchors: Record<string, string> = {
    "ÉTABLISSEMENT": "etablissement",
    "SCOLARITÉ ET PÉDAGOGIE": "scolarite",
    "COMMUNICATION": "communication",
    "FINANCES ET CONTRÔLE": "controle",
  };

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return items.filter((item) =>
      normalize(item.label + " " + item.keywords + " " + item.group).includes(q),
    );
  }, [items, query]);

  return (
    <div className="min-w-0 overflow-visible rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 dark:border-border">
        <nav aria-label="Catégories des paramètres" className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex w-max min-w-full items-center gap-1.5">
            {activeGroups.map((g) => {
              const first = items.find((item) => item.group === g.id);
              if (!first) return null;
              const selected = isOverview
                ? (homeGroup ?? group) === g.id
                : group === g.id;
              return (
                <Link
                  key={g.id}
                  href={"/dashboard/parametres#parametres-" + anchors[g.id]}
                  prefetch={false}
                  onClick={() => setHomeGroup(g.id)}
                  aria-current={selected ? "location" : undefined}
                  className={
                    "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
                    (selected
                      ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground")
                  }
                >
                  {g.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="relative w-full shrink-0 sm:w-56 lg:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
            placeholder="Rechercher un réglage…"
            aria-label="Rechercher un paramètre du lycée"
            aria-controls={query.trim() ? "settings-search-results" : undefined}
            className="h-9 rounded-lg border-slate-200 bg-slate-50 pr-9 pl-9 text-sm shadow-none dark:border-border dark:bg-background"
          />
          {query ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-muted"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}

          {query.trim() ? (
            <div
              id="settings-search-results"
              role="region"
              aria-label="Résultats de recherche des paramètres"
              className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl sm:right-0 sm:left-auto sm:w-80 dark:border-border dark:bg-card"
            >
              {results.length ? results.map((item) => {
                const Icon = ICONS[item.icon] ?? ShieldCheck;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setQuery("")}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-foreground dark:hover:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-blue-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground">Ouvrir</span>
                  </Link>
                );
              }) : (
                <p role="status" className="px-3 py-4 text-sm text-muted-foreground">
                  Aucun réglage ne correspond à « {query} ».
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {!isOverview ? (
      <nav aria-label="Rubriques des paramètres" className="min-w-0 overflow-x-auto px-3 sm:px-4">
        <div className="flex w-max min-w-full items-center gap-1 sm:gap-2">
          {siblings.map((item) => {
            const Icon = ICONS[item.icon] ?? ShieldCheck;
            const selected = item.href === activeHref;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                aria-current={selected ? "page" : undefined}
                className={
                  "inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 " +
                  (selected
                    ? "border-blue-600 text-blue-700 dark:text-blue-300"
                    : "border-transparent text-slate-600 hover:border-slate-200 hover:text-slate-950 dark:text-muted-foreground dark:hover:text-foreground")
                }
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      ) : null}
    </div>
  );
}
