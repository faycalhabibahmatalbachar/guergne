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
 * Page Communication: dense, predictable cards that follow the visual system
 * of Élèves and Parents. Existing server values and permission-filtered
 * links only; no new operations, indicators or communication policies.
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
    <div className="min-w-0 space-y-5 pb-6">
      <section aria-labelledby="communication-reglages-titre" className="min-w-0 space-y-3">
        <div>
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
              ? joursInvitations === null
                ? "Non disponible"
                : String(joursInvitations) + (joursInvitations === 1 ? " jour" : " jours")
              : "Selon l'événement";

            return (
              <article
                key={item.id}
                className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-border dark:bg-card"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold leading-5 text-slate-950 dark:text-foreground">
                      {invitation ? "Invitations et accès parents" : "Notifications et SMS"}
                    </h3>
                    <p className="mt-1 text-[13px] leading-5 text-slate-600 dark:text-muted-foreground">
                      {invitation
                        ? "Durée de validité des codes d'activation des nouveaux comptes parents."
                        : "Canaux par événement, coûts SMS et seuil des incidents."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex min-w-0 flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-600 dark:text-muted-foreground">
                      {invitation ? "Validité des nouveaux codes" : "Politique de notification"}
                    </p>
                    <p className="mt-0.5 text-base font-bold leading-6 text-slate-950 tabular-nums dark:text-foreground">
                      {valeur}
                    </p>
                  </div>
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-label={"Configurer : " + item.label}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:text-blue-300 dark:hover:bg-muted"
                  >
                    Configurer
                    <ArrowRight className="size-4" aria-hidden />
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

          <div className="grid min-w-0 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accesModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  prefetch={false}
                  aria-label={"Ouvrir : " + module.titre}
                  className="group flex min-h-[96px] min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:hover:bg-muted/40"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-blue-700 dark:bg-muted dark:text-blue-300">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-slate-950 dark:text-foreground">
                      {module.titre}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-slate-600 dark:text-muted-foreground">
                      {module.description}
                    </span>
                  </span>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-blue-700 dark:group-hover:bg-muted">
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
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
