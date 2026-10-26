"use client";

import { useState, useTransition } from "react";

import { FAILURE_ACTIONS, type FailureCategory } from "@/lib/communication-v2";
import type { readJournal } from "@/server/domain/communication-v2";

import { updateOutbox } from "../actions-v2";

const CHANNELS: Record<string, string> = {
  IN_APP: "Dans l’application",
  SMS: "SMS",
  PUSH: "Notification poussée",
  EMAIL: "Courriel",
};
const STATES: Record<string, string> = {
  EN_ATTENTE: "En attente",
  ENVOYE: "Envoyée (historique)",
  ECHOUE: "Échec",
  LU: "Lue",
  DRAFT: "Brouillon",
  SCHEDULED: "Programmée",
  QUEUED: "En file",
  PROCESSING: "En cours",
  ACCEPTED: "Acceptée",
  DELIVERED: "Délivrée",
  READ: "Lue",
  RETRYABLE: "À réessayer",
  FAILED: "Échec définitif",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
};
const date = (v: string) =>
  new Date(v).toLocaleString("fr-FR", { timeZone: "Africa/Ndjamena", dateStyle: "short", timeStyle: "medium" });
export function JournalV2({ rows }: { rows: Awaited<ReturnType<typeof readJournal>>["rows"] }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  return (
    <>
      <p role="status">{status}</p>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: la région débordante doit rester parcourable au clavier. */}
      <section className="table-responsive" tabIndex={0} aria-label="Journal des notifications, défilement horizontal">
        <table className="table">
          <caption>Notifications · heures du Tchad · numéros masqués</caption>
          <thead>
            <tr>
              {["Message", "Destinataire", "Canal", "Créée", "État et action conseillée", "Coût", "Détails"].map(
                (h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.title}
                  {row.simulated ? (
                    <p>
                      <strong>Simulation</strong>
                    </p>
                  ) : null}
                </td>
                <td>
                  {row.parent || "Responsable sans compte"}
                  <p>{row.phone ?? "Compte applicatif"}</p>
                </td>
                <td>{CHANNELS[row.channel] ?? row.channel}</td>
                <td>
                  <time dateTime={row.createdAt}>{date(row.createdAt)}</time>
                </td>
                <td>
                  {STATES[row.status] ?? row.status}
                  <p>
                    {row.category
                      ? (FAILURE_ACTIONS[row.category as FailureCategory] ??
                        "Examiner le journal et relancer en simulation")
                      : "—"}
                  </p>
                  {row.simulated && ["FAILED", "QUEUED", "SCHEDULED", "RETRYABLE", "DRAFT"].includes(row.status) ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await updateOutbox(row.outboxId ?? row.id, row.status === "FAILED" ? "retry" : "cancel");
                            setStatus("Action enregistrée.");
                          } catch {
                            setStatus("Action refusée ou état déjà modifié.");
                          }
                        })
                      }
                    >
                      {row.status === "FAILED" ? "Relancer en simulation" : "Annuler"}
                    </button>
                  ) : null}
                </td>
                <td>{row.cost === null ? "Non rapproché" : `${row.cost} FCFA`}</td>
                <td>
                  <details>
                    <summary>Voir les détails</summary>
                    <p>Référence : {row.reference ?? "Non disponible"}</p>
                    <p>Échéance : {date(row.nextAttempt)}</p>
                    <p>Identifiant : {row.id}</p>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p>Aucune notification pour ces filtres.</p> : null}
      </section>
    </>
  );
}
