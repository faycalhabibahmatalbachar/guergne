"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell, BookOpen, Calculator, CalendarDays, ClipboardCheck,
  GraduationCap, KeyRound, Search, School, ScrollText, Wallet, X,
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
};

function normaliser(texte: string) {
  return texte.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Recherche globale : la navigation des groupes vit désormais uniquement dans la sidebar. */
export function SettingsSearch({ items }: { items: SettingsSection[] }) {
  const [query, setQuery] = useState("");
  const resultats = useMemo(() => {
    const q = normaliser(query.trim());
    return q ? items.filter((i) => normaliser(i.label + " " + i.keywords + " " + i.group).includes(q)) : [];
  }, [items, query]);

  return (
    <div className="relative w-full min-w-0 sm:w-72 lg:w-80">
      <Search className="pointer-events-none absolute left-3 top-[18px] size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
        placeholder="Rechercher un réglage…"
        aria-label="Rechercher un paramètre du lycée"
        aria-controls={query.trim() ? "settings-search-results" : undefined}
        className="h-9 rounded-lg border-slate-200 bg-white pl-9 pr-9 text-sm dark:border-border dark:bg-card"
      />
      {query ? (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => setQuery("")}
          className="absolute right-2 top-[18px] -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {query.trim() ? (
        <div
          id="settings-search-results"
          role="region"
          aria-label="Résultats de recherche des paramètres"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-border dark:bg-card"
        >
          {resultats.length ? resultats.map((item) => {
            const Icon = ICONS[item.icon] ?? School;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                onClick={() => setQuery("")}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-muted"
              >
                <Icon className="size-4 shrink-0 text-blue-600" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          }) : (
            <p role="status" className="px-3 py-4 text-sm text-muted-foreground">Aucun réglage trouvé.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
