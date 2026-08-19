"use server";

import { createHash, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { codesActivation, tuteurs, utilisateurs } from "@/server/db/schema";
import { telephoneDisponible } from "@/server/domain/parents";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { normaliserNumero } from "@/server/notifications/sms";

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

const DUREE_CODE_MINUTES = 60 * 24 * 7; // une semaine : le parent passe au guichet quand il peut

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

    if (!(await telephoneDisponible(numero, tuteurId))) {
      return {
        ok: false,
        message:
          "Ce numéro est déjà rattaché à un autre compte parent. Vérifiez qu'il ne s'agit pas d'un doublon.",
      };
    }

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
      await tx
        .update(codesActivation)
        .set({ consomme: true })
        .where(eq(codesActivation.telephone, numero));

      await tx.insert(codesActivation).values({
        telephone: numero,
        codeHash: empreinte(code),
        expireLe: new Date(Date.now() + DUREE_CODE_MINUTES * 60_000).toISOString(),
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
            ${`Votre code d'activation est ${code}. Il est valable 7 jours. Ne le communiquez à personne.`}
          )
        `);
      }
    });

    await journaliser(acteur, {
      action: "tuteur.invite",
      entite: "tuteurs",
      entiteId: tuteurId,
      apres: { telephone: numero, smsEnvoye: tuteur.accepteSms },
    });

    revalidatePath("/dashboard/parents");
    return {
      ok: true,
      code,
      message: tuteur.accepteSms
        ? `Code envoyé par SMS au ${numero}.`
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
export async function inviterClasse(classeId: string): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:inviter");

    const cibles = await db.execute<{ id: string }>(sql`
      SELECT DISTINCT t.id
        FROM tuteurs t
        JOIN eleve_tuteur et ON et.tuteur_id = t.id AND et.est_principal
        JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
       WHERE i.classe_id = ${classeId}::uuid
         AND t.utilisateur_id IS NULL
    `);

    if (cibles.rows.length === 0) {
      return { ok: false, message: "Tous les tuteurs principaux de cette classe ont déjà un compte." };
    }

    let invites = 0;
    let echecs = 0;

    for (const cible of cibles.rows) {
      const r = await inviterTuteur(cible.id);
      if (r.ok) invites += 1;
      else echecs += 1;
    }

    await journaliser(acteur, {
      action: "tuteurs.invites_en_masse",
      entite: "tuteurs",
      entiteId: classeId,
      apres: { invites, echecs },
    });

    revalidatePath("/dashboard/parents");
    return {
      ok: invites > 0,
      message:
        echecs > 0
          ? `${invites} tuteur(s) invité(s), ${echecs} en échec (numéro déjà utilisé).`
          : `${invites} tuteur(s) invité(s). Les codes partent par SMS.`,
    };
  } catch (e) {
    return echec(e, "L'invitation en masse a échoué.");
  }
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
      await tx.execute(
        sql`UPDATE appareils SET actif = FALSE WHERE utilisateur_id = ${tuteur.utilisateurId}::uuid`,
      );
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
  telephone: z.string().trim().regex(/^\+?[0-9\s.-]{8,20}$/, "Numéro invalide"),
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
