"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { segmentsSms } from "@/lib/segments-sms";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { reveillerFile } from "@/server/notifications/reveil";
import { signatureSms } from "@/server/notifications/sms";

const canalSchema = z.enum(["AUTO", "APP", "SMS", "APP_ET_SMS"]);
export type CanalIndividuel = z.infer<typeof canalSchema>;

const schemaEnvoi = z.object({
  titre: z.string().trim().min(3).max(80),
  corps: z.string().trim().min(5).max(600),
  canal: canalSchema,
  coutConfirmeFcfa: z.number().int().min(0),
  nombreConfirme: z.number().int().min(0).max(2),
  cleEnvoi: z.string().uuid(),
});

interface Contact {
  id: string;
  utilisateur_id: string | null;
  compte_actif: boolean | null;
  telephone: string | null;
  accepte_sms: boolean | null;
  push_disponible: boolean;
  politique: string;
}
type CanalReel = "PUSH" | "SMS" | "IN_APP";

export interface ApercuNotificationParent {
  total: number;
  parPush: number;
  parSms: number;
  dansApplication: number;
  coutFcfa: number;
  segments: number;
  avertissement: string | null;
}

const idValide = z.string().uuid();

async function lireContact(tuteurId: string, executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<Contact | undefined> {
  const resultat = await executor.execute<Contact>(sql`
    SELECT t.id, t.utilisateur_id, u.actif AS compte_actif,
           t.telephone, t.accepte_sms,
           EXISTS (
             SELECT 1 FROM appareils a
             WHERE a.utilisateur_id = t.utilisateur_id
               AND a.actif AND a.jeton_fcm IS NOT NULL
           ) AS push_disponible,
           COALESCE((
             SELECT p.politique::text FROM politiques_notification p
             WHERE p.type = 'ANNONCE'::type_notification
           ), 'PUSH_SINON_SMS') AS politique
      FROM tuteurs t
      LEFT JOIN utilisateurs u ON u.id = t.utilisateur_id
     WHERE t.id = ${tuteurId}::uuid
     LIMIT 1
  `);
  return resultat.rows[0];
}

function planifier(t: Contact, canal: CanalIndividuel): CanalReel[] {
  const peutApp = !!t.utilisateur_id && t.compte_actif === true;
  const push = peutApp && t.push_disponible;
  const sms = !!t.telephone?.trim() && t.accepte_sms === true;
  const resultat: CanalReel[] = [];
  if (canal === "SMS") return sms ? ["SMS"] : [];
  if (canal === "APP") return push ? ["PUSH"] : peutApp ? ["IN_APP"] : [];
  if (canal === "APP_ET_SMS") {
    if (push) resultat.push("PUSH");
    else if (peutApp) resultat.push("IN_APP");
    if (sms) resultat.push("SMS");
    return resultat;
  }
  if (t.politique === "AUCUN") return [];
  if (t.politique === "PUSH_SINON_SMS") {
    if (push) return ["PUSH"];
    if (sms) return ["SMS"];
  } else if (t.politique === "PUSH_ET_SMS") {
    if (push) resultat.push("PUSH");
    if (sms) resultat.push("SMS");
  } else if (t.politique === "PUSH_SEUL" && push) resultat.push("PUSH");
  else if (t.politique === "SMS_SEUL" && sms) resultat.push("SMS");
  if (resultat.length === 0 && peutApp) resultat.push("IN_APP");
  return resultat;
}

function devis(t: Contact, canal: CanalIndividuel, titre: string, corps: string): ApercuNotificationParent {
  const destinations = planifier(t, canal);
  const parSms = destinations.filter(x => x === "SMS").length;
  const parPush = destinations.filter(x => x === "PUSH").length;
  const dansApplication = destinations.filter(x => x === "IN_APP").length;
  // Même signature que l'expéditeur réel, pour éviter un coût sous-estimé.
  const segments = segmentsSms(`${signatureSms()}${titre}\n${corps}`);
  const avertissement = destinations.length === 0
    ? "Ce parent n’est actuellement joignable par aucun canal sélectionné."
    : dansApplication > 0
      ? "Le message sera disponible dans l’application, mais aucune alerte immédiate n’est garantie."
      : null;
  return {
    total: destinations.length, parPush, parSms, dansApplication,
    segments, coutFcfa: parSms * segments * COUT_SMS_FCFA, avertissement,
  };
}

/** Prévisualise exactement un parent, sans créer de notification. */
export async function apercuNotificationParent(
  tuteurId: string, titre: string, corps: string, canal: CanalIndividuel,
): Promise<ApercuNotificationParent> {
  await requirePermission("message:envoyer");
  if (!idValide.safeParse(tuteurId).success || !canalSchema.safeParse(canal).success) {
    throw new Error("Paramètres invalides.");
  }
  const contact = await lireContact(tuteurId, db);
  if (!contact) throw new Error("Parent introuvable.");
  return devis(contact, canal, titre, corps);
}

export async function envoyerNotificationParent(tuteurId: string, donnees: unknown): Promise<{
  ok: boolean; message: string; posees?: number;
}> {
  try {
    const acteur = await requirePermission("message:envoyer");
    if (!idValide.safeParse(tuteurId).success) return { ok: false, message: "Identifiant du parent invalide." };
    const validation = schemaEnvoi.safeParse(donnees);
    if (!validation.success) return { ok: false, message: "Complétez le message et actualisez le devis." };
    const { titre, corps, canal, coutConfirmeFcfa, nombreConfirme, cleEnvoi } = validation.data;

    const depot = await db.transaction(async (tx) => {
      // Deux clics simultanés pour le même message sont sérialisés.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tuteurId}), hashtext(${cleEnvoi}))`);
      const deja = await tx.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM notifications
         WHERE donnees->>'cleEnvoi' = ${cleEnvoi}
           AND donnees->>'tuteurId' = ${tuteurId}
      `);
      if (Number(deja.rows[0]?.n ?? 0) > 0) return { ok: true, posees: 0, deja: true };

      const contact = await lireContact(tuteurId, tx);
      if (!contact) return { ok: false, message: "Parent introuvable." };
      const estimation = devis(contact, canal, titre, corps);
      if (estimation.total === 0) return { ok: false, message: "Aucun canal disponible pour ce parent." };
      if (estimation.total > nombreConfirme || estimation.coutFcfa > coutConfirmeFcfa) {
        return { ok: false, message: "Le coût ou le canal a changé. Vérifiez le devis avant l’envoi." };
      }
      const canaux = planifier(contact, canal);
      await tx.insert(notifications).values(canaux.map(c => ({
        destinataireId: c === "SMS" ? (contact.utilisateur_id ?? null) : contact.utilisateur_id,
        telephone: c === "SMS" ? contact.telephone : null,
        eleveId: null,
        type: "ANNONCE" as const,
        canal: c,
        titre,
        corps,
        routeCible: null,
        donnees: { origine: "page_parents", tuteurId, canalChoisi: canal, cleEnvoi },
      })));
      return { ok: true, posees: canaux.length, deja: false };
    });

    if (!depot.ok) return depot;
    if (depot.deja) return { ok: true, message: "Ce message a déjà été enregistré, aucun doublon créé.", posees: 0 };

    // Dépôt déjà validé : un souci d'audit ne doit pas provoquer un nouvel envoi.
    try {
      await journaliser(acteur, {
        action: "notification.parent_individuel",
        entite: "tuteurs", entiteId: tuteurId,
        apres: { titre, canal, notifications: depot.posees },
      });
    } catch (erreur) { console.error("[parent-notif:audit]", erreur); }
    try { reveillerFile(); } catch (erreur) { console.error("[parent-notif:reveil]", erreur); }
    revalidatePath("/dashboard/parents");
    revalidatePath(`/dashboard/parents/${tuteurId}`);
    return { ok: true, message: `${depot.posees} notification(s) mise(s) en file pour ce parent.`, posees: depot.posees };
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n’avez pas la permission d’envoyer des notifications." };
    }
    console.error("[parent-notif:erreur]", erreur);
    return { ok: false, message: "Le serveur n’a pas confirmé l’envoi. Consultez l’historique avant de réessayer." };
  }
}
