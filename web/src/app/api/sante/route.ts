import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Sonde de santé.
 *
 * Deux usages :
 *  1. Vérifier que l'application ET la base répondent (supervision, déploiement).
 *  2. Maintenir le compute Neon éveillé pendant les heures de classe. Neon met
 *     le compute en veille après inactivité ; le premier appel coûte alors
 *     ~500 ms. Une tâche planifiée appelant cette route toutes les 10 minutes
 *     de 6h à 19h du lundi au samedi rend ce réveil invisible aux utilisateurs.
 *
 * Aucune authentification, aucune écriture, aucune donnée métier exposée.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const debut = Date.now();

  try {
    await db.execute(sql`SELECT 1`);

    return Response.json({
      statut: "ok",
      base: "connectee",
      latence_ms: Date.now() - debut,
      horodatage: new Date().toISOString(),
    });
  } catch (erreur) {
    // Le message d'erreur brut peut contenir la chaîne de connexion :
    // on ne le renvoie jamais au client, on le laisse dans les journaux.
    console.error("[sante] base injoignable :", erreur);

    return Response.json(
      {
        statut: "degrade",
        base: "injoignable",
        latence_ms: Date.now() - debut,
        horodatage: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
