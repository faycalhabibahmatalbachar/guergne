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

import type { SettingsCard } from "../settings-catalog";

const STYLE: Record<
  string,
  {
    icon: LucideIcon;
    iconClass: string;
    iconBg: string;
    badge: string;
    tag: string;
  }
> = {
  identite: {
    icon: School,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
    tag: "Configuration",
  },
  annees: {
    icon: CalendarDays,
    iconClass: "text-succes",
    iconBg: "bg-succes-doux",
    badge: "bg-succes-doux text-succes",
    tag: "Configuration",
  },
  matieres: {
    icon: BookOpen,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
    tag: "Pédagogie",
  },
  coefficients: {
    icon: Calculator,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
    tag: "Pédagogie",
  },
  classes: {
    icon: GraduationCap,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
    tag: "Pédagogie",
  },
  parents: {
    icon: KeyRound,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
    tag: "Communication",
  },
  notifications: {
    icon: Bell,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
    tag: "Communication",
  },
  finances: {
    icon: Wallet,
    iconClass: "text-succes",
    iconBg: "bg-succes-doux",
    badge: "bg-succes-doux text-succes",
    tag: "Finances",
  },
  diagnostic: {
    icon: ClipboardCheck,
    iconClass: "text-alerte",
    iconBg: "bg-alerte-doux",
    badge: "bg-alerte-doux text-alerte",
    tag: "Contrôle",
  },
  audit: {
    icon: ScrollText,
    iconClass: "text-info",
    iconBg: "bg-info-doux",
    badge: "bg-info-doux text-info",
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
    iconStyle: "text-info",
    grid: "lg:grid-cols-2",
  },
  {
    id: "SCOLARITÉ ET PÉDAGOGIE",
    slug: "scolarite",
    title: "Scolarité & pédagogie",
    description: "Configurez la structure pédagogique de votre établissement.",
    icon: GraduationCap,
    iconStyle: "text-info",
    grid: "xl:grid-cols-3",
  },
  {
    id: "COMMUNICATION",
    slug: "communication",
    title: "Communication",
    description: "Définissez les règles de contact avec les responsables d'élèves.",
    icon: Bell,
    iconStyle: "text-info",
    grid: "lg:grid-cols-2",
  },
  {
    id: "FINANCES ET CONTRÔLE",
    slug: "controle",
    title: "Finances & contrôle",
    description: "Paramètres financiers, vérifications et traçabilité.",
    icon: Wallet,
    iconStyle: "text-succes",
    grid: "lg:grid-cols-3",
  },
] as const;

/**
 * Carte d'un réglage.
 *
 * Trois choses ont disparu ici, qui en faisaient trois cartes différentes :
 *
 * - le fond bleu des deux premières. Rien ne les distinguait vraiment des
 *   autres, et une teinte sans raison apprend à l'œil à ignorer la couleur ;
 * - le badge « Configuration », « Pédagogie », « Communication ». Il répétait
 *   mot pour mot le titre de la section posée trois lignes plus haut ;
 * - le faux bouton. Toute la carte est déjà un lien : un `span` qui a l'air
 *   d'un bouton à l'intérieur d'un lien promet une seconde action qui
 *   n'existe pas.
 */
function CarteParametre({ item }: { item: SettingsCard }) {
  const meta = STYLE[item.id];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-label={item.action + " : " + item.label}
      className="group flex h-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-carte outline-none transition-colors hover:border-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + meta.iconBg}>
          <Icon className={"size-5 " + meta.iconClass} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="min-w-0 font-medium text-base leading-snug">{item.label}</h3>
          <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">{item.description}</p>
        </div>
      </div>

      <span className="mt-auto inline-flex items-center gap-1.5 font-medium text-primary text-sm">
        {item.action}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export function SettingsCards({ items }: { items: SettingsCard[] }) {
  if (!items.length) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Aucun réglage accessible avec votre compte.
      </p>
    );
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
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-doux dark:bg-muted/30">
                <GroupIcon className={"size-5 " + group.iconStyle} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2
                  id={"titre-" + group.slug}
                  className="text-base font-bold leading-tight tracking-tight text-foreground"
                >
                  {group.title}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{group.description}</p>
              </div>
            </div>
            <div className={"grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 " + group.grid}>
              {groupCards.map((item) => (
                <CarteParametre key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
