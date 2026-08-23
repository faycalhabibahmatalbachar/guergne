import type { Metadata } from "next";
import Link from "next/link";

import { sql } from "drizzle-orm";
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
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/parametres">
          <ArrowLeft aria-hidden />
          Retour aux paramètres
        </Link>
      </Button>

      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Notifications</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {avecApp} tuteur(s) sur {total} ont l&apos;application installée, soit {part} %. Les
          autres ne sont joignables que par SMS — et chaque SMS est facturé.
        </p>
      </div>

      <TablePolitiques lignes={lignes} seuilIncident={seuil.rows[0]?.valeur ?? "MOYENNE"} />
    </div>
  );
}
