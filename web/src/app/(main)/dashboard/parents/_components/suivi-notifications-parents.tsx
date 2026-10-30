"use client";

import Link from "next/link";

import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Send, Wallet } from "lucide-react";

import type { EchecEnvoiParent, StatistiquesEnvoisParents } from "@/server/domain/suivi-notifications-parents";

export function SuiviNotificationsParents({
  stats,
  echecs,
}: {
  stats: StatistiquesEnvoisParents;
  echecs: EchecEnvoiParent[];
}) {
  const indicateurs = [
    {
      label: "Notifications créées",
      val: stats.total.toLocaleString("fr-FR"),
      icon: Send,
      style: "bg-info-doux text-info",
    },
    {
      label: "Envoyées / lues",
      val: (stats.envoyees + stats.lues).toLocaleString("fr-FR"),
      icon: CheckCircle2,
      style: "bg-succes-doux text-succes",
    },
    {
      label: "En attente",
      val: stats.enAttente.toLocaleString("fr-FR"),
      icon: Clock3,
      style: "bg-alerte-doux text-alerte",
    },
    {
      label: "Échecs",
      val: stats.echouees.toLocaleString("fr-FR"),
      icon: AlertTriangle,
      style: "bg-danger-doux text-danger",
    },
    {
      label: "Programmées",
      val: stats.programmees.toLocaleString("fr-FR"),
      icon: CalendarClock,
      style: "bg-info-doux text-info",
    },
    {
      label: "SMS facturés",
      val: stats.coutFcfa.toLocaleString("fr-FR") + " F",
      icon: Wallet,
      style: "bg-muted text-foreground",
    },
  ];

  return (
    <section
      aria-label="Suivi des notifications aux parents"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-sm font-bold text-foreground dark:text-primary-foreground">
            Suivi des communications aux parents
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Envois individuels et groupés réalisés depuis le module · 30 derniers jours
          </p>
        </div>
        <Link
          href="/dashboard/communication"
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-succes hover:bg-succes-doux/90"
        >
          Voir la file de communication
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 xl:grid-cols-6 sm:p-5">
        {indicateurs.map((i) => (
          <div key={i.label} className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
            <span className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + i.style}>
              <i.icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold tabular-nums text-foreground dark:text-primary-foreground">
                {i.val}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">{i.label}</p>
            </div>
          </div>
        ))}
      </div>
      {echecs.length > 0 && (
        <div className="border-t border-border px-4 pb-4 sm:px-5">
          <h3 className="py-3 text-xs font-semibold text-danger">Derniers échecs — à examiner avant toute relance</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {echecs.map((e) => (
              <div
                key={e.id}
                className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-danger-trait bg-danger-doux p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground dark:text-primary-foreground">
                    {e.parent} · {e.canal}
                  </p>
                  <p className="mt-1 truncate text-muted-foreground" title={e.titre}>
                    {e.titre}
                  </p>
                  <p className="mt-1 break-words text-danger">{e.erreur || "Erreur non détaillée"}</p>
                </div>
                {e.tuteurId && (
                  <Link
                    className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 font-semibold text-info hover:bg-info-doux/90"
                    href={"/dashboard/parents/" + e.tuteurId + "#historique-notifications"}
                  >
                    Dossier
                  </Link>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Les échecs ne sont jamais renvoyés automatiquement par ce tableau. Vérifiez le numéro, le consentement et
            l’historique avant toute nouvelle communication.
          </p>
        </div>
      )}
    </section>
  );
}
