import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Regroupement administratif PAR RESPONSABLE, pas par nom de famille ou foyer.
 * Plusieurs enfants reliés au même tuteur ne prouvent pas biologiquement
 * une fratrie ; chaque relation doit être vérifiée par l'établissement.
 */
export type VueFamilles = "tous" | "plusieurs" | "telephone" | "sans_enfant";

export type EnfantDansFamille = {
  eleveId: string; nom: string; prenom: string; matricule: string;
  classe: string | null; lien: string; estPrincipal: boolean;
  estTuteurLegal: boolean; estResponsableFinancier: boolean;
  estContactUrgence: boolean; autoriseRetrait: boolean;
};

export type FamilleRecensee = {
  tuteurId: string; nom: string; prenom: string; telephone: string;
  nbEnfants: number; numeroPartage: boolean;
  enfants: EnfantDansFamille[];
};

export interface ResultatFamilles {
  lignes: FamilleRecensee[];
  total: number;
  page: number;
  parPage: number;
  stats: { responsables: number; plusieursEnfants: number; numerosPartages: number; sansEnfant: number };
}

function conditionsRecherche(recherche: string, vue: VueFamilles) {
  return sql`
    (${recherche} = '' OR
      r.nom ILIKE ${"%" + recherche + "%"} OR
      r.prenom ILIKE ${"%" + recherche + "%"} OR
      r.telephone ILIKE ${"%" + recherche + "%"})
    AND (${vue} = 'tous'
      OR (${vue} = 'plusieurs' AND r.nb_enfants >= 2)
      OR (${vue} = 'telephone' AND r.numero_partage)
      OR (${vue} = 'sans_enfant' AND r.nb_enfants = 0))
  `;
}
const recensement = sql`
  WITH regroupements AS (
    SELECT t.id, t.nom, t.prenom, t.telephone,
           count(DISTINCT et.eleve_id)::int AS nb_enfants,
           EXISTS (
             SELECT 1 FROM tuteurs autre
             WHERE autre.id <> t.id
               AND regexp_replace(autre.telephone, '[^0-9]', '', 'g')
                   = regexp_replace(t.telephone, '[^0-9]', '', 'g')
           ) AS numero_partage
    FROM tuteurs t
    LEFT JOIN eleve_tuteur et ON et.tuteur_id = t.id
    GROUP BY t.id
  )
`;

export async function listerFamilles({
  recherche = "", vue = "plusieurs", page = 1,
}: {
  recherche?: string; vue?: VueFamilles; page?: number;
} = {}): Promise<ResultatFamilles> {
  const q = recherche.trim().slice(0, 100);
  const type: VueFamilles = ["tous", "plusieurs", "telephone", "sans_enfant"].includes(vue) ? vue : "plusieurs";
  const numeroPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const parPage = 12;
  const conditions = conditionsRecherche(q, type);
  const [liste, comptage, statistiques] = await Promise.all([
    db.execute<{
      tuteur_id: string; nom: string; prenom: string; telephone: string;
      nb_enfants: number; numero_partage: boolean; enfants: EnfantDansFamille[] | null;
    }>(sql`
      ${recensement}
      SELECT r.id::text AS tuteur_id, r.nom, r.prenom, r.telephone,
             r.nb_enfants, r.numero_partage,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'eleveId', e.id::text, 'nom', e.nom, 'prenom', e.prenom,
                 'matricule', e.matricule,
                 'classe', (
                   SELECT c.libelle FROM inscriptions i
                   JOIN classes c ON c.id = i.classe_id
                   WHERE i.eleve_id = e.id AND i.active
                   ORDER BY i.id LIMIT 1
                 ),
                 'lien', et.lien::text, 'estPrincipal', et.est_principal,
                 'estTuteurLegal', et.est_tuteur_legal,
                 'estResponsableFinancier', et.est_responsable_financier,
                 'estContactUrgence', et.est_contact_urgence,
                 'autoriseRetrait', et.autorise_retrait
               ) ORDER BY e.nom, e.prenom, e.id)
               FROM eleve_tuteur et JOIN eleves e ON e.id = et.eleve_id
               WHERE et.tuteur_id = r.id
             ), '[]'::jsonb) AS enfants
      FROM regroupements r
      WHERE ${conditions}
      ORDER BY r.nb_enfants DESC, r.nom, r.prenom, r.id
      LIMIT ${parPage} OFFSET ${(numeroPage - 1) * parPage}
    `),
    db.execute<{ n: number }>(sql`
      ${recensement}
      SELECT count(*)::int AS n FROM regroupements r WHERE ${conditions}
    `),
    db.execute<{
      responsables: number; plusieurs: number; partages: number; sans_enfant: number;
    }>(sql`
      ${recensement}
      SELECT count(*)::int AS responsables,
             count(*) FILTER (WHERE nb_enfants >= 2)::int AS plusieurs,
             count(*) FILTER (WHERE numero_partage)::int AS partages,
             count(*) FILTER (WHERE nb_enfants = 0)::int AS sans_enfant
      FROM regroupements
    `),
  ]);
  const stat = statistiques.rows[0];
  return {
    lignes: liste.rows.map(r => ({
      tuteurId: r.tuteur_id, nom: r.nom, prenom: r.prenom,
      telephone: r.telephone, nbEnfants: Number(r.nb_enfants),
      numeroPartage: Boolean(r.numero_partage),
      enfants: Array.isArray(r.enfants) ? r.enfants : [],
    })),
    total: Number(comptage.rows[0]?.n ?? 0),
    page: numeroPage,
    parPage,
    stats: {
      responsables: Number(stat?.responsables ?? 0),
      plusieursEnfants: Number(stat?.plusieurs ?? 0),
      numerosPartages: Number(stat?.partages ?? 0),
      sansEnfant: Number(stat?.sans_enfant ?? 0),
    },
  };
}
