"use server";

import { revalidatePath } from "next/cache";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { annonceDestinataires, annonces, messages } from "@/server/db/schema";
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
    expireLe: z.string().optional(),
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
  });

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
    await db.update(annonces).set({ publiee }).where(eq(annonces.id, annonceId));
    await journaliser(acteur, {
      action: publiee ? "annonce.reactivee" : "annonce.retiree",
      entite: "annonces",
      entiteId: annonceId,
    });
    revalidatePath("/dashboard/communication");
    return OK;
  } catch (e) {
    return echec(e, "L'opération a échoué.");
  }
}

export async function epinglerAnnonce(annonceId: string, epinglee: boolean): Promise<Resultat> {
  try {
    await requirePermission("annonce:publier");
    await db.update(annonces).set({ epinglee }).where(eq(annonces.id, annonceId));
    revalidatePath("/dashboard/communication");
    return OK;
  } catch (e) {
    return echec(e, "L'opération a échoué.");
  }
}

// ===========================================================================
// Messages
// ===========================================================================

const schemaMessage = z.object({
  destinataireId: z.string().uuid("Sélectionnez un destinataire"),
  eleveId: z.string().uuid().nullable().optional(),
  objet: z.string().trim().min(3, "Objet requis"),
  contenu: z.string().trim().min(5, "Message trop court"),
});

export async function envoyerMessage(donnees: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("message:envoyer");
    const a = schemaMessage.safeParse(donnees);
    if (!a.success) return { ok: false, erreurs: messagesErreur(a.error) };

    const v = a.data;

    await db.transaction(async (tx) => {
      const [cree] = await tx
        .insert(messages)
        .values({
          expediteurId: acteur.id,
          destinataireId: v.destinataireId,
          eleveId: v.eleveId ?? null,
          objet: v.objet,
          contenu: v.contenu,
        })
        .returning({ id: messages.id });

      // Un message ciblé mérite une notification : sinon le tuteur ne le voit
      // qu'en ouvrant l'application de sa propre initiative.
      await tx.execute(sql`
        INSERT INTO notifications (destinataire_id, eleve_id, type, canal, titre, corps, route_cible, donnees)
        VALUES (
          ${v.destinataireId}::uuid,
          ${v.eleveId ?? null}::uuid,
          'AUTRE'::type_notification,
          'PUSH'::canal_notification,
          ${`Message de l'établissement`},
          ${v.objet},
          ${`/messages/${cree.id}`},
          ${JSON.stringify({ message_id: cree.id })}::jsonb
        )
      `);

      await journaliser(acteur, {
        action: "message.envoye",
        entite: "messages",
        entiteId: cree.id,
        eleveId: v.eleveId ?? null,
        apres: { objet: v.objet },
      });
    });

    revalidatePath("/dashboard/communication");
    return { ok: true, message: "Message envoyé." };
  } catch (e) {
    return echec(e, "L'envoi du message a échoué.");
  }
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
    const acteur = await requirePermission("annonce:publier");
    const rapport = await traiterFile(200);

    await journaliser(acteur, {
      action: "notifications.traitees",
      entite: "notifications",
      apres: rapport,
    });

    revalidatePath("/dashboard/communication");

    if (rapport.traitees === 0 && rapport.canauxIndisponibles.length > 0) {
      return {
        ok: false,
        message:
          `Aucun canal disponible : ${rapport.canauxIndisponibles.join(", ")}. ` +
          "Les notifications restent en file et partiront dès la configuration.",
      };
    }

    if (rapport.traitees === 0) {
      return { ok: true, message: "Aucune notification à traiter." };
    }

    const details = [
      `${rapport.envoyees} envoyée(s)`,
      rapport.echouees > 0 ? `${rapport.echouees} en échec` : null,
      rapport.ignorees > 0 ? `${rapport.ignorees} en attente de canal` : null,
      rapport.coutSmsFcfa > 0 ? `coût SMS ${rapport.coutSmsFcfa} F` : null,
      rapport.jetonsNettoyes > 0 ? `${rapport.jetonsNettoyes} appareil(s) obsolète(s) retiré(s)` : null,
    ].filter(Boolean);

    return { ok: rapport.envoyees > 0, message: details.join(" · ") };
  } catch (e) {
    return echec(e, "Le traitement de la file a échoué.");
  }
}
