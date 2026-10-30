"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { parametresUuid } from "@/lib/sql-uuid";
import { db } from "@/server/db";
import { requirePermission } from "@/server/guard";

const schema = z.object({
  anneeId: z.string().uuid(),
  classesIds: z.array(z.string().uuid()).max(100).default([]),
  recherche: z.string().trim().max(80).default(""),
  dossier: z.enum(["VALIDE", "A_VALIDER", "INCOMPLET", "BROUILLON", "REFUSE"]).optional(),
  page: z.number().int().min(1).max(10000).default(1),
});

export type LigneEleveClasse = {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  photoUrl: string | null;
  sexe: "M" | "F" | null;
  classeId: string;
  classeLibelle: string;
  niveauLibelle: string;
  statut: string;
  dossier: string;
};
export type ResultatElevesClasses = {
  total: number;
  page: number;
  taillePage: number;
  lignes: LigneEleveClasse[];
};

/**
 * Consultation côté serveur, paginée et limitée à l'année choisie.
 * Une salle physique n'est pas une classe : aucun élève n'est rattaché
 * artificiellement aux locaux depuis l'emploi du temps.
 */
export async function rechercherElevesClasses(entree: {
  anneeId: string;
  classesIds?: string[];
  recherche?: string;
  dossier?: "VALIDE" | "A_VALIDER" | "INCOMPLET" | "BROUILLON" | "REFUSE";
  page?: number;
}): Promise<ResultatElevesClasses> {
  await requirePermission("classe:lire");
  await requirePermission("eleve:lire");
  const v = schema.parse(entree);
  const ids = [...new Set(v.classesIds)];
  const taillePage = 25;
  const filtreClasses = ids.length ? sql`AND i.classe_id IN (${parametresUuid(ids)})` : sql``;
  const q = v.recherche || null;
  const dossier = v.dossier ?? null;
  const filtre = sql`
    FROM inscriptions i
    JOIN eleves e ON e.id = i.eleve_id
    JOIN classes c ON c.id = i.classe_id AND c.annee_id = i.annee_id
    JOIN niveaux n ON n.id = c.niveau_id
    WHERE i.annee_id = ${v.anneeId}::uuid AND i.active
    ${filtreClasses}
    AND (${dossier}::text IS NULL OR i.statut_dossier::text = ${dossier}::text)
    AND (${q}::text IS NULL
      OR e.nom ILIKE '%' || ${q} || '%'
      OR e.prenom ILIKE '%' || ${q} || '%'
      OR e.matricule ILIKE '%' || ${q} || '%'
      OR c.libelle ILIKE '%' || ${q} || '%')
  `;
  const [compte, resultat] = await Promise.all([
    db.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${filtre}`),
    db.execute<{
      id: string;
      matricule: string;
      nom: string;
      prenom: string;
      photo_url: string | null;
      sexe: "M" | "F" | null;
      classe_id: string;
      classe_libelle: string;
      niveau_libelle: string;
      statut: string;
      dossier: string;
    }>(sql`
      SELECT e.id::text AS id, e.matricule, e.nom, e.prenom,
        e.photo_url, e.sexe, c.id::text AS classe_id, c.libelle AS classe_libelle,
        n.libelle AS niveau_libelle, e.statut::text AS statut,
        i.statut_dossier::text AS dossier
      ${filtre}
      ORDER BY n.ordre, c.libelle, e.nom, e.prenom, e.id
      LIMIT ${taillePage} OFFSET ${(v.page - 1) * taillePage}
    `),
  ]);
  return {
    total: Number(compte.rows[0]?.total ?? 0),
    page: v.page,
    taillePage,
    lignes: resultat.rows.map((l) => ({
      id: l.id,
      matricule: l.matricule,
      nom: l.nom,
      prenom: l.prenom,
      photoUrl: l.photo_url,
      sexe: l.sexe,
      classeId: l.classe_id,
      classeLibelle: l.classe_libelle,
      niveauLibelle: l.niveau_libelle,
      statut: l.statut,
      dossier: l.dossier,
    })),
  };
}
