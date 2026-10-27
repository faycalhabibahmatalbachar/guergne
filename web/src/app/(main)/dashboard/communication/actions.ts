"use server";

import { revalidatePath } from "next/cache";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { annonceDestinataires, annonces, anneesScolaires, classes, eleveTuteur, inscriptions, messages, niveaux, notifications, tuteurs, utilisateurs } from "@/server/db/schema";
import { traiterFile } from "@/server/notifications/expediteur";
import { ErreurAutorisation, requirePermission } from "@/server/guard";

export interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}

const OK: Resultat = { ok: true };

function echec(e: unknown, defaut: string): Resultat {
  if (e instanceof ErreurAutorisation) {
    return { ok: false, message: "Vous n'avez pas les droits pour cette opération." };
  }
  console.error("[communication]", e);
  return { ok: false, message: defaut };
}

function messagesErreur(e: z.ZodError): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of e.issues) {
    const c = String(p.path[0] ?? "_");
    if (!s[c]) s[c] = p.message;
  }
  return s;
}

// ===========================================================================
// Annonces
// ===========================================================================

const schemaAnnonce = z
  .object({
    anneeId: z.string().uuid(),
    titre: z.string().trim().min(3, "Titre requis"),
    contenu: z.string().trim().min(10, "Le contenu doit être explicite"),
    cible: z.enum(["TOUS", "NIVEAU", "CLASSE", "ELEVE"]),
    niveauId: z.string().uuid().nullable().optional(),
    classeId: z.string().uuid().nullable().optional(),
    elevesIds: z.array(z.string().uuid()).default([]),
    epinglee: z.boolean().default(false),
    envoyerPush: z.boolean().default(true),
    expireLe: z.string().refine((v) => v === "" || dateIsoValide(v), { message: "Date d’expiration invalide" }).optional(),
  })
  .refine((v) => v.cible !== "NIVEAU" || !!v.niveauId, {
    message: "Sélectionnez le niveau visé",
    path: ["niveauId"],
  })
  .refine((v) => v.cible !== "CLASSE" || !!v.classeId, {
    message: "Sélectionnez la classe visée",
    path: ["classeId"],
  })
  .refine((v) => v.cible !== "ELEVE" || v.elevesIds.length > 0, {
    message: "Sélectionnez au moins un élève",
    path: ["elevesIds"],
  })
  .refine((v) => new Set(v.elevesIds).size === v.elevesIds.length, {
    message: "Un élève ne peut être sélectionné qu’une seule fois.",
    path: ["elevesIds"],
  });


function dateIsoValide(value: string): boolean {
  if (value.length !== 10 || value[4] !== "-" || value[7] !== "-") return false;
  const [annee, mois, jour] = value.split("-").map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
}

async function validerCibleAnnonce(v: z.infer<typeof schemaAnnonce>): Promise<Record<string, string> | null> {
  const [annee] = await db.select({ id: anneesScolaires.id })
    .from(anneesScolaires).where(eq(anneesScolaires.id, v.anneeId)).limit(1);
  if (!annee) return { anneeId: "Cette année scolaire n’existe pas." };

  if (v.cible === "CLASSE") {
    const [classe] = await db.select({ id: classes.id }).from(classes).where(and(
      eq(classes.id, v.classeId ?? ""), eq(classes.anneeId, v.anneeId), eq(classes.active, true),
    )).limit(1);
    if (!classe) return { classeId: "Cette classe n’est pas active dans l’année scolaire sélectionnée." };
  }

  if (v.cible === "NIVEAU") {
    const [niveau] = await db.select({ id: niveaux.id }).from(niveaux)
      .where(eq(niveaux.id, v.niveauId ?? "")).limit(1);
    const [classeInscrite] = await db.select({ id: classes.id }).from(classes)
      .innerJoin(inscriptions, and(
        eq(inscriptions.classeId, classes.id),
        eq(inscriptions.anneeId, v.anneeId),
        eq(inscriptions.active, true),
      ))
      .where(and(
        eq(classes.anneeId, v.anneeId),
        eq(classes.niveauId, v.niveauId ?? ""),
        eq(classes.active, true),
      )).limit(1);
    if (!niveau || !classeInscrite) {
      return { niveauId: "Ce niveau n’a pas de classe active avec des élèves inscrits pour cette année." };
    }
  }

  if (v.cible === "ELEVE") {
    const inscrits = await db.select({ id: inscriptions.eleveId })
      .from(inscriptions).innerJoin(classes, eq(classes.id, inscriptions.classeId))
      .where(and(
        eq(inscriptions.anneeId, v.anneeId),
        eq(inscriptions.active, true),
        eq(classes.anneeId, v.anneeId),
        eq(classes.active, true),
        inArray(inscriptions.eleveId, v.elevesIds),
      ));
    if (new Set(inscrits.map((ligne) => ligne.id)).size !== v.elevesIds.length) {
      return { elevesIds: "Au moins un élève sélectionné n’est pas inscrit dans une classe active de cette année." };
    }
  }
  return null;
}

