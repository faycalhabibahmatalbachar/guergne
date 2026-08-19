import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Authentification de l'application mobile des parents.
 *
 * Le web utilise une session en base derrière un cookie ; le mobile ne peut
 * pas s'appuyer là-dessus — pas de cookie fiable, et l'application doit rester
 * connectée des semaines. On applique donc le schéma classique :
 *
 *   jeton d'accès     — court (30 min), signé, jamais stocké en base
 *   jeton de rafraîchissement — long (90 j), stocké haché, **à usage unique**
 *
 * La rotation à usage unique est le point important : chaque rafraîchissement
 * révoque le jeton présenté et en émet un nouveau. Si un jeton déjà consommé
 * revient, c'est qu'il a été volé — on révoque alors TOUTE la chaîne de
 * l'appareil, pas seulement le jeton rejoué.
 */

const DUREE_ACCES_MINUTES = 30;
const DUREE_RAFRAICHISSEMENT_JOURS = 90;

/** Durée de validité d'un code d'activation, alignée sur l'invitation web. */
export const DUREE_CODE_JOURS = 7;
/** Au-delà, le code est brûlé : protège contre le balayage des 10⁶ combinaisons. */
export const TENTATIVES_MAX = 5;

function secret(): string {
  const valeur = process.env.SECRET_MOBILE ?? process.env.DATABASE_URL;
  if (!valeur) {
    // Sans secret, signer reviendrait à ne pas signer. On refuse de démarrer
    // plutôt que d'émettre des jetons falsifiables.
    throw new Error("SECRET_MOBILE absent : impossible de signer les jetons mobiles.");
  }
  return valeur;
}

