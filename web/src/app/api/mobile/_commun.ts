import "server-only";

import type { NextRequest } from "next/server";

import { parentDeLaRequete, type ParentAuthentifie } from "@/server/auth/mobile";

/**
 * Socle commun des routes mobiles.
 *
 * Toutes les routes partagent trois besoins : répondre en JSON avec un format
 * d'erreur stable, identifier le parent, et refuser le martèlement. Les
 * regrouper ici évite qu'une route oubliée soit la seule sans garde — c'est
 * généralement celle-là qui fuit.
 */

/**
 * En-têtes communs à toutes les réponses mobiles.
 *
 * `Access-Control-Allow-Origin: *` est ici SANS DANGER, contrairement à ce
 * que l'on pourrait craindre : l'API mobile s'authentifie exclusivement par
 * jeton porteur, jamais par cookie. Le navigateur n'attache donc aucune
 * autorisation ambiante à une requête inter-origines — un site tiers qui
 * appellerait ces routes recevrait un 401. C'est précisément la raison pour
 * laquelle une API mobile utilise un jeton porteur plutôt qu'un cookie.
 *
 * Le corollaire à ne jamais oublier : si l'on ajoutait un jour une
 * authentification par cookie sur ces routes, cette étoile deviendrait une
 * faille CSRF béante et devrait être remplacée par une liste d'origines.
 */
const enTetes = {
  // Aucune mise en cache intermédiaire : ces réponses sont nominatives.
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
} as const;

export function json(donnees: unknown, statut = 200): Response {
  return Response.json(donnees, { status: statut, headers: enTetes });
}

/**
 * Réponse au pré-vol CORS.
 *
 * Réexportée comme `OPTIONS` par chaque route : sans elle, le navigateur
 * refuse toute requête portant un en-tête `Authorization`.
 */
export function preVol(): Response {
  return new Response(null, { status: 204, headers: enTetes });
}

export function erreur(code: string, message: string, statut = 400): Response {
  // Le client affiche `message` tel quel ; `code` lui sert à réagir
  // (déconnexion sur `jeton_invalide`, écran dédié sur `code_expire`…).
  return json({ erreur: code, message }, statut);
}

/**
 * Exige un parent authentifié.
 *
 * Retourne soit le parent, soit la réponse 401 à renvoyer telle quelle —
 * le pattern évite qu'un appelant oublie de traiter le cas null.
 */
export async function exigerParent(
  requete: NextRequest,
): Promise<{ parent: ParentAuthentifie } | { reponse: Response }> {
  const parent = await parentDeLaRequete(requete.headers.get("authorization"));

  if (!parent) {
    return {
      reponse: erreur("jeton_invalide", "Session expirée. Reconnectez-vous.", 401),
    };
  }
  return { parent };
}

// ---------------------------------------------------------------------------
// Limitation de débit
// ---------------------------------------------------------------------------

/**
 * Compteur en mémoire, par instance.
 *
 * Volontairement simple : sur Vercel, chaque instance a son compteur, donc la
 * limite réelle est un multiple de celle annoncée. C'est suffisant pour ce
 * qu'on protège — empêcher qu'un script essaie les 10⁶ codes d'activation —
 * et cela n'ajoute ni Redis ni dépendance payante. Le vrai verrou reste le
 * compteur `tentatives` stocké en base, lui partagé par toutes les instances.
 */
const compteurs = new Map<string, { nombre: number; jusqua: number }>();

export function limiter(cle: string, max: number, fenetreSecondes: number): boolean {
  const maintenant = Date.now();
  const courant = compteurs.get(cle);

  if (!courant || courant.jusqua < maintenant) {
    compteurs.set(cle, { nombre: 1, jusqua: maintenant + fenetreSecondes * 1000 });
    return true;
  }

  if (courant.nombre >= max) return false;

  courant.nombre += 1;
  return true;
}

/** Purge les compteurs échus — sans quoi la Map grossirait indéfiniment. */
export function purgerCompteurs(): void {
  const maintenant = Date.now();
  for (const [cle, valeur] of compteurs) {
    if (valeur.jusqua < maintenant) compteurs.delete(cle);
  }
}

/** Adresse de l'appelant, telle que vue derrière le proxy Vercel. */
export function adresseAppelant(requete: NextRequest): string {
  return (
    requete.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requete.headers.get("x-real-ip") ??
    "inconnue"
  );
}
