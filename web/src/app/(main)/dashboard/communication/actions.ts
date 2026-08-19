"use server";

import { revalidatePath } from "next/cache";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { annonceDestinataires, annonces, messages } from "@/server/db/schema";
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
 * Tant que les identifiants FCM et la passerelle SMS ne sont pas configurés,
 * cette action ne peut RIEN envoyer. Elle le dit explicitement plutôt que de
 * marquer les notifications « envoyées » sans que personne ne les reçoive —
 * ce serait le pire des deux mondes : les familles ne sont pas prévenues, et
 * l'établissement croit qu'elles l'ont été.
 */
export async function traiterFileNotifications(): Promise<Resultat> {
  try {
    const acteur = await requirePermission("annonce:publier");

    const fcmConfigure = Boolean(
      process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY,
    );
    const smsConfigure = Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY);

    const r = await db.execute<{ canal: string; n: number }>(sql`
      SELECT canal::text, count(*)::int AS n
        FROM v_file_notifications
       GROUP BY canal
    `);

    const enAttente = Object.fromEntries(r.rows.map((l) => [l.canal, Number(l.n)]));
    const push = enAttente.PUSH ?? 0;
    const sms = enAttente.SMS ?? 0;

    if (!fcmConfigure && !smsConfigure) {
      return {
        ok: false,
        message:
          `Aucun canal n'est configuré. ${push + sms} notification(s) restent en file. ` +
          "Renseignez les identifiants Firebase (FCM_*) pour le push et la passerelle SMS (SMS_*) dans les variables d'environnement.",
      };
    }

    const manquants: string[] = [];
    if (!fcmConfigure && push > 0) manquants.push(`${push} push (Firebase non configuré)`);
    if (!smsConfigure && sms > 0) manquants.push(`${sms} SMS (passerelle non configurée)`);

    await journaliser(acteur, {
      action: "notifications.traitement_demande",
      entite: "notifications",
      apres: { push, sms, fcmConfigure, smsConfigure },
    });

    return {
      ok: false,
      message:
        manquants.length > 0
          ? `Envoi impossible : ${manquants.join(", ")}.`
          : "Les canaux sont configurés, mais l'expéditeur n'est pas encore branché.",
    };
  } catch (e) {
    return echec(e, "Le traitement de la file a échoué.");
  }
}
