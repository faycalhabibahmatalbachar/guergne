import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export type CategoriePersonnel = "ADMINISTRATIF" | "TECHNIQUE";

export interface LignePersonnelNonEnseignant {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  categorie: CategoriePersonnel;
  fonction: string;
  service: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  dateEmbauche: string | null;
  typeContrat: string | null;
  observations: string | null;
  actif: boolean;
  utilisateurId: string | null;
  compteActif: boolean;
  roleCompte: string | null;
}

export async function listerPersonnelNonEnseignant(categorie: CategoriePersonnel): Promise<LignePersonnelNonEnseignant[]> {
  const resultat = await db.execute<{
    id: string; matricule: string; nom: string; prenom: string;
    categorie: CategoriePersonnel; fonction: string; service: string | null;
    telephone: string | null; email: string | null; adresse: string | null;
    date_embauche: string | null; type_contrat: string | null;
    observations: string | null; actif: boolean; utilisateur_id: string | null;
    compte_actif: boolean; role_compte: string | null;
  }>(sql`
    SELECT p.id, p.matricule, p.nom, p.prenom, p.categorie, p.fonction,
           p.service, p.telephone, p.email, p.adresse,
           p.date_embauche, p.type_contrat, p.observations, p.actif,
           p.utilisateur_id, COALESCE(u.actif, FALSE) AS compte_actif,
           u.role::text AS role_compte
    FROM personnels_non_enseignants p
    LEFT JOIN utilisateurs u ON u.id = p.utilisateur_id
    WHERE p.categorie = ${categorie}
    ORDER BY p.nom, p.prenom
  `);
  return resultat.rows.map(r => ({
    id: r.id, matricule: r.matricule, nom: r.nom, prenom: r.prenom,
    categorie: r.categorie, fonction: r.fonction, service: r.service,
    telephone: r.telephone, email: r.email, adresse: r.adresse,
    dateEmbauche: r.date_embauche, typeContrat: r.type_contrat,
    observations: r.observations, actif: r.actif, utilisateurId: r.utilisateur_id,
    compteActif: r.compte_actif, roleCompte: r.role_compte,
  }));
}