/**
 * Publie une annonce et met en file les notifications.
 *
 * La diffusion est calculée EN BASE, au moment de la publication : recalculer
 * à l'envoi donnerait une population différente si un élève change de classe
 * entre-temps, et certaines familles recevraient un message qui ne les
 * concerne plus.
 */
export async function publierAnnonce(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");
    const a = schemaAnnonce.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messagesErreur(a.error) };

    const v = a.data;
    const erreurCible = await validerCibleAnnonce(v);
    if (erreurCible) return { ok: false, erreurs: erreurCible };
    let nbNotifications = 0;

    await db.transaction(async (tx) => {
      const [creee] = await tx
        .insert(annonces)
        .values({
          anneeId: v.anneeId,
          titre: v.titre,
          contenu: v.contenu,
          cible: v.cible,
          niveauId: v.cible === "NIVEAU" ? (v.niveauId ?? null) : null,
          classeId: v.cible === "CLASSE" ? (v.classeId ?? null) : null,
          epinglee: v.epinglee,
          envoyerPush: v.envoyerPush,
          expireLe: v.expireLe ? new Date(v.expireLe).toISOString() : null,
          publieePar: acteur.id,
        })
        .returning({ id: annonces.id });

      if (v.cible === "ELEVE" && v.elevesIds.length > 0) {
        await tx
          .insert(annonceDestinataires)
          .values(v.elevesIds.map((eleveId) => ({ annonceId: creee.id, eleveId })));
      }

      const r = await tx.execute<{ n: number }>(sql`SELECT diffuser_annonce(${creee.id}::uuid) AS n`);
      nbNotifications = Number(r.rows[0]?.n ?? 0);

      await journaliser(acteur, {
        action: "annonce.publiee",
        entite: "annonces",
        entiteId: creee.id,
        apres: { titre: v.titre, cible: v.cible, nbNotifications },
      });
    });

    revalidatePath("/dashboard/communication");
    return {
      ok: true,
      message: v.envoyerPush
        ? `Annonce publiée. ${nbNotifications} notification(s) mise(s) en file.`
        : "Annonce publiée (sans notification).",
    };
  } catch (e) {
    return echec(e, "La publication de l'annonce a échoué.");
  }
}

export async function basculerAnnonce(annonceId: string, publiee: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");
    const valide = z.string().uuid().safeParse(annonceId);
    if (!valide.success) return { ok: false, message: "Identifiant d’annonce invalide." };
    const [modifiee] = await db.update(annonces).set({ publiee })
      .where(eq(annonces.id, valide.data)).returning({ id: annonces.id });
    if (!modifiee) return { ok: false, message: "Cette annonce n’existe plus." };
    await journaliser(acteur, {
      action: publiee ? "annonce.reactivee" : "annonce.retiree",
      entite: "annonces", entiteId: valide.data,
    });
    revalidatePath("/dashboard/communication");
    return { ok: true, message: publiee ? "Annonce réactivée." : "Annonce retirée." };
  } catch (e) { return echec(e, "L’opération a échoué."); }
}

export async function epinglerAnnonce(annonceId: string, epinglee: boolean): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");
    const valide = z.string().uuid().safeParse(annonceId);
    if (!valide.success) return { ok: false, message: "Identifiant d’annonce invalide." };
    const [modifiee] = await db.update(annonces).set({ epinglee })
      .where(eq(annonces.id, valide.data)).returning({ id: annonces.id });
    if (!modifiee) return { ok: false, message: "Cette annonce n’existe plus." };
    await journaliser(acteur, {
      action: epinglee ? "annonce.epinglee" : "annonce.desepinglee",
      entite: "annonces", entiteId: valide.data,
    });
    revalidatePath("/dashboard/communication");
    return { ok: true, message: epinglee ? "Annonce épinglée." : "Annonce désépinglée." };
  } catch (e) { return echec(e, "L’opération a échoué."); }
}

// ===========================================================================
// Messages
// ===========================================================================

const schemaMessage = z.object({
  anneeId: z.string().uuid(),
  destinataireId: z.string().uuid("Sélectionnez un destinataire"),
  eleveId: z.string().uuid().nullable().optional(),
  objet: z.string().trim().min(3, "Objet requis").max(180, "Objet trop long"),
  contenu: z.string().trim().min(5, "Message trop court").max(5000, "Message trop long"),
});

