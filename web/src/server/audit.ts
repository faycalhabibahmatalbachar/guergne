import "server-only";

import { headers } from "next/headers";

import { db } from "@/server/db";
import { journalAudit } from "@/server/db/schema";
import type { Principal } from "@/server/guard";

/**
 * Écriture au journal d'audit.
 *
 * Le journal est en append-only, protégé par un déclencheur PostgreSQL qui
 * refuse toute mise à jour et toute suppression. On y consigne le rôle et le
 * nom de l'acteur au moment de l'action : si son compte est supprimé plus
 * tard, la trace reste exploitable.
 *
 * Toute opération sensible passe ici : modification de note, changement de
 * statut d'élève, encaissement, sanction, publication de bulletin.
 */
export async function journaliser(
  acteur: Principal,
  entree: {
    action: string;
    entite: string;
    entiteId?: string | null;
    eleveId?: string | null;
    avant?: unknown;
    apres?: unknown;
    motif?: string | null;
  },
): Promise<void> {
  let ip: string | null = null;
  let agent: string | null = null;

  try {
    const entetes = await headers();
    // `x-forwarded-for` peut contenir une chaîne de relais : la première
    // adresse est celle du client.
    ip = entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    agent = entetes.get("user-agent");
  } catch {
    // Hors contexte de requête (script, tâche planifiée) : on journalise quand
    // même, sans les métadonnées réseau.
  }

  try {
    await db.insert(journalAudit).values({
      utilisateurId: acteur.id,
      roleActeur: acteur.role,
      nomActeur: `${acteur.prenom} ${acteur.nom}`,
      action: entree.action,
      entite: entree.entite,
      entiteId: entree.entiteId ?? null,
      eleveId: entree.eleveId ?? null,
      valeursAvant: entree.avant ?? null,
      valeursApres: entree.apres ?? null,
      motif: entree.motif ?? null,
      adresseIp: ip,
      userAgent: agent,
    });
  } catch (erreur) {
    // Un échec d'écriture au journal ne doit jamais faire échouer l'opération
    // métier elle-même — mais il doit être visible dans les logs serveur.
    console.error("[audit] écriture impossible :", erreur);
  }
}