export function empreinte(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

// ---------------------------------------------------------------------------
// Jeton d'accès
// ---------------------------------------------------------------------------

interface ChargeUtile {
  /** Identifiant utilisateur. */
  u: string;
  /** Rôle, vérifié malgré tout côté serveur à chaque appel. */
  r: string;
  /** Expiration, en secondes epoch. */
  exp: number;
}

function base64url(donnees: Buffer | string): string {
  return Buffer.from(donnees).toString("base64url");
}

/**
 * Émet un jeton d'accès signé HMAC-SHA256.
 *
 * Format volontairement minimal plutôt qu'un JWT complet : pas de bibliothèque,
 * pas de champ `alg` — donc pas d'attaque « alg: none », qui reste l'une des
 * failles les plus courantes des implémentations JWT.
 */
export function emettreJetonAcces(utilisateurId: string, role: string): { jeton: string; expireDans: number } {
  const expireDans = DUREE_ACCES_MINUTES * 60;
  const charge: ChargeUtile = {
    u: utilisateurId,
    r: role,
    exp: Math.floor(Date.now() / 1000) + expireDans,
  };

  const corps = base64url(JSON.stringify(charge));
  const signature = base64url(createHmac("sha256", secret()).update(corps).digest());

  return { jeton: `${corps}.${signature}`, expireDans };
}

/** Vérifie un jeton d'accès. Retourne null si invalide, falsifié ou expiré. */
export function verifierJetonAcces(jeton: string): { utilisateurId: string; role: string } | null {
  const morceaux = jeton.split(".");
  if (morceaux.length !== 2) return null;

  const [corps, signature] = morceaux;
  const attendue = base64url(createHmac("sha256", secret()).update(corps).digest());

  // Comparaison à temps constant : une comparaison naïve laisse fuir la
  // signature octet par octet en mesurant le temps de réponse.
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const charge = JSON.parse(Buffer.from(corps, "base64url").toString()) as ChargeUtile;
    if (charge.exp * 1000 < Date.now()) return null;
    return { utilisateurId: charge.u, role: charge.r };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Jeton de rafraîchissement
// ---------------------------------------------------------------------------

export async function emettreJetonRafraichissement(
  utilisateurId: string,
  appareilId: string | null,
): Promise<string> {
  const jeton = randomBytes(32).toString("base64url");
  const expiration = new Date(Date.now() + DUREE_RAFRAICHISSEMENT_JOURS * 86_400_000);

  await db.execute(sql`
    INSERT INTO jetons_rafraichissement (utilisateur_id, jeton_hash, appareil_id, expire_le)
    VALUES (${utilisateurId}, ${empreinte(jeton)}, ${appareilId}, ${expiration.toISOString()})
  `);

  return jeton;
}

export interface ResultatRotation {
  ok: boolean;
  motif?: "inconnu" | "expire" | "rejeu" | "compte_inactif";
  utilisateurId?: string;
  role?: string;
  nouveauJeton?: string;
}

/**
 * Consomme un jeton de rafraîchissement et en émet un nouveau.
 *
 * Le rejeu d'un jeton déjà consommé révoque toute la chaîne : c'est la
 * détection de vol. Un parent dont le téléphone a été compromis se retrouve
 * déconnecté, ce qui est exactement le comportement voulu.
 */
export async function rafraichir(jetonPresente: string): Promise<ResultatRotation> {
  const hash = empreinte(jetonPresente);

  return db.transaction(async (tx) => {
    const lignes = await tx.execute<{
      id: string;
      utilisateur_id: string;
      appareil_id: string | null;
      revoque: boolean;
      expire_le: string;
      role: string;
      actif: boolean;
    }>(sql`
      SELECT j.id, j.utilisateur_id, j.appareil_id, j.revoque, j.expire_le,
             u.role::text AS role, u.actif
        FROM jetons_rafraichissement j
        JOIN utilisateurs u ON u.id = j.utilisateur_id
       WHERE j.jeton_hash = ${hash}
       FOR UPDATE OF j
    `);

    const ligne = lignes.rows[0];
    if (!ligne) return { ok: false, motif: "inconnu" as const };

    if (ligne.revoque) {
      // Rejeu détecté : tous les jetons vivants de cet utilisateur tombent.
      await tx.execute(sql`
        UPDATE jetons_rafraichissement
           SET revoque = TRUE
         WHERE utilisateur_id = ${ligne.utilisateur_id} AND NOT revoque
      `);
      return { ok: false, motif: "rejeu" as const };
    }

    if (new Date(ligne.expire_le) < new Date()) return { ok: false, motif: "expire" as const };
    if (!ligne.actif) return { ok: false, motif: "compte_inactif" as const };

    const nouveau = randomBytes(32).toString("base64url");
    const expiration = new Date(Date.now() + DUREE_RAFRAICHISSEMENT_JOURS * 86_400_000);

    const insere = await tx.execute<{ id: string }>(sql`
      INSERT INTO jetons_rafraichissement (utilisateur_id, jeton_hash, appareil_id, expire_le)
      VALUES (${ligne.utilisateur_id}, ${empreinte(nouveau)}, ${ligne.appareil_id}, ${expiration.toISOString()})
      RETURNING id
    `);

    await tx.execute(sql`
      UPDATE jetons_rafraichissement
         SET revoque = TRUE, remplace_par = ${insere.rows[0].id}
       WHERE id = ${ligne.id}
    `);

    return {
      ok: true,
      utilisateurId: ligne.utilisateur_id,
      role: ligne.role,
      nouveauJeton: nouveau,
    };
  });
}

/** Révoque tous les jetons d'un utilisateur (déconnexion, départ, incident). */
export async function revoquerJetons(utilisateurId: string): Promise<void> {
  await db.execute(sql`
    UPDATE jetons_rafraichissement SET revoque = TRUE
     WHERE utilisateur_id = ${utilisateurId} AND NOT revoque
  `);
}

// ---------------------------------------------------------------------------
// Contexte d'une requête mobile
// ---------------------------------------------------------------------------

export interface ParentAuthentifie {
  utilisateurId: string;
  tuteurId: string;
  nom: string;
  prenom: string;
  telephone: string | null;
}

/**
 * Identifie le parent derrière une requête.
 *
 * Le rôle porté par le jeton n'est jamais cru sur parole : on relit
 * `utilisateurs` à chaque appel. Un compte désactivé le matin perd l'accès
 * immédiatement, sans attendre l'expiration des 30 minutes du jeton.
 */
export async function parentDeLaRequete(entete: string | null): Promise<ParentAuthentifie | null> {
  if (!entete?.startsWith("Bearer ")) return null;

  const charge = verifierJetonAcces(entete.slice(7).trim());
  if (!charge) return null;

  const lignes = await db.execute<{
    utilisateur_id: string;
    tuteur_id: string;
    nom: string;
    prenom: string;
    telephone: string | null;
  }>(sql`
    SELECT u.id AS utilisateur_id, t.id AS tuteur_id, t.nom, t.prenom, u.telephone
      FROM utilisateurs u
      JOIN tuteurs t ON t.utilisateur_id = u.id
     WHERE u.id = ${charge.utilisateurId} AND u.actif AND u.role = 'PARENT'
  `);

  const ligne = lignes.rows[0];
  if (!ligne) return null;

  return {
    utilisateurId: ligne.utilisateur_id,
    tuteurId: ligne.tuteur_id,
    nom: ligne.nom,
    prenom: ligne.prenom,
    telephone: ligne.telephone,
  };
}

/**
 * Vérifie qu'un élève relève bien de ce tuteur.
 *
 * Contrôle indispensable : sans lui, un parent authentifié pourrait lire les
 * notes de n'importe quel élève en changeant l'identifiant dans l'URL. C'est
 * la faille la plus banale — et la plus grave — des applications scolaires.
 */
export async function eleveAutorise(tuteurId: string, eleveId: string): Promise<boolean> {
  const lignes = await db.execute<{ existe: boolean }>(sql`
    SELECT TRUE AS existe FROM eleve_tuteur
     WHERE tuteur_id = ${tuteurId} AND eleve_id = ${eleveId}
     LIMIT 1
  `);
  return lignes.rows.length > 0;
}
