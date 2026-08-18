import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { sessions, utilisateurs } from "@/server/db/schema";
import type { RoleUtilisateur } from "@/server/guard/permissions";

/**
 * Sessions du personnel (interface web).
 *
 * Choix : session en base, PAS de JWT.
 * Un JWT reste valable jusqu'à son expiration, même après la désactivation
 * du compte. Dans une école, un agent qui part doit perdre l'accès à la
 * seconde — sa session est alors simplement supprimée en base.
 *
 * Le cookie porte un jeton aléatoire ; la base ne stocke que son empreinte
 * SHA-256. Une fuite de la table `sessions` ne permet donc pas de se
 * connecter, exactement comme pour les mots de passe.
 */

const NOM_COOKIE = "lgr_session";
const DUREE_HEURES = 12;

export interface Principal {
  id: string;
  role: RoleUtilisateur;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  photoUrl: string | null;
  doitChangerMdp: boolean;
}

function empreinte(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/** Crée une session et pose le cookie. Retourne le jeton en clair (une seule fois). */
export async function ouvrirSession(
  utilisateurId: string,
  contexte: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const jeton = randomBytes(32).toString("base64url");
  const expiration = new Date(Date.now() + DUREE_HEURES * 3_600_000);

  await db.insert(sessions).values({
    utilisateurId,
    jetonHash: empreinte(jeton),
    adresseIp: contexte.ip ?? null,
    userAgent: contexte.userAgent?.slice(0, 500) ?? null,
    expireLe: expiration.toISOString(),
  });

  const magasin = await cookies();
  magasin.set(NOM_COOKIE, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiration,
  });
}

/**
 * Lit la session courante.
 *
 * Le rôle est TOUJOURS relu depuis la table `utilisateurs`, jamais depuis le
 * cookie ni depuis une donnée fournie par le client. C'est la parade à
 * l'élévation de privilège : le client ne transporte qu'un identifiant de
 * session opaque, rien d'autre.
 */
export async function sessionCourante(): Promise<Principal | null> {
  const magasin = await cookies();
  const jeton = magasin.get(NOM_COOKIE)?.value;
  if (!jeton) return null;

  const lignes = await db
    .select({
      id: utilisateurs.id,
      role: utilisateurs.role,
      nom: utilisateurs.nom,
      prenom: utilisateurs.prenom,
      email: utilisateurs.email,
      telephone: utilisateurs.telephone,
      photoUrl: utilisateurs.photoUrl,
      doitChangerMdp: utilisateurs.doitChangerMdp,
      actif: utilisateurs.actif,
    })
    .from(sessions)
    .innerJoin(utilisateurs, eq(utilisateurs.id, sessions.utilisateurId))
    .where(and(eq(sessions.jetonHash, empreinte(jeton)), gt(sessions.expireLe, new Date().toISOString())))
    .limit(1);

  const u = lignes[0];
  // Un compte désactivé perd l'accès immédiatement, sans attendre l'expiration.
  if (!u || !u.actif) return null;

  return {
    id: u.id,
    role: u.role as RoleUtilisateur,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    telephone: u.telephone,
    photoUrl: u.photoUrl,
    doitChangerMdp: u.doitChangerMdp,
  };
}

/** Ferme la session courante et supprime le cookie. */
export async function fermerSession(): Promise<void> {
  const magasin = await cookies();
  const jeton = magasin.get(NOM_COOKIE)?.value;

  if (jeton) {
    await db.delete(sessions).where(eq(sessions.jetonHash, empreinte(jeton)));
  }
  magasin.delete(NOM_COOKIE);
}

/** Révoque toutes les sessions d'un utilisateur (changement de mot de passe, départ). */
export async function revoquerSessions(utilisateurId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.utilisateurId, utilisateurId));
}

/** Purge les sessions expirées. À appeler périodiquement. */
export async function purgerSessionsExpirees(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expireLe, new Date().toISOString()));
}

export const COOKIE_SESSION = NOM_COOKIE;
