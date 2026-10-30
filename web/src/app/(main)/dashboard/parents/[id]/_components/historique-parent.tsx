"use client";

import { useState } from "react";

import { CalendarDays, Filter, MessageSquare, Send } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";
import type { NotificationTuteur } from "@/server/domain/parents";

const dateHeure = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const etat = (valeur: string) => {
  switch (valeur) {
    case "ENVOYE":
      return ["Envoyé", "bg-succes-doux text-succes", "bg-succes"];
    case "LU":
      return ["Lu", "bg-info-doux text-info", "bg-primary"];
    case "ECHOUE":
      return ["Échoué", "bg-danger-doux text-danger", "bg-danger"];
    case "EN_ATTENTE":
      return ["En attente", "bg-alerte-doux text-alerte", "bg-alerte"];
    default:
      return [valeur.replaceAll("_", " ").toLowerCase(), "bg-muted text-foreground", "bg-muted"];
  }
};

export function HistoriqueParent({ notifications }: { notifications: NotificationTuteur[] }) {
  const [canal, setCanal] = useState("TOUS");
  const liste = canal === "TOUS" ? notifications : notifications.filter((n) => n.canal === canal);
  return (
    <section
      id="historique-notifications"
      aria-label="Historique des messages au parent"
      className="min-w-0 overflow-hidden rounded-[20px] border border-border bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-info-doux text-info">
            <Send className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Ce qui lui a été envoyé</h2>
            <p className="text-xs text-muted-foreground">
              {notifications.length} notification{notifications.length > 1 ? "s" : ""} dans l’historique récent
            </p>
          </div>
        </div>
        <label className="relative flex items-center gap-2 rounded-lg border border-border bg-card px-2.5">
          <Filter className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Filtrer le canal</span>
          <NativeSelect
            aria-label="Filtrer les notifications par canal"
            className="h-9 border-0 bg-transparent px-0 pr-2 text-xs shadow-none"
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
          >
            <option value="TOUS">Tous les canaux</option>
            <option value="SMS">SMS</option>
            <option value="PUSH">Application</option>
            <option value="EMAIL">E-mail</option>
          </NativeSelect>
        </label>
      </header>
      {liste.length ? (
        <div className="overflow-x-auto px-4 pb-4 sm:px-5">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground dark:bg-muted/30">
                <th scope="col" className="px-3 py-3">
                  Date
                </th>
                <th scope="col" className="px-3 py-3">
                  Objet
                </th>
                <th scope="col" className="px-3 py-3">
                  Canal
                </th>
                <th scope="col" className="px-3 py-3">
                  État
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Coût
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.map((n) => {
                const [libelle, badge, point] = etat(n.statut);
                return (
                  <tr key={n.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground tabular-nums">
                      {dateHeure(n.envoyeLe ?? n.creeLe)}
                    </td>
                    <td className="max-w-[460px] px-3 py-3">
                      <p className="break-words font-medium text-foreground">{n.titre}</p>
                      {n.erreur ? (
                        <p className="mt-1 break-words text-xs leading-relaxed text-danger">{n.erreur}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                        <MessageSquare className="size-3.5" aria-hidden />
                        {n.canal}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
                      >
                        <span className={`size-2 rounded-full ${point}`} />
                        {libelle}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-medium tabular-nums text-foreground">
                      {n.coutFcfa === null ? "—" : n.coutFcfa.toLocaleString("fr-FR") + " FCFA"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <CalendarDays className="size-8 text-muted-foreground" aria-hidden />
          Aucune notification pour ce canal.
        </div>
      )}
    </section>
  );
}
