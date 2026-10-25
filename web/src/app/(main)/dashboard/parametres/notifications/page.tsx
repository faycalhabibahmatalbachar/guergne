import type { Metadata } from "next";

import { sql } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

import { db } from "@/server/db";
import { exigerPage } from "@/server/guard";

import { TablePolitiques, type LignePolitique } from "./_components/table-politiques";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * Configuration des notifications.
 *
 * Séparée des autres paramètres, et protégée par son propre droit : régler les
 * canaux arbitre entre prévenir les familles et dépenser, ce qui relève du chef
 * d'établissement. Les années scolaires et les coefficients, eux, cassent les
 * bulletins s'ils sont mal touchés et restent au super-administrateur.
 */
export default async function PageNotifications() {
  await exigerPage("notification:configurer");

  const [politiques, seuil, appareils] = await Promise.all([
    db.execute<{
      type: string;
      libelle: string;
      politique: string;
      volume_attendu: string | null;
      description: string | null;
      deja_produites: number;
      cout_total_fcfa: number;
    }>(sql`SELECT * FROM v_couverture_notifications ORDER BY libelle`),

    db.execute<{ valeur: string }>(
      sql`SELECT valeur FROM parametres WHERE cle = 'notification_incident_gravite_min'`,
    ),

    // Combien de familles sont réellement joignables gratuitement : c'est le
    // chiffre qui rend les réglages intelligibles.
    db.execute<{ avec_app: number; total: number }>(sql`
      SELECT count(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM appareils a
                              WHERE a.utilisateur_id = t.utilisateur_id
                                AND a.actif AND a.jeton_fcm IS NOT NULL)
             ) AS avec_app,
             count(*) AS total
        FROM tuteurs t
    `),
  ]);

  const lignes: LignePolitique[] = politiques.rows.map((p) => ({
    type: p.type,
    libelle: p.libelle,
    politique: p.politique,
    volumeAttendu: p.volume_attendu,
    description: p.description,
    dejaProduites: Number(p.deja_produites),
    coutTotalFcfa: Number(p.cout_total_fcfa),
  }));

  const a = appareils.rows[0];
  const avecApp = Number(a?.avec_app ?? 0);
  const total = Number(a?.total ?? 0);
  const part = total > 0 ? Math.round((avecApp / total) * 100) : 0;

  return (
    <div className="min-w-0 space-y-4 pb-6 text-slate-950 dark:text-foreground">
      <header aria-label="En-tête des réglages de notification" className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-border">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[29px] font-bold leading-tight tracking-tight sm:text-[34px]">Notifications et SMS</h1>
            <span className="inline-flex items-center rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 tabular-nums dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              {lignes.length} {lignes.length > 1 ? "politiques" : "politique"}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-muted-foreground">
            {avecApp} tuteur(s) sur {total} disposent d’un appareil Push actif, soit {part} %.
            Les autres peuvent nécessiter un SMS selon leur numéro, leur consentement et la politique choisie.
          </p>
        </div>
        <Button asChild variant="outline" className="h-10 w-full shrink-0 gap-2 border-slate-200 bg-white px-3.5 text-slate-700 shadow-none sm:w-auto dark:border-border dark:bg-card dark:text-foreground">
          <Link href="/dashboard/parametres?section=communication">
            <ArrowLeft className="size-4" aria-hidden /> Retour aux réglages
          </Link>
        </Button>
      </header>

      <TablePolitiques lignes={lignes} seuilIncident={seuil.rows[0]?.valeur ?? "MOYENNE"} />
    </div>
  );
}
