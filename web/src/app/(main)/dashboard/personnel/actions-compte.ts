"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { hacherMotDePasse } from "@/server/auth/mot-de-passe";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

/**
 * Comptes d'accès du personnel (E-62).
 *
 * AUCUN DES QUINZE ENSEIGNANTS N'A DE COMPTE
 * -------------------------------------------
 * La colonne `enseignants.utilisateur_id` est nulle partout. Concrètement :
 * aucun professeur ne peut ouvrir le portail, donc aucun ne saisit ses notes ni
 * ses appréciations. Tout passe par le secrétariat, qui recopie des feuilles.
 * C'est le seul point du logiciel qui empêche encore un module entier de
 * fonctionner.
 *
 * Rien ne créait ce compte : `creerEnseignant` écrit dans `enseignants`, et
 * c'est tout.
 *
 * LE MOT DE PASSE EST PROVISOIRE, ET LU UNE SEULE FOIS
 * -----------------------------------------------------
 * Il est renvoyé en clair à l'écran au moment de la création, puis n'existe
 * plus que sous forme d'empreinte. `doit_changer_mdp` force son remplacement à
 * la première connexion — le layout du tableau de bord redirige déjà dessus.
 * L'imprimer dans un tableau consultable plus tard reviendrait à stocker des
 * mots de passe en clair, ce que l'établissement finirait par photographier.
 *
 * L'IDENTIFIANT EST LE TÉLÉPHONE
 * -------------------------------
 * Peu d'enseignants ont une adresse e-mail qu'ils relèvent. Le numéro est ce
 * qu'ils donnent au secrétariat, ce qui figure déjà dans leur fiche, et ce
 * qu'ils retiennent. L'e-mail reste accepté quand il existe.
 *
 * LE RÔLE PAR DÉFAUT EST ENSEIGNANT, ET IL EST BORNÉ
 * ---------------------------------------------------
 * On ne propose pas SUPER_ADMIN depuis cet écran : donner les pleins pouvoirs
 * en créant une fiche professeur est le genre d'erreur qui ne se remarque
 * jamais.
 */

export interface ResultatCompte {
  ok: boolean;
  message?: string;
  /** Mot de passe provisoire, renvoyé UNE seule fois. */
  motDePasse?: string;
}

const ROLES_AUTORISES = [
  "ENSEIGNANT",
  "SURVEILLANT",
  "SECRETARIAT",
  "COMPTABLE",
  "CENSEUR",
  "DIRECTION",
] as const;

const schema = z.object({
  enseignantId: z.string().uuid(),
  role: z.enum(ROLES_AUTORISES),
});

/**
 * Mot de passe provisoire lisible à voix haute.
 *
 * Le secrétariat le dicte au téléphone. Un mot de passe aléatoire de vingt
 * caractères serait plus sûr sur le papier et, en pratique, recopié sur un
 * cahier posé à l'accueil. Douze caractères sans ambiguïté visuelle (ni O/0,
 * ni I/l/1) tiennent la dictée et se remplacent à la première connexion.
 */
function motDePasseProvisoire(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const octets = new Uint32Array(12);
  crypto.getRandomValues(octets);
  return [...octets].map((n) => alphabet[n % alphabet.length]).join("");
}

export async function creerCompteEnseignant(donnees: unknown): Promise<ResultatCompte> {
  try {
    const acteur = await requirePermission("utilisateur:creer");

    const a = schema.safeParse(donnees);
    if (!a.success) return { ok: false, message: "Requête invalide." };
    const v = a.data;

    const r = await db.execute<{
      nom: string;
      prenom: string;
      telephone: string | null;
      email: string | null;
      utilisateur_id: string | null;
    }>(sql`
      SELECT nom, prenom, telephone, email, utilisateur_id
        FROM enseignants WHERE id = ${v.enseignantId}::uuid
    `);

    const e = r.rows[0];
    if (!e) return { ok: false, message: "Enseignant introuvable." };
    if (e.utilisateur_id) {
      return { ok: false, message: "Cet enseignant a déjà un compte d'accès." };
    }
    if (!e.telephone && !e.email) {
      return {
        ok: false,
        message:
          "Cet enseignant n'a ni téléphone ni e-mail : renseignez-en un avant de créer le compte.",
      };
    }

    const enClair = motDePasseProvisoire();
    const empreinte = await hacherMotDePasse(enClair);

    let compteId = "";
    await db.transaction(async (tx) => {
      const c = await tx.execute<{ id: string }>(sql`
        INSERT INTO utilisateurs
          (email, telephone, mot_de_passe_hash, role, nom, prenom, doit_changer_mdp)
        VALUES (${e.email || null}, ${e.telephone || null}, ${empreinte},
                ${v.role}::role_utilisateur, ${e.nom}, ${e.prenom}, TRUE)
        RETURNING id
      `);
      compteId = c.rows[0].id;

      // Le lien est posé dans la MÊME transaction : un compte créé sans être
      // rattaché resterait invisible depuis la fiche, et un second essai
      // buterait sur l'unicité du téléphone sans qu'on comprenne pourquoi.
      await tx.execute(sql`
        UPDATE enseignants SET utilisateur_id = ${compteId}::uuid
         WHERE id = ${v.enseignantId}::uuid
      `);
    });

    await journaliser(acteur, {
      action: "utilisateur.cree",
      entite: "utilisateurs",
      entiteId: compteId,
      // Le mot de passe n'entre PAS dans le journal : il y resterait lisible
      // par quiconque consulte l'audit.
      apres: { role: v.role, enseignantId: v.enseignantId },
    });

    revalidatePath("/dashboard/personnel");

    return {
      ok: true,
      motDePasse: enClair,
      message: `Compte créé pour ${e.prenom} ${e.nom}.`,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour créer un compte." };
    }
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("utilisateurs_telephone_key")) {
      return { ok: false, message: "Ce numéro est déjà utilisé par un autre compte." };
    }
    if (message.includes("utilisateurs_email_key")) {
      return { ok: false, message: "Cette adresse e-mail est déjà utilisée par un autre compte." };
    }
    console.error("[compte-enseignant]", erreur);
    return { ok: false, message: "La création du compte a échoué." };
  }
}

