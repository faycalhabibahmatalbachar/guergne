import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { etablissement } from "@/server/db/schema";

/**
 * Le lycée possède une seule fiche officielle (id = true).
 * Les constantes de marque (nom/sigle/devise) ne sont pas modifiables ici :
 * l'application et certains modèles PDF les utilisent encore en dur.
 */
export async function chargerIdentiteLycee() {
  const [fiche] = await db
    .select({
      id: etablissement.id,
      nom: etablissement.nom,
      sigle: etablissement.sigle,
      devise: etablissement.devise,
      adresse: etablissement.adresse,
      ville: etablissement.ville,
      pays: etablissement.pays,
      telephone: etablissement.telephone,
      email: etablissement.email,
      siteWeb: etablissement.siteWeb,
      ministereTutelle: etablissement.ministereTutelle,
      autorisationNumero: etablissement.autorisationNumero,
      nomProviseur: etablissement.nomProviseur,
      nomCenseur: etablissement.nomCenseur,
      modifieLe: etablissement.modifieLe,
    })
    .from(etablissement)
    .where(eq(etablissement.id, true))
    .limit(1);
  return fiche ?? null;
}
