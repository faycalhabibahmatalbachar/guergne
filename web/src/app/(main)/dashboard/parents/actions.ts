"use server";

import { revalidatePath } from "next/cache";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { codesActivation, tuteurs, utilisateurs } from "@/server/db/schema";
import { dureeInvitationJours } from "@/server/domain/parametres";
import { numeroTuteurDejaUtilise, telephoneDisponible } from "@/server/domain/parents";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { normaliserNumero } from "@/server/notifications/sms";

import { createHash, randomInt } from "node:crypto";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  /** Code d'activation, retourné UNE SEULE FOIS pour affichage au guichet. */
  code?: string;
}

const OK: Resultat = { ok: true };

function echec(e: unknown, defaut: string): Resultat {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  const m = e instanceof Error ? e.message : "";
  if (m.includes("duplicate key") || m.includes("23505")) {
    return { ok: false, message: "Ce numéro est déjà rattaché à un compte." };
  }
  console.error("[parents]", e);
  return { ok: false, message: defaut };
}

/**
 * Génère un code d'activation à six chiffres.
 *
 * `randomInt` du module crypto, et non `Math.random` : un code prédictible
 * permettrait de rattacher l'enfant d'un autre à son propre téléphone.
 */
function genererCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

const empreinte = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Ouvre l'accès applicatif d'un tuteur.
 *
 * Crée le compte s'il n'existe pas, puis délivre un code d'activation à six
 * chiffres. Le code n'est JAMAIS stocké en clair : seule son empreinte l'est,
 * exactement comme un mot de passe. Il est retourné une seule fois, pour être
 * lu au tuteur au guichet ou lui être envoyé par SMS.
 *
 * On ne met pas de mot de passe : un parent tchadien change souvent de
 * téléphone mais rarement de numéro. L'ancrage sur le numéro, avec un code
 * délivré par l'école, évite qu'un tiers rattache un enfant qui n'est pas le
 * sien.
 */
