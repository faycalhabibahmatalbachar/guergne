import Link from "next/link";
import {
  ArrowRight,
  Bell,
  ChevronRight,
  KeyRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { AccesModule } from "./settings-category-panel";
import type { SettingsCard } from "../settings-catalog";

/**
 * Communication settings home: settings and day-to-day modules are two
 * distinct groups. One consistent card grid, with no secondary sidebar.
 * Values come only from existing configuration; no invented counters.
 */
export function CommunicationSettingsPanel({
  items,
  accesModules,
  joursInvitations,
}: {
  items: SettingsCard[];
  accesModules: AccesModule[];
  joursInvitations: number | null;
  peutAuditer: boolean;
}) {
  return (
    <div className="min-w-0 space-y-5 pb-6 sm:space-y-6">
      <section aria-labelledby="communication-reglages-titre" className="min-w-0 space-y-3">
        <div className="min-w-0">
          <h2 id="communication-reglages-titre" className="text-base font-bold tracking-tight text-slate-950 dark:text-foreground">
            Réglages de communication
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            Paramétrez les invitations des parents et les canaux de notification.
          </p>
        </div>
        <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const invitation = item.id === "parents";
            const Icon: LucideIcon = invitation ? KeyRound : Bell;
            const valeur = invitation
              ? joursInvitations !== null
                ? String(joursInvitations) + (joursInvitations === 1 ? " jour" : " jours")
                : "Non disponible"
              : "Selon l'événement";

            return (
              <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
                <div className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5 sm:py-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-slate-950 dark:text-foreground">
                      {invitation ? "Invitations et accès parents" : "Notifications et SMS"}
                    </h3>
                    <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-slate-600 dark:text-muted-foreground">
                      {invitation
                        ? "Définissez la durée de validité des codes d'activation des nouveaux comptes parents."
                        : "Configurez les canaux par événement, les coûts SMS et le seuil des incidents."}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-nowrap sm:px-5 dark:border-border dark:bg-muted/20">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">
                      {invitation ? "Validité des nouveaux codes" : "Politique de notification"}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-foreground">{valeur}</p>
                  </div>
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-label={"Configurer : " + item.label}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:text-blue-300 dark:hover:bg-muted"
                  >
                    Configurer <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {accesModules.length > 0 ? (
        <section aria-labelledby="communication-acces-titre" className="min-w-0 space-y-3">
          <div>
            <h2 id="communication-acces-titre" className="text-base font-bold tracking-tight text-slate-950 dark:text-foreground">
              Accès aux modules opérationnels
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
              Consultez les comptes parents, les invitations et les messages du lycée.
            </p>
          </div>
          <div className="grid min-w-0 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accesModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  prefetch={false}
                  className="group flex min-h-[96px] min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:hover:bg-muted/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-blue-700 dark:bg-muted dark:text-blue-300">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-foreground">{module.titre}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-slate-600 dark:text-muted-foreground">{module.description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-colors group-hover:text-blue-700" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="flex min-w-0 items-start gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500 dark:border-border dark:text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Les modifications de paramètres sont contrôlées côté serveur et consignées dans le journal d'audit.</p>
      </div>
    </div>
  );
}
