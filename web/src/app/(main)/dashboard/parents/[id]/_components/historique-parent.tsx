"use client";

import { useState } from "react";
import { CalendarDays, Filter, MessageSquare, Send } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";
import type { NotificationTuteur } from "@/server/domain/parents";

const dateHeure = (v: string | null) => v ? new Date(v).toLocaleString("fr-FR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "—";

const etat = (valeur: string) => {
  switch (valeur) {
    case "ENVOYE": return ["Envoyé", "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", "bg-emerald-500"];
    case "LU": return ["Lu", "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", "bg-blue-500"];
    case "ECHOUE": return ["Échoué", "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", "bg-red-500"];
    case "EN_ATTENTE": return ["En attente", "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300", "bg-amber-500"];
    default: return [valeur.replaceAll("_", " ").toLowerCase(), "bg-slate-100 text-slate-700", "bg-slate-500"];
  }
};

export function HistoriqueParent({ notifications }: { notifications: NotificationTuteur[] }) {
  const [canal, setCanal] = useState("TOUS");
  const liste = canal === "TOUS" ? notifications : notifications.filter(n => n.canal === canal);
  return (
    <section id="historique-notifications" aria-label="Historique des messages au parent" className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-border sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950"><Send className="size-5" aria-hidden /></span>
          <div><h2 className="text-[16px] font-bold text-[#122449] dark:text-foreground">Ce qui lui a été envoyé</h2>
            <p className="text-xs text-slate-500 dark:text-muted-foreground">{notifications.length} notification{notifications.length > 1 ? "s" : ""} dans l’historique récent</p></div>
        </div>
        <label className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 dark:border-border dark:bg-card">
          <Filter className="size-4 text-slate-500" aria-hidden />
          <span className="sr-only">Filtrer le canal</span>
          <NativeSelect aria-label="Filtrer les notifications par canal" className="h-9 border-0 bg-transparent px-0 pr-2 text-xs shadow-none" value={canal} onChange={e => setCanal(e.target.value)}>
            <option value="TOUS">Tous les canaux</option>
            <option value="SMS">SMS</option>
            <option value="PUSH">Application</option>
            <option value="EMAIL">E-mail</option>
          </NativeSelect>
        </label>
      </header>
      {liste.length ? <div className="overflow-x-auto px-4 pb-4 sm:px-5">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead><tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-border dark:bg-muted/30">
            <th scope="col" className="px-3 py-3">Date</th><th scope="col" className="px-3 py-3">Objet</th>
            <th scope="col" className="px-3 py-3">Canal</th><th scope="col" className="px-3 py-3">État</th><th scope="col" className="px-3 py-3 text-right">Coût</th>
          </tr></thead>
          <tbody>
            {liste.map(n => {
              const [libelle, badge, point] = etat(n.statut);
              return <tr key={n.id} className="border-b border-slate-100 last:border-0 dark:border-border">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 tabular-nums dark:text-muted-foreground">{dateHeure(n.envoyeLe ?? n.creeLe)}</td>
                <td className="max-w-[460px] px-3 py-3">
                  <p className="break-words font-medium text-[#102249] dark:text-foreground">{n.titre}</p>
                  {n.erreur ? <p className="mt-1 break-words text-[11px] leading-relaxed text-red-600 dark:text-red-400">{n.erreur}</p> : null}
                </td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-border dark:text-muted-foreground">
                  <MessageSquare className="size-3.5" aria-hidden />{n.canal}</span></td>
                <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}><span className={`size-2 rounded-full ${point}`} />{libelle}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-medium tabular-nums text-slate-700 dark:text-foreground">{n.coutFcfa === null ? "—" : n.coutFcfa.toLocaleString("fr-FR") + " FCFA"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-500 dark:text-muted-foreground"><CalendarDays className="size-8 text-slate-300" aria-hidden />Aucune notification pour ce canal.</div>}
    </section>
  );
}
