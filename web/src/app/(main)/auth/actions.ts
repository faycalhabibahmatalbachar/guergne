"use server";

import { eq, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hacherMotDePasse, validerMotDePasse, verifierMotDePasse } from "@/server/auth/mot-de-passe";
import { fermerSession, ouvrirSession, revoquerSessions, sessionCourante } from "@/server/auth/session";
import { db } from "@/server/db";
import { journalAudit, utilisateurs } from "@/server/db/schema";

/** Nombre d'échecs avant verrouillage temporaire du compte. */
const MAX_TENTATIVES = 5;
const DUREE_VERROU_MINUTES = 15;

const schemaConnexion = z.object({
  identifiant: z.string().trim().min(1, "Renseignez votre identifiant."),
  motDePasse: z.string().min(1, "Renseignez votre mot de passe."),
});

export interface EtatConnexion {
  erreur?: string;
}

/**
 * Connexion du personnel.
 *
 * Le message d'erreur est volontairement IDENTIQUE que l'identifiant soit
 * inconnu ou que le mot de passe soit faux. Distinguer les deux permettrait
 * d'énumérer les comptes existants de l'établissement.
 *
 * Le temps de réponse est en revanche inégal (on ne hache pas si le compte
 * n'existe pas) : c'est un compromis assumé, l'énumération par chronométrage
 * étant hors de portée du risque réel ici, et le hachage Argon2 coûteux.
 */
export async function connexion(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const analyse = schemaConnexion.safeParse({
    identifiant: donnees.get("identifiant"),
    motDePasse: donnees.get("motDePasse"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire incomplet." };
  }

  const { identifiant, motDePasse } = analyse.data;
  const ERREUR_GENERIQUE = "Identifiant ou mot de passe incorrect.";

  const [compte] = await db
    .select()
    .from(utilisateurs)
    .where(or(eq(utilisateurs.email, identifiant), eq(utilisateurs.telephone, identifiant)))
    .limit(1);

  if (!compte || !compte.motDePasseHash) {
    return { erreur: ERREUR_GENERIQUE };
  }

  if (!compte.actif) {
    return { erreur: "Ce compte est désactivé. Contactez l'administration." };
  }

  // Les horodatages du schéma introspecté sont exposés en chaîne ISO.
  const verrouJusqua = compte.verrouilleJusqua ? new Date(compte.verrouilleJusqua) : null;
  if (verrouJusqua && verrouJusqua > new Date()) {
    const minutes = Math.ceil((verrouJusqua.getTime() - Date.now()) / 60_000);
    return {
      erreur: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
    };
  }

  const correct = await verifierMotDePasse(compte.motDePasseHash, motDePasse);

  if (!correct) {
    const tentatives = (compte.tentativesEchouees ?? 0) + 1;
    const verrouiller = tentatives >= MAX_TENTATIVES;

    await db
      .update(utilisateurs)
      .set({
        tentativesEchouees: verrouiller ? 0 : tentatives,
        verrouilleJusqua: verrouiller
          ? new Date(Date.now() + DUREE_VERROU_MINUTES * 60_000).toISOString()
          : null,
      })
      .where(eq(utilisateurs.id, compte.id));

    if (verrouiller) {
      await journaliser(compte.id, "connexion.verrouillage", {
        motif: `${MAX_TENTATIVES} tentatives infructueuses`,
      });
      return {
        erreur: `Trop de tentatives. Compte bloqué ${DUREE_VERROU_MINUTES} minutes.`,
      };
    }

    return { erreur: ERREUR_GENERIQUE };
  }

  // Succès : on remet les compteurs à zéro et on ouvre la session.
  await db
    .update(utilisateurs)
    .set({ tentativesEchouees: 0, verrouilleJusqua: null, derniereConnexion: new Date().toISOString() })
    .where(eq(utilisateurs.id, compte.id));

  const entetes = await headers();
  await ouvrirSession(compte.id, {
    ip: entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: entetes.get("user-agent"),
  });

  await journaliser(compte.id, "connexion.succes");

  redirect(compte.doitChangerMdp ? "/auth/mot-de-passe" : "/dashboard/default");
}

export async function deconnexion(): Promise<void> {
  const principal = await sessionCourante();
  if (principal) await journaliser(principal.id, "deconnexion");

  await fermerSession();
  redirect("/auth/connexion");
}

const schemaChangement = z
  .object({
    actuel: z.string().min(1, "Renseignez votre mot de passe actuel."),
    nouveau: z.string(),
    confirmation: z.string(),
  })
  .refine((d) => d.nouveau === d.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });

/**
 * Changement de mot de passe.
 *
 * Toutes les autres sessions sont révoquées : si le changement fait suite à
 * une compromission, laisser les sessions ouvertes annulerait l'intérêt de
 * l'opération.
 */
export async function changerMotDePasse(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const principal = await sessionCourante();
  if (!principal) redirect("/auth/connexion");

  const analyse = schemaChangement.safeParse({
    actuel: donnees.get("actuel"),
    nouveau: donnees.get("nouveau"),
    confirmation: donnees.get("confirmation"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire incomplet." };
  }

  const robustesse = validerMotDePasse(analyse.data.nouveau);
  if (!robustesse.valide) return { erreur: robustesse.message };

  const [compte] = await db
    .select({ hash: utilisateurs.motDePasseHash })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, principal.id))
    .limit(1);

  if (!compte?.hash || !(await verifierMotDePasse(compte.hash, analyse.data.actuel))) {
    return { erreur: "Le mot de passe actuel est incorrect." };
  }

  if (analyse.data.actuel === analyse.data.nouveau) {
    return { erreur: "Le nouveau mot de passe doit être différent de l'ancien." };
  }

  await db
    .update(utilisateurs)
    .set({
      motDePasseHash: await hacherMotDePasse(analyse.data.nouveau),
      doitChangerMdp: false,
    })
    .where(eq(utilisateurs.id, principal.id));

  await journaliser(principal.id, "mot_de_passe.change");
  await revoquerSessions(principal.id);

  redirect("/auth/connexion?change=1");
}

/**
 * Écrit au journal d'audit.
 *
 * Ne fait jamais échouer l'action appelante : un journal indisponible ne doit
 * pas empêcher un agent de se connecter. L'incident part dans les traces
 * serveur pour être traité séparément.
 */
async function journaliser(
  utilisateurId: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const entetes = await headers();
    await db.insert(journalAudit).values({
      utilisateurId,
      action,
      entite: "utilisateurs",
      entiteId: utilisateurId,
      adresseIp: entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: entetes.get("user-agent")?.slice(0, 500) ?? null,
      valeursApres: Object.keys(extra).length ? extra : null,
      motif: typeof extra.motif === "string" ? extra.motif : null,
      roleActeur: sql`(SELECT role FROM utilisateurs WHERE id = ${utilisateurId})`,
      nomActeur: sql`(SELECT prenom || ' ' || nom FROM utilisateurs WHERE id = ${utilisateurId})`,
    });
  } catch (erreur) {
    console.error("[audit] écriture impossible :", erreur);
  }
}
