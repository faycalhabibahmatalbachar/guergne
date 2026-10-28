import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

export interface PlageHoraireScolaire {
  jourSemaine: number;
  profilLibelle: string;
  dateDebut: string;
  dateFin: string;
  ordreAffichage: number;
  nature: "COURS" | "PAUSE";
  libelle: string;
  heureDebut: string;
  heureFin: string;
  ordreCours: number | null;
  apresOrdreCours: number | null;
  creneauId: string | null;
}

/**
 * Charge les horaires approuvés/configurés de l'année sélectionnée.
 *
 * Une règle datée peut être remplacée par une autre durant l'année. On utilise
 * celle qui couvre aujourd'hui ; si l'année consultée est historique ou future
 * et qu'aucune règle ne couvre aujourd'hui, on présente la dernière règle
 * configurée sans inventer d'heures.
 */
export async function chargerPlagesHorairesScolaires(
  anneeId: string,
): Promise<PlageHoraireScolaire[]> {
  const resultat = await db.execute<{
    jour_semaine: number;
    profil_libelle: string;
    date_debut: string;
    date_fin: string;
    ordre_affichage: number;
    nature: "COURS" | "PAUSE";
    libelle: string;
    heure_debut: string;
    heure_fin: string;
    ordre_cours: number | null;
    apres_ordre_cours: number | null;
    creneau_id: string | null;
  }>(sql`
    WITH choix AS (
      SELECT
        r.id AS regle_id,
        r.jour_semaine,
        r.date_debut::text AS date_debut,
        r.date_fin::text AS date_fin,
        p.id AS profil_id,
        p.libelle AS profil_libelle,
        row_number() OVER (
          PARTITION BY r.jour_semaine
          ORDER BY
            (CURRENT_DATE BETWEEN r.date_debut AND r.date_fin) DESC,
            r.date_debut DESC,
            r.cree_le DESC
        ) AS rang
      FROM regles_horaires_annee r
      JOIN profils_horaires p
        ON p.id = r.profil_horaire_id
       AND p.annee_id = r.annee_id
      WHERE r.annee_id = ${anneeId}::uuid
        AND r.actif
        AND p.actif
    )
    SELECT
      c.jour_semaine,
      c.profil_libelle,
      c.date_debut,
      c.date_fin,
      h.ordre_affichage,
      h.nature,
      h.libelle,
      h.heure_debut::text AS heure_debut,
      h.heure_fin::text AS heure_fin,
      h.ordre_cours,
      h.apres_ordre_cours,
      h.creneau_id
    FROM choix c
    JOIN plages_horaires h ON h.profil_horaire_id = c.profil_id
    WHERE c.rang = 1
    ORDER BY c.jour_semaine, h.ordre_affichage
  `);

  return resultat.rows.map((ligne) => ({
    jourSemaine: Number(ligne.jour_semaine),
    profilLibelle: ligne.profil_libelle,
    dateDebut: ligne.date_debut,
    dateFin: ligne.date_fin,
    ordreAffichage: Number(ligne.ordre_affichage),
    nature: ligne.nature,
    libelle: ligne.libelle,
    heureDebut: ligne.heure_debut,
    heureFin: ligne.heure_fin,
    ordreCours: ligne.ordre_cours === null ? null : Number(ligne.ordre_cours),
    apresOrdreCours:
      ligne.apres_ordre_cours === null ? null : Number(ligne.apres_ordre_cours),
    creneauId: ligne.creneau_id,
  }));
}