export async function envoyerMessage(donnees: unknown): Promise<Resultat> {
  try {
    const a = schemaMessage.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messagesErreur(a.error) };
    const v = a.data;

    const contexte = v.eleveId
      ? await db.select({ classeId: inscriptions.classeId }).from(inscriptions)
          .innerJoin(classes, eq(classes.id, inscriptions.classeId))
          .where(and(
            eq(inscriptions.eleveId, v.eleveId),
            eq(inscriptions.anneeId, v.anneeId),
            eq(inscriptions.active, true),
            eq(classes.anneeId, v.anneeId),
            eq(classes.active, true),
          )).limit(1)
      : [];
    const acteur = await requirePermission(
      "message:envoyer",
      contexte[0] ? { classeId: contexte[0].classeId, eleveId: v.eleveId ?? undefined } : {},
    );
    if (v.eleveId && !contexte[0]) {
      return { ok: false, erreurs: { eleveId: "Cet élève n’est pas inscrit dans une classe active de cette année." } };
    }

    const [destinataire] = await db.select({ id: utilisateurs.id, tuteurId: tuteurs.id })
      .from(utilisateurs)
      .innerJoin(tuteurs, eq(tuteurs.utilisateurId, utilisateurs.id))
      .where(and(
        eq(utilisateurs.id, v.destinataireId),
        eq(utilisateurs.role, "PARENT"),
        eq(utilisateurs.actif, true),
      )).limit(1);
    if (!destinataire) {
      return { ok: false, erreurs: { destinataireId: "Ce compte parent est introuvable ou inactif." } };
    }

    const conditions = [
      eq(eleveTuteur.tuteurId, destinataire.tuteurId),
      eq(inscriptions.anneeId, v.anneeId),
      eq(inscriptions.active, true),
      eq(classes.anneeId, v.anneeId),
      eq(classes.active, true),
    ];
    if (v.eleveId) conditions.push(eq(eleveTuteur.eleveId, v.eleveId));
    const lien = await db.select({ eleveId: eleveTuteur.eleveId }).from(eleveTuteur)
      .innerJoin(inscriptions, eq(inscriptions.eleveId, eleveTuteur.eleveId))
      .innerJoin(classes, eq(classes.id, inscriptions.classeId))
      .where(and(...conditions)).limit(1);
    if (!lien.length) {
      return v.eleveId
        ? { ok: false, erreurs: { eleveId: "Le destinataire n’est pas rattaché à cet élève pour l’année sélectionnée." } }
        : { ok: false, erreurs: { destinataireId: "Ce parent n’est rattaché à aucun élève actif de cette année." } };
    }

    await db.transaction(async (tx) => {
      const [cree] = await tx.insert(messages).values({
        expediteurId: acteur.id, destinataireId: v.destinataireId, eleveId: v.eleveId ?? null,
        objet: v.objet, contenu: v.contenu,
      }).returning({ id: messages.id });
      await tx.insert(notifications).values({
        destinataireId: v.destinataireId, eleveId: v.eleveId ?? null, type: "AUTRE", canal: "PUSH",
        titre: "Message de l’établissement", corps: v.objet, routeCible: "/messages/" + cree.id,
        donnees: { message_id: cree.id },
      });
      await journaliser(acteur, {
        action: "message.envoye", entite: "messages", entiteId: cree.id,
        eleveId: v.eleveId ?? null, apres: { objet: v.objet },
      });
    });

    revalidatePath("/dashboard/communication");
    return { ok: true, message: "Message enregistré et notification mise en file." };
  } catch (e) { return echec(e, "L’envoi du message a échoué."); }
}

export async function marquerMessageLu(messageId: string): Promise<Resultat> {
  try {
    await requirePermission("message:lire");
    await db
      .update(messages)
      .set({ lu: true, luLe: new Date().toISOString() })
      .where(eq(messages.id, messageId));
    revalidatePath("/dashboard/communication");
    return OK;
  } catch (e) {
    return echec(e, "L'opération a échoué.");
  }
}

// ===========================================================================
// File d'expédition
// ===========================================================================

/**
 * Vide la file des notifications en attente.
 *
 * Délègue à l'expéditeur, qui n'accuse un envoi que sur confirmation du canal.
 * Un canal non configuré laisse ses notifications EN FILE plutôt que de les
 * marquer en échec : elles partiront dès qu'il sera branché.
 */
export async function traiterFileNotifications(): Promise<Resultat> {
  try {
    const acteur = await requirePermission("notification:configurer");
    const rapport = await traiterFile(200);
    await journaliser(acteur, { action: "notifications.traitees", entite: "notifications", apres: rapport });
    revalidatePath("/dashboard/communication");
    const [etatRestant] = await db.select({ nombre: count() }).from(notifications)
      .where(eq(notifications.statut, "EN_ATTENTE"));
    const restants = Number(etatRestant?.nombre ?? 0);

    if (rapport.traitees === 0 && rapport.canauxIndisponibles.length > 0) {
      return { ok: false, message: "Aucun canal disponible : " + rapport.canauxIndisponibles.join(", ") +
        ". Les notifications restent en file (" + restants + " en attente)." };
    }
    if (rapport.traitees === 0) {
      return { ok: true, message: "Aucune notification traitée. " + restants + " restent en attente." };
    }
    const details = [
      rapport.envoyees + " envoyée(s)",
      rapport.echouees > 0 ? rapport.echouees + " en échec" : null,
      rapport.ignorees > 0 ? rapport.ignorees + " en attente de canal" : null,
      rapport.coutSmsFcfa > 0 ? "coût SMS " + rapport.coutSmsFcfa.toLocaleString("fr-FR") + " F" : null,
      rapport.jetonsNettoyes > 0 ? rapport.jetonsNettoyes + " appareil(s) obsolète(s) retiré(s)" : null,
      restants > 0 ? restants + " restant(s) en file" : "File vide",
    ].filter(Boolean);
    return { ok: true, message: details.join(" · ") };
  } catch (e) { return echec(e, "Le traitement de la file a échoué."); }
}
