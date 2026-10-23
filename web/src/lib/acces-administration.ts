import type { RoleUtilisateur } from "@/server/guard/permissions";

/**
 * Les portails parents/élèves sont séparés du back-office administratif.
 * Cette liste n'autorise pas, à elle seule, les actions métier : la matrice
 * des permissions continue d'être vérifiée pour chaque opération.
 */
const ROLES_PERSONNEL = new Set<RoleUtilisateur>([
  "SUPER_ADMIN",
  "DIRECTION",
  "CENSEUR",
  "SURVEILLANT",
  "SECRETARIAT",
  "COMPTABLE",
  "ENSEIGNANT",
]);

export function roleAutoriseAdministration(role: RoleUtilisateur | string): boolean {
  return ROLES_PERSONNEL.has(role as RoleUtilisateur);
}
