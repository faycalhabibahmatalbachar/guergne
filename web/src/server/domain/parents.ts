import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { eleveTuteur, tuteurs, utilisateurs } from "@/server/db/schema";

/** Lectures du module Comptes parents. */

export interface LigneTuteur {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string | null;
  profession: string | null;
  utilisateurId: string | null;
  compteActif: boolean | null;
  appActivee: boolean;
  appActiveeLe: string | null;
  derniereConnexion: string | null;
  accepteSms: boolean;
  nbEnfants: number;
  enfants: string;
}

export interface FiltresTuteurs {
  recherche?: string;
  /** 'sans_compte' | 'invite' | 'actif' */
  etat?: string;
  classeId?: string;
  page?: number;
  parPage?: number;
}

export interface ResultatTuteurs {
  lignes: LigneTuteur[];
  total: number;
  page: number;
  parPage: number;
}

/**
 * Liste des tuteurs avec l'état de leur accès à l'application.
 *
 * Trois états se distinguent, et la confusion entre eux est la première cause
 * d'appels au secrétariat :
 *   - sans compte  : aucun accès n'a été créé
 *   - invité       : le compte existe mais le parent ne s'est jamais connecté
 *   - actif        : le parent utilise réellement l'application
 */
export async function listerTuteurs(filtres: FiltresTuteurs = {}): Promise<ResultatTuteurs> {
  const page = Math.max(1, filtres.page ?? 1);
  const parPage = Math.min(100, filtres.parPage ?? 25);
  const decalage = (page - 1) * parPage;

  const recherche = filtres.recherche?.trim() ?? "";
  const etat = filtres.etat ?? "";
  const classeId = filtres.classeId ?? "";

  const conditions = sql`
    (${recherche} = '' OR
      t.nom ILIKE ${`%${recherche}%`} OR
      t.prenom ILIKE ${`%${recherche}%`} OR
      t.telephone ILIKE ${`%${recherche}%`})
    AND (${etat} = '' OR
      (${etat} = 'sans_compte' AND t.utilisateur_id IS NULL) OR
      (${etat} = 'invite'      AND t.utilisateur_id IS NOT NULL AND u.derniere_connexion IS NULL) OR
      (${etat} = 'actif'       AND u.derniere_connexion IS NOT NULL))
    AND (NULLIF(${classeId}, '')::uuid IS NULL OR EXISTS (
      SELECT 1 FROM eleve_tuteur et2
        JOIN inscriptions i2 ON i2.eleve_id = et2.eleve_id AND i2.active
       WHERE et2.tuteur_id = t.id AND i2.classe_id = NULLIF(${classeId}, '')::uuid))
  `;

  const [lignes, total] = await Promise.all([
    db.execute<LigneTuteur & Record<string, unknown>>(sql`
      SELECT t.id, t.nom, t.prenom, t.telephone, t.email, t.profession,
             t.utilisateur_id AS "utilisateurId",
             u.actif AS "compteActif",
             t.app_activee AS "appActivee",
             t.app_activee_le AS "appActiveeLe",
             u.derniere_connexion AS "derniereConnexion",
             t.accepte_sms AS "accepteSms",
             (SELECT count(*) FROM eleve_tuteur et WHERE et.tuteur_id = t.id) AS "nbEnfants",
             COALESCE((
               SELECT string_agg(e.prenom || ' ' || e.nom || ' (' || c.libelle || ')', ', ')
                 FROM eleve_tuteur et
                 JOIN eleves e ON e.id = et.eleve_id
                 LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.active
                 LEFT JOIN classes c ON c.id = i.classe_id
                WHERE et.tuteur_id = t.id
             ), '') AS enfants
        FROM tuteurs t
        LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
       WHERE ${conditions}
       ORDER BY t.nom, t.prenom
       LIMIT ${parPage} OFFSET ${decalage}
    `),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
        FROM tuteurs t
        LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
       WHERE ${conditions}
    `),
  ]);

  return {
    lignes: lignes.rows.map((l) => ({ ...l, nbEnfants: Number(l.nbEnfants) })),
    total: Number(total.rows[0]?.n ?? 0),
    page,
    parPage,
  };
}

export interface StatistiquesParents {
  total: number;
  sansCompte: number;
  invites: number;
  actifs: number;
  avecAppareil: number;
}

export async function statistiquesParents(): Promise<StatistiquesParents> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE t.utilisateur_id IS NULL)::int AS sans_compte,
      count(*) FILTER (WHERE t.utilisateur_id IS NOT NULL AND u.derniere_connexion IS NULL)::int AS invites,
      count(*) FILTER (WHERE u.derniere_connexion IS NOT NULL)::int AS actifs,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM appareils a WHERE a.utilisateur_id = t.utilisateur_id AND a.actif))::int AS avec_appareil
      FROM tuteurs t
      LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
  `);

  const l = r.rows[0] ?? {};
  return {
    total: Number(l.total ?? 0),
    sansCompte: Number(l.sans_compte ?? 0),
    invites: Number(l.invites ?? 0),
    actifs: Number(l.actifs ?? 0),
    avecAppareil: Number(l.avec_appareil ?? 0),
  };
}

/** Tuteurs d'un élève, pour la fiche élève. */
export async function tuteursDeLEleve(eleveId: string) {
  return db
    .select({
      id: tuteurs.id,
      nom: tuteurs.nom,
      prenom: tuteurs.prenom,
      telephone: tuteurs.telephone,
      lien: eleveTuteur.lien,
      estPrincipal: eleveTuteur.estPrincipal,
      utilisateurId: tuteurs.utilisateurId,
      appActivee: tuteurs.appActivee,
    })
    .from(eleveTuteur)
    .innerJoin(tuteurs, eq(tuteurs.id, eleveTuteur.tuteurId))
    .where(eq(eleveTuteur.eleveId, eleveId));
}

/** Vérifie qu'un numéro n'est pas déjà rattaché à un autre compte. */
export async function telephoneDisponible(telephone: string, saufTuteurId?: string) {
  const [existant] = await db
    .select({ id: utilisateurs.id })
    .from(utilisateurs)
    .where(and(eq(utilisateurs.telephone, telephone), eq(utilisateurs.role, "PARENT")))
    .limit(1);

  if (!existant) return true;
  if (!saufTuteurId) return false;

  const [tuteur] = await db
    .select({ utilisateurId: tuteurs.utilisateurId })
    .from(tuteurs)
    .where(eq(tuteurs.id, saufTuteurId));

  return tuteur?.utilisateurId === existant.id;
}