export async function inviterTuteur(tuteurId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:inviter");

    const [tuteur] = await db
      .select({
        id: tuteurs.id,
        nom: tuteurs.nom,
        prenom: tuteurs.prenom,
        telephone: tuteurs.telephone,
        utilisateurId: tuteurs.utilisateurId,
        accepteSms: tuteurs.accepteSms,
      })
      .from(tuteurs)
      .where(eq(tuteurs.id, tuteurId));

    if (!tuteur) return { ok: false, message: "Tuteur introuvable." };

    const numero = normaliserNumero(tuteur.telephone);
    if (await numeroTuteurDejaUtilise(numero, tuteurId)) {
      return {
        ok: false,
        message: "Numéro partagé entre plusieurs fiches. Vérifiez les responsables avant de délivrer un code d'accès.",
      };
    }

    if (!(await telephoneDisponible(numero, tuteurId))) {
      return {
        ok: false,
        message: "Ce numéro est déjà rattaché à un autre compte parent. Vérifiez qu'il ne s'agit pas d'un doublon.",
      };
    }

    const validiteJours = await dureeInvitationJours();
    const code = genererCode();

    await db.transaction(async (tx) => {
      let utilisateurId = tuteur.utilisateurId;

      if (!utilisateurId) {
        const [compte] = await tx
          .insert(utilisateurs)
          .values({
            telephone: numero,
            role: "PARENT",
            nom: tuteur.nom,
            prenom: tuteur.prenom,
            // Aucun mot de passe : l'accès se fait par code SMS.
            motDePasseHash: null,
          })
          .returning({ id: utilisateurs.id });

        utilisateurId = compte.id;
        await tx.update(tuteurs).set({ utilisateurId }).where(eq(tuteurs.id, tuteurId));
      } else {
        // Réactive un compte précédemment désactivé.
        await tx.update(utilisateurs).set({ actif: true }).where(eq(utilisateurs.id, utilisateurId));
      }

      // Les codes précédents sont invalidés : un seul code vivant à la fois,
      // sinon un ancien code communiqué par erreur resterait utilisable.
      await tx.update(codesActivation).set({ consomme: true }).where(eq(codesActivation.telephone, numero));

      await tx.insert(codesActivation).values({
        telephone: numero,
        codeHash: empreinte(code),
        expireLe: new Date(Date.now() + validiteJours * 24 * 60 * 60_000).toISOString(),
      });

      // Mise en file d'un SMS : le parent n'a pas encore l'application, le
      // push est donc impossible par construction.
      if (tuteur.accepteSms) {
        await tx.execute(sql`
          INSERT INTO notifications (telephone, type, canal, titre, corps)
          VALUES (
            ${numero},
            'AUTRE'::type_notification,
            'SMS'::canal_notification,
            ${"Accès à l'application"},
            ${`Votre code d'activation est ${code}. Il est valable ${validiteJours} jour${validiteJours > 1 ? "s" : ""}. Ne le communiquez à personne.`}
          )
        `);
      }
    });

    await journaliser(acteur, {
      action: "tuteur.invite",
      entite: "tuteurs",
      entiteId: tuteurId,
      apres: { telephone: numero, smsEnvoye: tuteur.accepteSms, validiteJours },
    });

    revalidatePath("/dashboard/parents");
    return {
      ok: true,
      code,
      message: tuteur.accepteSms
        ? `Code d’activation créé ; SMS mis en file pour ${numero}.`
        : `Compte créé. Communiquez le code au tuteur : ${code}`,
    };
  } catch (e) {
    return echec(e, "L'invitation a échoué.");
  }
}

/**
 * Invite en masse les tuteurs principaux d'une classe.
 *
 * À la rentrée, inviter 500 familles une par une est impraticable. On se
 * limite aux tuteurs PRINCIPAUX : ouvrir un compte aux deux parents double le
 * coût SMS pour un même foyer.
 */
/** Ancienne action en masse désactivée : tous les envois doivent désormais passer
 * par prévisualiserInvitationsClasse + confirmerInvitationsClasse, avec accord de coût.
 */
export async function inviterClasse(_classeId: string): Promise<Resultat> {
  await requirePermission("tuteur:inviter");
  return {
    ok: false,
    message:
      "Utilisez le module d'invitation par classe avec prévisualisation, sélection des destinataires et confirmation du coût SMS.",
  };
}

/** Renvoie un nouveau code — le précédent est invalidé. */
export async function renvoyerCode(tuteurId: string): Promise<Resultat> {
  return inviterTuteur(tuteurId);
}

/**
 * Coupe l'accès d'un tuteur.
 *
 * Le compte est désactivé, pas supprimé : l'historique des notifications et
 * des lectures reste rattachable. Les sessions ouvertes tombent à la requête
 * suivante, puisque le rôle est relu en base à chaque appel.
 */
export async function revoquerAcces(tuteurId: string, motif: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");

    if (motif.trim().length < 3) {
      return { ok: false, erreurs: { motif: "Indiquez le motif de la révocation." } };
    }

    const [tuteur] = await db
      .select({ utilisateurId: tuteurs.utilisateurId, nom: tuteurs.nom, prenom: tuteurs.prenom })
      .from(tuteurs)
      .where(eq(tuteurs.id, tuteurId));

    if (!tuteur?.utilisateurId) return { ok: false, message: "Ce tuteur n'a pas de compte." };

    await db.transaction(async (tx) => {
      await tx
        .update(utilisateurs)
        .set({ actif: false })
        .where(eq(utilisateurs.id, tuteur.utilisateurId as string));

      // Les sessions et jetons mobiles sont révoqués immédiatement.
      await tx.execute(sql`DELETE FROM sessions WHERE utilisateur_id = ${tuteur.utilisateurId}::uuid`);
      await tx.execute(
        sql`UPDATE jetons_rafraichissement SET revoque = TRUE WHERE utilisateur_id = ${tuteur.utilisateurId}::uuid`,
      );
      await tx.execute(sql`UPDATE appareils SET actif = FALSE WHERE utilisateur_id = ${tuteur.utilisateurId}::uuid`);
      await tx.update(tuteurs).set({ appActivee: false }).where(eq(tuteurs.id, tuteurId));
    });

    await journaliser(acteur, {
      action: "tuteur.acces_revoque",
      entite: "tuteurs",
      entiteId: tuteurId,
      motif: motif.trim(),
    });

    revalidatePath("/dashboard/parents");
    return { ok: true, message: "Accès révoqué. Les sessions ouvertes sont fermées." };
  } catch (e) {
    return echec(e, "La révocation a échoué.");
  }
}

const schemaCoordonnees = z.object({
  telephone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro invalide"),
  email: z.string().trim().email("Adresse invalide").optional().or(z.literal("")),
  accepteSms: z.boolean().default(true),
});

/**
 * Corrige les coordonnées d'un tuteur.
 *
 * Un numéro erroné est la première cause d'échec des notifications. La
 * correction met à jour le compte associé : sans cela, le tuteur ne pourrait
 * plus se connecter, son identifiant étant son numéro.
 */
export async function modifierCoordonnees(tuteurId: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    const a = schemaCoordonnees.safeParse(donnees);
    if (!a.success) {
      const s: Record<string, string> = {};
      for (const p of a.error.issues) s[String(p.path[0])] = p.message;
      return { ok: false, erreurs: s };
    }

    const numero = normaliserNumero(a.data.telephone);

    if (!(await telephoneDisponible(numero, tuteurId))) {
      return { ok: false, erreurs: { telephone: "Ce numéro est déjà rattaché à un autre compte." } };
    }

    const [avant] = await db
      .select({ telephone: tuteurs.telephone, utilisateurId: tuteurs.utilisateurId })
      .from(tuteurs)
      .where(eq(tuteurs.id, tuteurId));
    if (!avant) return { ok: false, message: "Tuteur introuvable." };
    if (numero !== avant.telephone && (await numeroTuteurDejaUtilise(numero, tuteurId))) {
      return {
        ok: false,
        erreurs: { telephone: "Numéro déjà présent sur une autre fiche parent. Vérification nécessaire." },
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(tuteurs)
        .set({ telephone: numero, email: a.data.email || null, accepteSms: a.data.accepteSms })
        .where(eq(tuteurs.id, tuteurId));

      if (avant?.utilisateurId) {
        await tx
          .update(utilisateurs)
          .set({ telephone: numero, email: a.data.email || null })
          .where(eq(utilisateurs.id, avant.utilisateurId));
      }
    });

    await journaliser(acteur, {
      action: "tuteur.coordonnees_modifiees",
      entite: "tuteurs",
      entiteId: tuteurId,
      avant: { telephone: avant?.telephone },
      apres: { telephone: numero },
    });

    revalidatePath("/dashboard/parents");
    return OK;
  } catch (e) {
    return echec(e, "La modification a échoué.");
  }
}

/**
 * Mise à jour complète d'un tuteur : coordonnées et identité, sans toucher
 * aux liens enfants ni aux permissions du compte. Aucun champ n'est modifié
 * avant la validation intégrale et la vérification des doublons.
 */
const schemaProfilTuteur = z.object({
  nom: z.string().trim().min(2, "Nom requis").max(120),
  prenom: z.string().trim().min(2, "Prénom requis").max(120),
  sexe: z.union([z.enum(["M", "F"]), z.literal("")]).optional(),
  telephone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro invalide"),
  telephoneSecondaire: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro secondaire invalide")
    .or(z.literal(""))
    .optional(),
  email: z.string().trim().email("Adresse invalide").or(z.literal("")).optional(),
  profession: z.string().trim().max(150).optional(),
  employeur: z.string().trim().max(150).optional(),
  adresse: z.string().trim().max(400).optional(),
  quartier: z.string().trim().max(150).optional(),
  accepteSms: z.boolean(),
});

export async function modifierProfilTuteur(tuteurId: string, donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    if (!z.string().uuid().safeParse(tuteurId).success) return { ok: false, message: "Identifiant invalide." };
    const a = schemaProfilTuteur.safeParse(donnees);
    if (!a.success) {
      const erreurs: Record<string, string> = {};
      for (const p of a.error.issues) erreurs[String(p.path[0])] ??= p.message;
      return { ok: false, erreurs, message: "Vérifiez les champs du formulaire." };
    }

    const v = a.data;
    const numero = normaliserNumero(v.telephone);
    const secondaire = v.telephoneSecondaire ? normaliserNumero(v.telephoneSecondaire) : null;
    const [avant] = await db.select().from(tuteurs).where(eq(tuteurs.id, tuteurId)).limit(1);
    if (!avant) return { ok: false, message: "Tuteur introuvable." };
    if (numero !== avant.telephone) {
      if ((await numeroTuteurDejaUtilise(numero, tuteurId)) || !(await telephoneDisponible(numero, tuteurId))) {
        return { ok: false, erreurs: { telephone: "Numéro déjà utilisé par un autre tuteur ou compte." } };
      }
    }

    const maj = {
      nom: v.nom,
      prenom: v.prenom,
      sexe: v.sexe ? v.sexe : null,
      telephone: numero,
      telephoneSecondaire: secondaire,
      email: v.email || null,
      profession: v.profession || null,
      employeur: v.employeur || null,
      adresse: v.adresse || null,
      quartier: v.quartier || null,
      accepteSms: v.accepteSms,
    } as const;
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};
    for (const [champ, valeur] of Object.entries(maj)) {
      const precedente = (avant as Record<string, unknown>)[champ] ?? null;
      if (String(precedente ?? "") !== String(valeur ?? "")) {
        changements[champ] = { avant: precedente, apres: valeur };
      }
    }
    if (!Object.keys(changements).length) return { ok: true, message: "Aucune modification." };

    await db.transaction(async (tx) => {
      await tx
        .update(tuteurs)
        .set({ ...maj, modifieLe: new Date().toISOString() })
        .where(eq(tuteurs.id, tuteurId));
      if (avant.utilisateurId) {
        await tx
          .update(utilisateurs)
          .set({
            telephone: numero,
            email: v.email || null,
            nom: v.nom,
            prenom: v.prenom,
            modifieLe: new Date().toISOString(),
          })
          .where(eq(utilisateurs.id, avant.utilisateurId));
        if (avant.telephone !== numero) {
          await tx.execute(sql`DELETE FROM sessions WHERE utilisateur_id = ${avant.utilisateurId}::uuid`);
          await tx.execute(
            sql`UPDATE jetons_rafraichissement SET revoque = TRUE WHERE utilisateur_id = ${avant.utilisateurId}::uuid`,
          );
        }
      }
    });

    await journaliser(acteur, {
      action: "tuteur.profil_modifie",
      entite: "tuteurs",
      entiteId: tuteurId,
      avant: Object.fromEntries(Object.entries(changements).map(([c, x]) => [c, x.avant])),
      apres: Object.fromEntries(Object.entries(changements).map(([c, x]) => [c, x.apres])),
    });
    revalidatePath("/dashboard/parents");
    revalidatePath(`/dashboard/parents/${tuteurId}`);
    return { ok: true, message: "Profil du parent mis à jour." };
  } catch (e) {
    return echec(e, "La modification du profil a échoué.");
  }
}

/**
 * Suppression très limitée aux fiches ORPHELINES, jamais des responsables
 * rattachés à un élève, possédant un compte ou ayant des notifications.
 * Les liens familiaux et historiques ne sont donc pas effacés par un clic.
 */
export async function supprimerTuteurOrphelin(
  tuteurId: string,
  confirmation: string,
  motif: string,
): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    if (!z.string().uuid().safeParse(tuteurId).success) return { ok: false, message: "Identifiant invalide." };
    if (motif.trim().length < 8) return { ok: false, message: "Un motif de 8 caractères minimum est nécessaire." };
    const suppression = await db.transaction(async (tx) => {
      const r = await tx.execute<{ id: string; nom: string; prenom: string; bloque: boolean }>(sql`
        SELECT t.id, t.nom, t.prenom,
          (
            t.utilisateur_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM eleve_tuteur et WHERE et.tuteur_id = t.id)
            OR EXISTS (SELECT 1 FROM notifications n WHERE n.telephone = t.telephone)
          ) AS bloque
        FROM tuteurs t WHERE t.id = ${tuteurId}::uuid FOR UPDATE
      `);
      const ligne = r.rows[0];
      if (!ligne) return { ok: false as const, message: "Fiche introuvable." };
      if (confirmation.trim() !== ligne.prenom + " " + ligne.nom) {
        return { ok: false as const, message: "Saisissez exactement le nom et le prénom pour confirmer." };
      }
      if (ligne.bloque)
        return {
          ok: false as const,
          message:
            "Suppression impossible : un compte, des enfants ou un historique de notification est lié à ce tuteur. Vous pouvez révoquer l’accès au lieu de supprimer.",
        };
      await tx.delete(tuteurs).where(eq(tuteurs.id, tuteurId));
      return { ok: true as const, nom: ligne.prenom + " " + ligne.nom };
    });
    if (!suppression.ok) return suppression;
    await journaliser(acteur, {
      action: "tuteur.fiche_orpheline_supprimee",
      entite: "tuteurs",
      entiteId: tuteurId,
      motif: motif.trim(),
      avant: { nom: suppression.nom },
    });
    revalidatePath("/dashboard/parents");
    return { ok: true, message: "Fiche orpheline supprimée. Aucun lien d’élève ni compte n’a été touché." };
  } catch (e) {
    return echec(e, "Suppression refusée : la fiche possède peut-être des données liées.");
  }
}
