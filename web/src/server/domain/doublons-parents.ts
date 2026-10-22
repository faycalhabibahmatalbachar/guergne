import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export type DecisionDoublon = "DISTINCTS" | "MEME_PERSONNE_A_VERIFIER";
export type StatutExamen = {
  decision: DecisionDoublon;
  motif: string;
  examineLe: string;
  examinePar: string;
};
export type ProfilDoublon = {
  id: string; nom: string; prenom: string; telephone: string;
  email: string | null; profession: string | null; adresse: string | null;
  utilisateurId: string | null; compteActif: boolean | null;
  enfants: Array<{ eleveId: string; nom: string; prenom: string; matricule: string; lien: string; principal: boolean }>;
};
export type GroupeDoublon = {
  numero: string;
  dossiers: number;
  responsables: Array<{ id: string; nom: string; prenom: string; nbEnfants: number }>;
};
export type RapprochementCompare = {
  profils: ProfilDoublon[];
  examens: Record<string, StatutExamen>;
};

/** Un même numéro peut être partagé par deux personnes distinctes.
 * Le numéro crée une piste de contrôle, jamais une preuve d'identité.
 */
export async function listerGroupesNumerosPartages(page = 1): Promise<{
  groupes: GroupeDoublon[]; total: number; page: number; parPage: number;
}> {
  const numeroPage = Number.isSafeInteger(page) ? Math.min(5000, Math.max(1, page)) : 1;
  const parPage = 10;
  const [groupes, compte] = await Promise.all([
    db.execute<{ numero: string; dossiers: number; responsables: GroupeDoublon["responsables"] | null }>(sql`
      WITH groupements AS (
        SELECT regexp_replace(telephone, '[^0-9]', '', 'g') AS numero, count(*)::int AS dossiers
        FROM tuteurs
        WHERE regexp_replace(telephone, '[^0-9]', '', 'g') <> ''
        GROUP BY regexp_replace(telephone, '[^0-9]', '', 'g')
        HAVING count(*) > 1
      )
      SELECT g.numero, g.dossiers,
             (
               SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id::text, 'nom', t.nom, 'prenom', t.prenom,
                 'nbEnfants', (SELECT count(*)::int FROM eleve_tuteur et WHERE et.tuteur_id = t.id)
               ) ORDER BY t.nom, t.prenom, t.id)
               FROM tuteurs t WHERE regexp_replace(t.telephone, '[^0-9]', '', 'g') = g.numero
             ) AS responsables
      FROM groupements g
      ORDER BY g.dossiers DESC, g.numero
      LIMIT ${parPage} OFFSET ${(numeroPage - 1) * parPage}
    `),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM (
        SELECT regexp_replace(telephone, '[^0-9]', '', 'g') AS numero
        FROM tuteurs
        WHERE regexp_replace(telephone, '[^0-9]', '', 'g') <> ''
        GROUP BY 1 HAVING count(*) > 1
      ) p
    `),
  ]);
  return {
    groupes: groupes.rows.map(r => ({
      numero: r.numero, dossiers: Number(r.dossiers),
      responsables: Array.isArray(r.responsables) ? r.responsables : [],
    })),
    total: Number(compte.rows[0]?.n ?? 0), page: numeroPage, parPage,
  };
}

function clePaire(id1: string, id2: string): string {
  return [id1, id2].sort().join(":");
}

export async function comparerNumerosPartages(tuteurId: string): Promise<RapprochementCompare | null> {
  const r = await db.execute<{
    id: string; nom: string; prenom: string; telephone: string; email: string | null;
    profession: string | null; adresse: string | null; utilisateur_id: string | null;
    compte_actif: boolean | null; enfants: ProfilDoublon["enfants"] | null;
  }>(sql`
    SELECT t.id::text, t.nom, t.prenom, t.telephone, t.email, t.profession, t.adresse,
           t.utilisateur_id::text, u.actif AS compte_actif,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'eleveId', e.id::text, 'nom', e.nom, 'prenom', e.prenom,
               'matricule', e.matricule, 'lien', et.lien::text,
               'principal', et.est_principal
             ) ORDER BY e.nom, e.prenom)
             FROM eleve_tuteur et JOIN eleves e ON e.id = et.eleve_id
             WHERE et.tuteur_id = t.id
           ), '[]'::jsonb) AS enfants
    FROM tuteurs t
    LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
    WHERE regexp_replace(t.telephone, '[^0-9]', '', 'g') = (
      SELECT regexp_replace(telephone, '[^0-9]', '', 'g') FROM tuteurs WHERE id = ${tuteurId}::uuid
    )
    ORDER BY t.nom, t.prenom, t.id
    LIMIT 25
  `);
  if (r.rows.length < 2) return null;
  const profils: ProfilDoublon[] = r.rows.map(x => ({
    id: x.id, nom: x.nom, prenom: x.prenom, telephone: x.telephone,
    email: x.email, profession: x.profession, adresse: x.adresse,
    utilisateurId: x.utilisateur_id, compteActif: x.compte_actif,
    enfants: Array.isArray(x.enfants) ? x.enfants : [],
  }));
  const ids = profils.map(x => x.id);
  const decisions = await db.execute<{
    entite_id: string; autre_id: string; decision: DecisionDoublon;
    motif: string; examine_le: string; nom_acteur: string;
  }>(sql`
    SELECT j.entite_id::text,
           j.valeurs_apres ->> 'autreTuteurId' AS autre_id,
           j.valeurs_apres ->> 'decision' AS decision,
           j.motif, j.cree_le::text AS examine_le, j.nom_acteur
    FROM journal_audit j
    WHERE j.entite = 'tuteurs' AND j.action = 'tuteur.doublon_examine'
      AND j.entite_id = ANY(${sql`ARRAY[${sql.join(ids.map(x => sql`${x}::uuid`), sql`, `)}]::uuid[]`})
    ORDER BY j.cree_le DESC, j.id DESC
    LIMIT 200
  `);
  const examens: Record<string, StatutExamen> = {};
  for (const x of decisions.rows) {
    if (!ids.includes(x.autre_id)) continue;
    if (x.decision !== "DISTINCTS" && x.decision !== "MEME_PERSONNE_A_VERIFIER") continue;
    const cle = clePaire(x.entite_id, x.autre_id);
    if (!examens[cle]) examens[cle] = {
      decision: x.decision, motif: x.motif ?? "",
      examineLe: x.examine_le, examinePar: x.nom_acteur ?? "Personnel habilité",
    };
  }
  return { profils, examens };
}