/**
 * Réinitialise le mot de passe d'un compte.
 *
 * Le cas courant n'est pas l'oubli mais le départ en congé : un professeur
 * revient trois mois plus tard et ne se souvient de rien. Sans ce bouton, le
 * secrétariat créerait un second compte — et l'enseignant se retrouverait avec
 * deux identités, dont une seule porte ses affectations.
 */
export async function reinitialiserMotDePasse(enseignantId: string): Promise<ResultatCompte> {
  try {
    const acteur = await requirePermission("utilisateur:creer");

    const r = await db.execute<{ utilisateur_id: string | null; nom: string; prenom: string }>(sql`
      SELECT utilisateur_id, nom, prenom FROM enseignants WHERE id = ${enseignantId}::uuid
    `);
    const e = r.rows[0];
    if (!e?.utilisateur_id) return { ok: false, message: "Cet enseignant n'a pas de compte." };

    const enClair = motDePasseProvisoire();
    const empreinte = await hacherMotDePasse(enClair);

    await db.execute(sql`
      UPDATE utilisateurs
         SET mot_de_passe_hash = ${empreinte},
             doit_changer_mdp = TRUE,
             tentatives_echouees = 0,
             verrouille_jusqua = NULL,
             modifie_le = now()
       WHERE id = ${e.utilisateur_id}::uuid
    `);

    // Les sessions ouvertes sont révoquées : réinitialiser un mot de passe sans
    // fermer les sessions laisserait un accès actif à qui l'avait obtenu — ce
    // qui est justement la raison la plus fréquente d'une réinitialisation.
    await db.execute(sql`
      DELETE FROM sessions WHERE utilisateur_id = ${e.utilisateur_id}::uuid
    `);

    await journaliser(acteur, {
      action: "utilisateur.mot_de_passe_reinitialise",
      entite: "utilisateurs",
      entiteId: e.utilisateur_id,
    });

    revalidatePath("/dashboard/personnel");
    return {
      ok: true,
      motDePasse: enClair,
      message: `Nouveau mot de passe pour ${e.prenom} ${e.nom}. Ses sessions ouvertes sont fermées.`,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
    }
    console.error("[reinit-mdp]", erreur);
    return { ok: false, message: "La réinitialisation a échoué." };
  }
}

/**
 * Désactive ou réactive un compte.
 *
 * On ne supprime pas : le journal d'audit, les notes saisies et les
 * appréciations rédigées pointent sur cet identifiant. Un compte effacé rendrait
 * illisible tout ce qu'il a produit.
 */
export async function basculerCompte(
  enseignantId: string,
  actif: boolean,
): Promise<ResultatCompte> {
  try {
    const acteur = await requirePermission("utilisateur:creer");

    const r = await db.execute<{ utilisateur_id: string | null }>(sql`
      SELECT utilisateur_id FROM enseignants WHERE id = ${enseignantId}::uuid
    `);
    const id = r.rows[0]?.utilisateur_id;
    if (!id) return { ok: false, message: "Cet enseignant n'a pas de compte." };

    await db.execute(sql`
      UPDATE utilisateurs SET actif = ${actif}, modifie_le = now() WHERE id = ${id}::uuid
    `);
    if (!actif) {
      await db.execute(sql`DELETE FROM sessions WHERE utilisateur_id = ${id}::uuid`);
    }

    await journaliser(acteur, {
      action: actif ? "utilisateur.reactive" : "utilisateur.desactive",
      entite: "utilisateurs",
      entiteId: id,
    });

    revalidatePath("/dashboard/personnel");
    return {
      ok: true,
      message: actif ? "Compte réactivé." : "Compte désactivé, sessions fermées.",
    };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
    }
    console.error("[bascule-compte]", erreur);
    return { ok: false, message: "L'opération a échoué." };
  }
}
