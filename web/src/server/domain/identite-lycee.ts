import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { etablissement } from "@/server/db/schema";

/** Une seule ligne institutionnelle (id=true). Aucun multi-établissement. */
export async function chargerIdentiteLycee() {
  const lignes = await db.select({
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
    version: sql<string>`${etablissement.modifieLe}::text`,
  }).from(etablissement).where(eq(etablissement.id, true)).limit(1);

  return lignes[0] ?? null;
}
