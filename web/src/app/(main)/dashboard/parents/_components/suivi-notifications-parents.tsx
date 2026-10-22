"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Send, Wallet } from "lucide-react";
import type { EchecEnvoiParent, StatistiquesEnvoisParents } from "@/server/domain/suivi-notifications-parents";

export function SuiviNotificationsParents({ stats, echecs }: { stats: StatistiquesEnvoisParents; echecs: EchecEnvoiParent[] }) {
  const indicateurs = [
    { label: "Notifications créées", val: stats.total.toLocaleString("fr-FR"), icon: Send, style: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" },
    { label: "Envoyées / lues", val: (stats.envoyees + stats.lues).toLocaleString("fr-FR"), icon: CheckCircle2, style: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" },
    { label: "En attente", val: stats.enAttente.toLocaleString("fr-FR"), icon: Clock3, style: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" },
    { label: "Échecs", val: stats.echouees.toLocaleString("fr-FR"), icon: AlertTriangle, style: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" },
    { label: "Programmées", val: stats.programmees.toLocaleString("fr-FR"), icon: CalendarClock, style: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" },
    { label: "SMS facturés", val: stats.coutFcfa.toLocaleString("fr-FR") + " F", icon: Wallet, style: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  ];

  return <section aria-label="Suivi des notifications aux parents" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800 sm:px-5">
      <div><h2 className="text-sm font-bold text-[#0d1d3a] dark:text-white">Suivi des communications aux parents</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Envois individuels et groupés réalisés depuis le module · 30 derniers jours</p>
      </div>
      <Link href="/dashboard/communication" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-300">
        Voir la file de communication
      </Link>
    </header>
    <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 xl:grid-cols-6 sm:p-5">
      {indicateurs.map(i => <div key={i.label} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
        <span className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + i.style}><i.icon className="size-4.5" /></span>
        <div className="min-w-0"><p className="truncate text-lg font-bold tabular-nums text-slate-900 dark:text-white">{i.val}</p><p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{i.label}</p></div>
      </div>)}
    </div>
    {echecs.length > 0 && <div className="border-t border-slate-100 px-4 pb-4 dark:border-slate-800 sm:px-5">
      <h3 className="py-3 text-xs font-semibold text-red-700 dark:text-red-300">Derniers échecs — à examiner avant toute relance</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {echecs.map(e => <div key={e.id} className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50/40 p-3 text-xs dark:border-red-900/50 dark:bg-red-950/10">
          <div className="min-w-0"><p className="font-semibold text-slate-900 dark:text-white">{e.parent} · {e.canal}</p><p className="mt-1 truncate text-slate-600 dark:text-slate-300" title={e.titre}>{e.titre}</p><p className="mt-1 break-words text-red-700 dark:text-red-300">{e.erreur || "Erreur non détaillée"}</p></div>
          {e.tuteurId && <Link className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300" href={"/dashboard/parents/" + e.tuteurId + "#historique-notifications"}>Dossier</Link>}
        </div>)}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Les échecs ne sont jamais renvoyés automatiquement par ce tableau. Vérifiez le numéro, le consentement et l’historique avant toute nouvelle communication.</p>
    </div>}
  </section>;
}
