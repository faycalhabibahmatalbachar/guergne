import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./../db";

/**
 * Journal d'audit consultable (E-61).
 *
 * SIXIÈME TABLE ÉCRITE PAR TOUT LE LOGICIEL ET LUE PAR PERSONNE
 * ---------------------------------------------------------------
 * Chaque action passe par `journaliser()` : une note modifiée, un élève exclu,
 * un paiement annulé, un bulletin publié. Rien ne permettait de le relire.
 *
 * Or c'est l'unique réponse à la question qui se pose vraiment un jour :
 * « qui a changé cette note ? ». Sans écran, la réponse exigeait un accès
 * direct à la base — c'est-à-dire qu'elle n'existait pas pour l'établissement.
 *
 * LE FILTRE PAR ÉLÈVE EST LE PLUS UTILE
 * --------------------------------------
 * `journal_audit` porte une colonne `eleve_id` renseignée par les actions
 * métier, justement pour retrouver tout ce qui touche un dossier sans avoir à
 * joindre six tables. C'est ce que demande un parent en litige.
 *
 * L'ACTEUR EST RECOPIÉ, PAS JOINT
 * --------------------------------
 * `nom_acteur` et `role_acteur` sont figés au moment de l'action. Un compte
 * supprimé plus tard laisse donc une trace encore lisible — c'est la raison
 * d'être de ces colonnes, et pourquoi on ne joint pas `utilisateurs` ici.
 */

export interface LigneAudit {
  id: string;
  date: string;
  acteur: string;
  role: string | null;
  action: string;
  entite: string;
  entiteId: string | null;
  eleveId: string | null;
  eleve: string | null;
  motif: string | null;
  avant: unknown;
  apres: unknown;
}

export interface FiltresAudit {
  action?: string;
  entite?: string;
  eleveId?: string;
  acteurId?: string;
  depuis?: string;
  jusqua?: string;
  page?: number;
}

const PAR_PAGE = 50;

export async function listerAudit(
  filtres: FiltresAudit = {},
): Promise<{ lignes: LigneAudit[]; total: number; page: number; nbPages: number }> {
  const page = Math.max(1, filtres.page ?? 1);
  const decalage = (page - 1) * PAR_PAGE;

  const action = filtres.action || null;
  const entite = filtres.entite || null;
  const eleveId = filtres.eleveId || null;
  const acteurId = filtres.acteurId || null;
  const depuis = filtres.depuis || null;
  const jusqua = filtres.jusqua || null;

  const [lignes, compte] = await Promise.all([
    db.execute<{
      id: string;
      date: string;
      acteur: string | null;
      role: string | null;
      action: string;
      entite: string;
      entite_id: string | null;
      eleve_id: string | null;
      eleve: string | null;
      motif: string | null;
      avant: unknown;
      apres: unknown;
    }>(sql`
      SELECT j.id::text,
             j.cree_le::text AS date,
             j.nom_acteur AS acteur,
             j.role_acteur::text AS role,
             j.action,
             j.entite,
             j.entite_id::text,
             j.eleve_id::text,
             e.nom || ' ' || e.prenom AS eleve,
             j.motif,
             j.valeurs_avant AS avant,
             j.valeurs_apres AS apres
        FROM journal_audit j
        -- Seule jointure : le NOM de l'élève, pour que la ligne se lise sans
        -- ouvrir un autre écran. L'acteur, lui, est déjà recopié dans la table.
        LEFT JOIN eleves e ON e.id = j.eleve_id
       WHERE (${action}::text IS NULL OR j.action LIKE ${action}::text || '%')
         AND (${entite}::text IS NULL OR j.entite = ${entite}::text)
         AND (${eleveId}::uuid IS NULL OR j.eleve_id = ${eleveId}::uuid)
         AND (${acteurId}::uuid IS NULL OR j.utilisateur_id = ${acteurId}::uuid)
         AND (${depuis}::date IS NULL OR j.cree_le >= ${depuis}::date)
         AND (${jusqua}::date IS NULL OR j.cree_le < ${jusqua}::date + INTERVAL '1 day')
       ORDER BY j.cree_le DESC, j.id DESC
       LIMIT ${PAR_PAGE} OFFSET ${decalage}
    `),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
        FROM journal_audit j
       WHERE (${action}::text IS NULL OR j.action LIKE ${action}::text || '%')
         AND (${entite}::text IS NULL OR j.entite = ${entite}::text)
         AND (${eleveId}::uuid IS NULL OR j.eleve_id = ${eleveId}::uuid)
         AND (${acteurId}::uuid IS NULL OR j.utilisateur_id = ${acteurId}::uuid)
         AND (${depuis}::date IS NULL OR j.cree_le >= ${depuis}::date)
         AND (${jusqua}::date IS NULL OR j.cree_le < ${jusqua}::date + INTERVAL '1 day')
    `),
  ]);

  const total = Number(compte.rows[0]?.n ?? 0);

  return {
    lignes: lignes.rows.map((x) => ({
      id: x.id,
      date: x.date,
      acteur: x.acteur ?? "compte supprimé",
      role: x.role,
      action: x.action,
      entite: x.entite,
      entiteId: x.entite_id,
      eleveId: x.eleve_id,
      eleve: x.eleve,
      motif: x.motif,
      avant: x.avant,
      apres: x.apres,
    })),
    total,
    page,
    nbPages: Math.max(1, Math.ceil(total / PAR_PAGE)),
  };
}

/**
 * Familles d'actions réellement présentes dans le journal.
 *
 * La liste est LUE en base plutôt qu'écrite en dur : les actions sont des
 * chaînes libres posées par chaque module, et une liste figée oublierait celles
 * ajoutées depuis. On regroupe sur le préfixe — « note », « eleve »,
 * « paiement » — parce que c'est ainsi qu'on cherche : on veut tout ce qui
 * touche aux notes, pas « note.modifiee » précisément.
 */
export async function famillesAudit(): Promise<Array<{ famille: string; nombre: number }>> {
  const r = await db.execute<{ famille: string; nombre: number }>(sql`
    SELECT split_part(action, '.', 1) AS famille, count(*)::int AS nombre
      FROM journal_audit
     GROUP BY 1
     ORDER BY 2 DESC
  `);
  return r.rows.map((x) => ({ famille: x.famille, nombre: Number(x.nombre) }));
}
