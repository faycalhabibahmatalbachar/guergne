"use server";

import { and, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hacherMotDePasse, validerMotDePasse } from "@/server/auth/mot-de-passe";
import {
  compteDuJeton,
  creerJetonReinitialisation,
  emailsDisponibles,
  envoyerEmailReinitialisation,
  lienReinitialisation,
} from "@/server/auth/reinitialisation";
import { revoquerSessions } from "@/server/auth/session";
import { db } from "@/server/db";
import { journalAudit, utilisateurs } from "@/server/db/schema";

export interface EtatReinitialisation {
  erreur?: string;
  succes?: boolean;
}

const adresseValide = z.string().trim().toLowerCase().email().max(254);

export async function demanderReinitialisation(
  _precedent: EtatReinitialisation,
  donnees: FormData,
): Promise<EtatReinitialisation> {
  const adresse = adresseValide.safeParse(donnees.get("email"));
  if (!adresse.success) return { erreur: "Saisissez une adresse e-mail valide." };
  if (!emailsDisponibles()) {
    return { erreur: "La réinitialisation par e-mail est momentanément indisponible. Contactez l'administration." };
  }

  const reponseGenerique = { succes: true };
  const [compte] = await db
    .select({ id: utilisateurs.id, email: utilisateurs.email, hash: utilisateurs.motDePasseHash })
    .from(utilisateurs)
    .where(and(eq(utilisateurs.email, adresse.data), eq(utilisateurs.actif, true)))
    .limit(1);
  if (!compte?.email || !compte.hash) return reponseGenerique;

  // Limite durable de 3 demandes par compte et par heure.
  const tentatives = await db
    .select({ id: journalAudit.id })
    .from(journalAudit)
    .where(and(
      eq(journalAudit.utilisateurId, compte.id),
      eq(journalAudit.action, "mot_de_passe.reinitialisation_demandee"),
      gte(journalAudit.creeLe, new Date(Date.now() - 3_600_000).toISOString()),
    ))
    .limit(3);
  if (tentatives.length >= 3) return reponseGenerique;

  await db.insert(journalAudit).values({
    utilisateurId: compte.id,
    entite: "utilisateurs",
    entiteId: compte.id,
    action: "mot_de_passe.reinitialisation_demandee",
  });
  const jeton = creerJetonReinitialisation(compte.id, compte.hash);
  const envoye = await envoyerEmailReinitialisation(compte.email, lienReinitialisation(jeton));
  if (!envoye) return { erreur: "L'envoi est momentanément indisponible. Réessayez plus tard." };
  return reponseGenerique;
}

const schemaNouveau = z.object({
  jeton: z.string().min(30).max(1200),
  nouveau: z.string().min(1),
  confirmation: z.string().min(1),
});

export async function confirmerReinitialisation(
  _precedent: EtatReinitialisation,
  donnees: FormData,
): Promise<EtatReinitialisation> {
  const analyse = schemaNouveau.safeParse({
    jeton: donnees.get("jeton"),
    nouveau: donnees.get("nouveau"),
    confirmation: donnees.get("confirmation"),
  });
  if (!analyse.success) return { erreur: "Formulaire incomplet ou lien invalide." };
  const { jeton, nouveau, confirmation } = analyse.data;
  if (nouveau !== confirmation) return { erreur: "Les mots de passe ne correspondent pas." };
  const robustesse = validerMotDePasse(nouveau);
  if (!robustesse.valide) return { erreur: robustesse.message };
  const compte = await compteDuJeton(jeton);
  if (!compte?.hash) return { erreur: "Ce lien est invalide, expiré ou a déjà été utilisé." };

  const empreinte = await hacherMotDePasse(nouveau);
  const modifie = await db
    .update(utilisateurs)
    .set({
      motDePasseHash: empreinte,
      doitChangerMdp: false,
      tentativesEchouees: 0,
      verrouilleJusqua: null,
      modifieLe: new Date().toISOString(),
    })
    .where(and(eq(utilisateurs.id, compte.id), eq(utilisateurs.motDePasseHash, compte.hash)))
    .returning({ id: utilisateurs.id });
  if (modifie.length === 0) return { erreur: "Ce lien a déjà été utilisé. Recommencez la procédure." };

  await revoquerSessions(compte.id);
  await db.insert(journalAudit).values({
    utilisateurId: compte.id,
    entite: "utilisateurs",
    entiteId: compte.id,
    action: "mot_de_passe.reinitialise_par_email",
  });
  redirect("/auth/connexion?change=1");
}
