import Link from "next/link";
import { ArrowRight, Bell, ChevronRight, KeyRound, ShieldCheck } from "lucide-react";

import type { AccesModule } from "./settings-category-panel";
import type { SettingsCard } from "../settings-catalog";

/**
 * Les mêmes conventions visuelles que les listes Élèves et Parents :
 * cartes métriques compactes, actions alignées et accès rapides dans une seule
 * surface. La configuration reste séparée des opérations d'envoi.
 */
export function CommunicationSettingsPanel({
  items,
  accesModules,
  joursInvitations,
  nombrePolitiques,
}: {
  items: SettingsCard[];
  accesModules: AccesModule[];
  joursInvitations: number | null;
  nombrePolitiques: number | null;
}) {
  const invitations = items.find((item) => item.id === "parents");
  const notifications = items.find((item) => item.id === "notifications");

  return (
    <div className="min-w-0 space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <section aria-labelledby="communication-reglages-titre" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="communication-reglages-titre" className="text-base font-bold tracking-tight">
              Réglages de communication
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              Règles applicables aux invitations et aux notifications des familles.
            </p>
          </div>
          <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 tabular-nums dark:border-border dark:bg-card dark:text-muted-foreground">
            {items.length} {items.length > 1 ? "réglages accessibles" : "réglage accessible"}
          </span>
        </div>

        <div className="grid min-w-0 items-stretch gap-3 sm:grid-cols-2">
          {invitations ? (
            <article className="flex min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <KeyRound className="size-6" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-semibold text-slate-600 dark:text-muted-foreground">Invitations parents</h3>
                  <p className="mt-1 text-[27px] font-bold leading-none tracking-tight tabular-nums">
                    {joursInvitations === null ? "—" : `${joursInvitations} ${joursInvitations === 1 ? "jour" : "jours"}`}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                    Validité des nouveaux codes d’activation
                  </p>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-border">
                <p className="max-w-[290px] text-xs leading-5 text-slate-500 dark:text-muted-foreground">
                  Les codes déjà émis conservent leur échéance.
                </p>
                <Link
                  href={invitations.href}
                  prefetch={false}
                  aria-label="Configurer les invitations parents"
                  className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted"
                >
                  Configurer <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </article>
          ) : null}

          {notifications ? (
            <article className="flex min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                  <Bell className="size-6" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-semibold text-slate-600 dark:text-muted-foreground">Notifications et SMS</h3>
                  <p className="mt-1 text-[27px] font-bold leading-none tracking-tight tabular-nums">
                    {nombrePolitiques === null ? "Règles d’envoi" : `${nombrePolitiques} ${nombrePolitiques === 1 ? "politique" : "politiques"}`}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                    Paramétrage par type d’événement
                  </p>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-border">
                <p className="max-w-[290px] text-xs leading-5 text-slate-500 dark:text-muted-foreground">
                  Canaux Push, SMS et suivi des coûts.
                </p>
                <Link
                  href={notifications.href}
                  prefetch={false}
                  aria-label="Configurer les notifications et SMS"
                  className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted"
                >
                  Configurer <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      {accesModules.length > 0 ? (
        <section aria-labelledby="communication-acces-titre" className="min-w-0 space-y-3">
          <div>
            <h2 id="communication-acces-titre" className="text-base font-bold tracking-tight">
              Accès rapides
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              Retrouvez les modules de gestion sans quitter votre espace de travail.
            </p>
          </div>
          <div className="min-w-0 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:divide-border dark:border-border dark:bg-card">
            {accesModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  prefetch={false}
                  aria-label={`Ouvrir : ${module.titre}`}
                  className="group flex min-h-[72px] min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 sm:px-5 dark:hover:bg-muted/50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors group-hover:border-emerald-200 group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:border-border dark:bg-muted dark:text-muted-foreground">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-950 dark:text-foreground">{module.titre}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-muted-foreground">{module.description}</span>
                  </span>
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors group-hover:border-emerald-200 group-hover:text-emerald-700 dark:border-border dark:bg-card dark:text-muted-foreground">
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Accès et modifications contrôlés selon les permissions de chaque compte ; changements consignés dans le journal d’audit.</p>
      </div>
    </div>
  );
}
