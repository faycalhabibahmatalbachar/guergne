"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Configuration des canaux de notification.
 *
 * Chaque type d'événement porte sa propre politique. C'est une décision
 * d'établissement, pas un réglage technique : elle arbitre entre prévenir les
 * familles et dépenser en SMS, et le chef d'établissement doit pouvoir la
 * prendre sans passer par un développeur.
 */

export const POLITIQUES = [
  {
    valeur: "PUSH_SINON_SMS",
    libelle: "Application, SMS en repli",
    explication:
      "Gratuit pour les parents équipés, SMS pour les autres. Le meilleur rapport coût/portée.",
  },
  {
    valeur: "PUSH_ET_SMS",
    libelle: "Application ET SMS",
    explication: "Les deux, toujours. Pour ce qui ne peut pas être manqué. Coûte un SMS par tuteur.",
  },
  {
    valeur: "PUSH_SEUL",
    libelle: "Application seulement",
    explication:
      "Jamais de SMS. Les parents sans l'application ne recevront rien — à réserver aux volumes élevés.",
  },
  {
    valeur: "SMS_SEUL",
    libelle: "SMS seulement",
    explication: "Un SMS même si l'application est installée. Pour ce qui doit laisser une trace.",
  },
  { valeur: "AUCUN", libelle: "Désactivé", explication: "Aucune notification n'est produite." },
] as const;

const schema = z.object({
  type: z.string().min(1),
  politique: z.enum(["PUSH_SINON_SMS", "PUSH_ET_SMS", "PUSH_SEUL", "SMS_SEUL", "AUCUN"]),
});

export interface Resultat {
  ok: boolean;
  message?: string;
}

export async function definirPolitique(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("notification:configurer");

    const a = schema.safeParse(donnees);
    if (!a.success) return { ok: false, message: "Requête invalide." };

    const avant = await db.execute<{ politique: string; libelle: string }>(sql`
      SELECT politique::text, libelle FROM politiques_notification
       WHERE type = ${a.data.type}::type_notification
    `);
    if (!avant.rows[0]) return { ok: false, message: "Type de notification inconnu." };

    await db.execute(sql`
      UPDATE politiques_notification
         SET politique = ${a.data.politique}::politique_canal,
             modifie_le = now(),
             modifie_par = ${acteur.id}::uuid
       WHERE type = ${a.data.type}::type_notification
    `);

    await journaliser(acteur, {
      action: "notification.politique_modifiee",
      entite: "politiques_notification",
      avant: { type: a.data.type, politique: avant.rows[0].politique },
      apres: { type: a.data.type, politique: a.data.politique },
    });

    revalidatePath("/dashboard/parametres/notifications");
    return { ok: true, message: `${avant.rows[0].libelle} — canal mis à jour.` };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour modifier ce réglage." };
    }
    console.error("[politique-notification]", erreur);
    return { ok: false, message: "La modification a échoué." };
  }
}

/**
 * Seuil de gravité à partir duquel un incident est notifié.
 *
 * Réglage à part : il ne choisit pas un canal mais ce qui mérite d'être
 * signalé. Un bavardage ne justifie pas de faire sonner le téléphone d'un
 * parent au travail.
 */
export async function definirSeuilIncident(gravite: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("notification:configurer");

    const valides = ["MINEURE", "MOYENNE", "GRAVE", "TRES_GRAVE"];
    if (!valides.includes(gravite)) return { ok: false, message: "Gravité inconnue." };

    await db.execute(sql`
      INSERT INTO parametres (cle, valeur, description)
      VALUES ('notification_incident_gravite_min', ${gravite},
              'Gravite minimale notifiee aux familles.')
      ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, modifie_le = now()
    `);

    await journaliser(acteur, {
      action: "notification.seuil_incident",
      entite: "parametres",
      apres: { gravite },
    });

    revalidatePath("/dashboard/parametres/notifications");
    return { ok: true, message: `Incidents notifiés à partir de « ${gravite.toLowerCase()} ».` };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour modifier ce réglage." };
    }
    return { ok: false, message: "La modification a échoué." };
  }
}
