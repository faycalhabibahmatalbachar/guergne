import Link from "next/link";
import {
  ArrowRight, Bell, BookOpen, Calculator, CalendarDays,
  ClipboardCheck, GraduationCap, KeyRound, School,
  ScrollText, Wallet, type LucideIcon,
} from "lucide-react";

import type { SettingsCard } from "../settings-catalog";

const STYLE: Record<string, {
  icon: LucideIcon;
  iconClass: string;
  iconBg: string;
  badge: string;
  tag: string;
  hero?: string;
}> = {
  identite: {
    icon: School,
    iconClass: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    tag: "Configuration",
    hero: "border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/90 dark:border-blue-900/40 dark:from-card dark:via-card dark:to-blue-950/20",
  },
  annees: {
    icon: CalendarDays,
    iconClass: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/60",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    tag: "Configuration",
    hero: "border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50/80 dark:border-emerald-900/40 dark:from-card dark:via-card dark:to-emerald-950/20",
  },
  matieres: {
    icon: BookOpen,
    iconClass: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    badge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    tag: "Pédagogie",
  },
  coefficients: {
    icon: Calculator,
    iconClass: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    badge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    tag: "Pédagogie",
  },
  classes: {
    icon: GraduationCap,
    iconClass: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    badge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    tag: "Pédagogie",
  },
  parents: {
    icon: KeyRound,
    iconClass: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    tag: "Communication",
  },
  notifications: {
    icon: Bell,
    iconClass: "text-blue-700 dark:text-blue-300",
    iconBg: "bg-blue-100 dark:bg-blue-950/60",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    tag: "Communication",
  },
  finances: {
    icon: Wallet,
    iconClass: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/60",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    tag: "Finances",
  },
  diagnostic: {
    icon: ClipboardCheck,
    iconClass: "text-amber-700 dark:text-amber-300",
    iconBg: "bg-amber-100 dark:bg-amber-950/60",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    tag: "Contrôle",
  },
  audit: {
    icon: ScrollText,
    iconClass: "text-violet-700 dark:text-violet-300",
    iconBg: "bg-violet-100 dark:bg-violet-950/60",
    badge: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    tag: "Contrôle",
  },
};

const GROUPS = [
  {
    id: "ÉTABLISSEMENT",
    slug: "etablissement",
    title: "Établissement",
    description: "Informations générales et organisation de votre lycée.",
    icon: School,
    iconStyle: "text-blue-600",
    grid: "lg:grid-cols-2",
  },
  {
    id: "SCOLARITÉ ET PÉDAGOGIE",
    slug: "scolarite",
    title: "Scolarité & pédagogie",
    description: "Configurez la structure pédagogique de votre établissement.",
    icon: GraduationCap,
    iconStyle: "text-indigo-600",
    grid: "lg:grid-cols-3",
  },
  {
    id: "COMMUNICATION",
    slug: "communication",
    title: "Communication",
    description: "Définissez les règles de contact avec les responsables d'élèves.",
    icon: Bell,
    iconStyle: "text-blue-600",
    grid: "lg:grid-cols-2",
  },
  {
    id: "FINANCES ET CONTRÔLE",
    slug: "controle",
    title: "Finances & contrôle",
    description: "Paramètres financiers, vérifications et traçabilité.",
    icon: Wallet,
    iconStyle: "text-emerald-600",
    grid: "lg:grid-cols-3",
  },
] as const;

function CarteParametre({ item, hero }: { item: SettingsCard; hero: boolean }) {
  const meta = STYLE[item.id];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-label={item.action + " : " + item.label}
      className={
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border p-4 shadow-sm outline-none transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:p-5 dark:border-border dark:bg-card " +
        (hero
          ? "min-h-[174px] " + (meta.hero ?? "")
          : "min-h-[156px] border-slate-200/80 bg-white")
      }
    >
      {hero ? (
        <Icon
          className={"pointer-events-none absolute -right-3 top-3 size-28 opacity-[0.07] sm:size-32 " + meta.iconClass}
          strokeWidth={1.3}
          aria-hidden
        />
      ) : null}
      <div className="relative flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        <span className={"flex size-12 shrink-0 items-center justify-center rounded-xl sm:size-14 " + meta.iconBg}>
          <Icon className={"size-6 sm:size-7 " + meta.iconClass} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold leading-snug text-slate-950 sm:text-[15px] dark:text-foreground">
              {item.label}
            </h3>
            <span className={"rounded-md px-2 py-0.5 text-[10px] font-semibold " + meta.badge}>
              {meta.tag}
            </span>
          </div>
          <p className="mt-2 max-w-md text-[12px] leading-relaxed text-slate-500 sm:text-[13px] dark:text-muted-foreground">
            {item.description}
          </p>
        </div>
      </div>
      <div className="relative mt-4 flex justify-end">
        <span
          className={
            "inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition-colors " +
            (hero
              ? "border-blue-600 bg-blue-600 text-white group-hover:bg-blue-700"
              : "border-slate-200 bg-white text-blue-700 group-hover:border-blue-200 group-hover:bg-blue-50 dark:border-border dark:bg-card dark:text-blue-300 dark:group-hover:bg-blue-950/30")
          }
        >
          {item.action}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export function SettingsCards({ items }: { items: SettingsCard[] }) {
  if (!items.length) {
    return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Aucun réglage accessible avec votre compte.</p>;
  }

  return (
    <div className="space-y-6 pb-4 sm:space-y-7">
      {GROUPS.map((group) => {
        const groupCards = items.filter((item) => item.group === group.id);
        if (!groupCards.length) return null;
        const GroupIcon = group.icon;
        return (
          <section
            id={"parametres-" + group.slug}
            key={group.id}
            aria-labelledby={"titre-" + group.slug}
            className="scroll-mt-24 space-y-3"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50/80 dark:bg-muted/30">
                <GroupIcon className={"size-5 " + group.iconStyle} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id={"titre-" + group.slug} className="text-base font-bold leading-tight tracking-tight text-slate-950 dark:text-foreground">
                  {group.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500 sm:text-[13px] dark:text-muted-foreground">
                  {group.description}
                </p>
              </div>
            </div>
            <div className={"grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 " + group.grid}>
              {groupCards.map((item) => (
                <CarteParametre key={item.id} item={item} hero={group.slug === "etablissement"} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
