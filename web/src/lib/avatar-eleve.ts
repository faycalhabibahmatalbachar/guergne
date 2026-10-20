/**
 * Avatars illustrés de remplacement pour le fichier élèves.
 *
 * Les 40 SVG sont des illustrations Open Peeps (Pablo Stanley, CC0),
 * générées une seule fois et hébergées localement sous public/avatars/eleves.
 * Le navigateur ne contacte aucun service externe et aucune donnée personnelle
 * n'est envoyée à un fournisseur d'avatars.
 *
 * La photo réelle demeure prioritaire. Les illustrations ne constituent pas
 * une preuve d'identité ni une représentation réelle de l'élève.
 */
export type SexePourAvatar = "M" | "F" | null | undefined;

const NOMBRE_AVATARS = { M: 16, F: 16, N: 8 } as const;

function hashId(value: string): number {
  // FNV-1a 32 bits : répartition déterministe, sans appel réseau ni cookie.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** URL du SVG local. Identique à chaque connexion pour le même élève. */
export function avatarIllustreEleve(id: string, sexe: SexePourAvatar): string {
  const groupe = sexe === "M" || sexe === "F" ? sexe : "N";
  const numero = (hashId(id) % NOMBRE_AVATARS[groupe]) + 1;
  return `/avatars/eleves/${groupe.toLowerCase()}-${String(numero).padStart(2, "0")}.svg`;
}

/** Ne pas écraser les photographies authentiques déjà enregistrées. */
export function imageProfilEleve({
  id,
  sexe,
  photoUrl,
}: {
  id: string;
  sexe?: SexePourAvatar;
  photoUrl?: string | null;
}): string {
  if (photoUrl?.trim()) return photoUrl;
  return avatarIllustreEleve(id, sexe);
}
