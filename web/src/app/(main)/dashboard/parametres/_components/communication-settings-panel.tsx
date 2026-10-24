import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  KeyRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { AccesModule } from "./settings-category-panel";
import type { SettingsCard } from "../settings-catalog";

export function CommunicationSettingsPanel({
  items,
  accesModules,
  joursInvitations,
  peutAuditer,
}: {
  items: SettingsCard[];
  accesModules: AccesModule[];
  joursInvitations: number | null;
  peutAuditer: boolean;
}) {
  const informations: { titre: string; detail: string }[] = [
    {
      titre: "Codes déjà créés",
      detail: "Changer la durée ne modifie pas la date d'expiration des invitations existantes.",
    },
    {
      titre: "Coût des SMS",
      detail: "Une politique utilisant les SMS peut entraîner des frais. Consultez l'impact avant de modifier les canaux.",
    },
    {
      titre: "Accès contrôlés",
      detail: "Chaque modification est vérifiée côté serveur selon les permissions du compte.",
    },
  ];

  return (
    <div className="min-w-0 space-y-6 pb-6">
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,290px)]">
        <section aria-labelledby="communication-reglages-titre" className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-border">
            <div>
              <h2 id="communication-reglages-titre" className="text-sm font-bold text-slate-950 sm:text-[15px] dark:text-foreground">
                Réglages de communication
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">
                Configurez les invitations et notifications selon vos autorisations.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-border">
            {items.map((item) => {
              const invitation = item.id === "parents";
              const Icon: LucideIcon = invitation ? KeyRound : Bell;
              const valeur = invitation && joursInvitations !== null
                ? String(joursInvitations) + (joursInvitations === 1 ? " jour" : " jours")
                : invitation ? null : "Par événement";
              return (
                <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-5 sm:flex-nowrap sm:gap-4 sm:px-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-foreground">
                      {invitation ? "Invitations et accès parents" : item.label}
                    </h3>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-600 dark:text-muted-foreground">
                      {invitation
                        ? "Durée de validité des codes d'activation des nouveaux comptes parents."
                        : "Canaux par événement, coûts d'envoi et seuil de signalement des incidents."}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-end gap-3 pl-[52px] sm:w-auto sm:pl-0">
                    {valeur ? (
                      <span className={"whitespace-nowrap text-xs font-semibold " + (invitation ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-muted-foreground")}>
                        {valeur}
                      </span>
                    ) : null}
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-label={"Configurer : " + item.label}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:text-blue-300 dark:hover:bg-muted"
                    >
                      Configurer
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside aria-labelledby="communication-regles-titre" className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:px-5 dark:border-border dark:bg-card">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <h2 id="communication-regles-titre" className="text-sm font-bold text-slate-950 dark:text-foreground">
              Règles à connaître
            </h2>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-muted-foreground">
            Ces paramètres définissent comment le lycée contacte les familles. Les opérations d'envoi restent dans les modules dédiés.
          </p>
          <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 dark:divide-border dark:border-border">
            {informations.map((info) => (
              <div key={info.titre} className="flex items-start gap-2.5 py-3">
                <Check className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-foreground">{info.titre}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-muted-foreground">{info.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {accesModules.length > 0 ? (
        <section aria-labelledby="communication-acces-titre" className="min-w-0 space-y-3">
          <div>
            <h2 id="communication-acces-titre" className="text-base font-bold tracking-tight text-slate-950 dark:text-foreground">
              Accès aux modules opérationnels
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
              Retrouvez les fonctionnalités de gestion, séparées des réglages du lycée.
            </p>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accesModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  prefetch={false}
                  className="group flex min-h-[88px] min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:hover:bg-muted/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-blue-700 dark:bg-muted dark:text-blue-300">
                    <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-900 dark:text-foreground">{module.titre}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-muted-foreground">{module.description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 group-hover:text-blue-700" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-label="Sécurité et traçabilité" className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5 dark:border-border dark:bg-card">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          <ShieldCheck className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-slate-900 dark:text-foreground">Sécurité et traçabilité</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-muted-foreground">
            Les changements de paramètres sont vérifiés côté serveur et consignés dans le journal d'audit.
          </p>
        </div>
        {peutAuditer ? (
          <Link
            href="/dashboard/parametres/audit"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-border dark:bg-card dark:text-blue-300"
          >
            Consulter le journal <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </section>
    </div>
  );
}
