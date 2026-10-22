import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export interface StatistiquesEnvoisParents {
  total: number;
  enAttente: number;
  envoyees: number;
  echouees: number;
  lues: number;
  programmees: number;
  coutFcfa: number;
}
export interface EchecEnvoiParent {
  id: string;
  tuteurId: string | null;
  parent: string;
  titre: string;
  canal: string;
  erreur: string | null;
  creeLe: string;
}

/** Uniquement les campagnes manuelles du module parents, 30 derniers jours. */
export async function lireSuiviParents(): Promise<{
  stats: StatistiquesEnvoisParents;
  echecs: EchecEnvoiParent[];
}> {
  const filtre = sql`
    n.donnees->>'origine' IN ('page_parents', 'selection_parents')
    AND n.cree_le >= now() - interval '30 days'
  `;
  const [statistiques, dernieres] = await Promise.all([
    db.execute<{
      total: number; en_attente: number; envoyees: number; echouees: number;
      lues: number; programmees: number; cout_fcfa: number;
    }>(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE n.statut = 'EN_ATTENTE')::int AS en_attente,
             count(*) FILTER (WHERE n.statut = 'ENVOYE')::int AS envoyees,
             count(*) FILTER (WHERE n.statut = 'ECHOUE')::int AS echouees,
             count(*) FILTER (WHERE n.statut = 'LU')::int AS lues,
             count(*) FILTER (WHERE n.statut = 'EN_ATTENTE'
                    AND n.prochaine_tentative_le > now())::int AS programmees,
             COALESCE(sum(n.cout_fcfa), 0)::int AS cout_fcfa
        FROM notifications n
       WHERE ${filtre}
    `),
    db.execute<{
      id: string; tuteur_id: string | null; prenom: string | null; nom: string | null;
      titre: string; canal: string; erreur: string | null; cree_le: string;
    }>(sql`
      SELECT n.id, t.id AS tuteur_id, t.prenom, t.nom,
             n.titre, n.canal::text AS canal, n.erreur, n.cree_le::text
        FROM notifications n
        LEFT JOIN tuteurs t ON t.id::text = n.donnees->>'tuteurId'
       WHERE ${filtre} AND n.statut = 'ECHOUE'
       ORDER BY n.cree_le DESC
       LIMIT 10
    `),
  ]);
  const s = statistiques.rows[0];
  return {
    stats: {
      total: Number(s?.total ?? 0), enAttente: Number(s?.en_attente ?? 0),
      envoyees: Number(s?.envoyees ?? 0), echouees: Number(s?.echouees ?? 0),
      lues: Number(s?.lues ?? 0), programmees: Number(s?.programmees ?? 0),
      coutFcfa: Number(s?.cout_fcfa ?? 0),
    },
    echecs: dernieres.rows.map(r => ({
      id: r.id, tuteurId: r.tuteur_id,
      parent: [r.prenom, r.nom].filter(Boolean).join(" ") || "Parent introuvable",
      titre: r.titre, canal: r.canal,
      erreur: r.erreur, creeLe: r.cree_le,
    })),
  };
}
