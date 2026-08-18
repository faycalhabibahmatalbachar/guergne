import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { permissions } from "@/server/db/schema";

import type { RoleUtilisateur } from "./permissions";

/**
 * Liste des actions accordées à un rôle.
 *
 * Sert uniquement à masquer les entrées de menu inaccessibles — c'est un
 * confort d'interface, pas une mesure de sécurité. Un utilisateur qui tape
 * directement l'URL d'un module se heurtera de toute façon à
 * `requirePermission` côté serveur.
 *
 * On renvoie un tableau de chaînes plutôt que la matrice complète : le
 * résultat traverse la frontière serveur → client, et seules des données
 * sérialisables peuvent la franchir.
 */
export async function actionsAutorisees(role: RoleUtilisateur): Promise<string[]> {
  const lignes = await db
    .select({ action: permissions.action })
    .from(permissions)
    .where(eq(permissions.role, role));

  return lignes.map((l) => l.action);
}
