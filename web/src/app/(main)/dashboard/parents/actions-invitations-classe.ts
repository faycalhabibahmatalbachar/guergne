"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { requirePermission } from "@/server/guard";
import { inviterTuteur } from "./actions";

export interface CandidatInvitation {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
}
export interface ApercuInvitationsClasse {
  classeId: string;
  totalPrincipaux: number;
  dejaAvecCompte: number;
  sansConsentementSms: number;
  eligibles: CandidatInvitation[];
  coutMaxFcfa: number;
  empreinte: string;
}
type ReponseApercu = { ok: true; apercu: ApercuInvitationsClasse } | { ok: false; message: string };
type ReponseInvitation = { ok: boolean; message: string; invites?: number; echecs?: number };

const schemaClasse = z.string().uuid();

/**
 * Un parent sans compte ne peut pas recevoir une notification PUSH :
 * seule l'invitation SMS est automatisée. Les parents sans consentement sont
 * exclus et invités individuellement au guichet, sans compte créé en masse.
 */
async function calculerApercu(classeId: string): Promise<ApercuInvitationsClasse> {
  const resultats = await db.execute<{
    id: string; nom: string; prenom: string; telephone: string;
    compte: string | null; accepte_sms: boolean;
  }>(sql`
    SELECT DISTINCT t.id::text, t.nom, t.prenom, t.telephone,
           t.utilisateur_id::text AS compte, t.accepte_sms
    FROM tuteurs t
    JOIN eleve_tuteur et ON et.tuteur_id = t.id AND et.est_principal
    JOIN inscriptions i ON i.eleve_id = et.eleve_id AND i.active
    WHERE i.classe_id = ${classeId}::uuid
    ORDER BY t.nom, t.prenom, t.id::text
  `);
  const parents = resultats.rows;
  const eligibles = parents
    .filter(t => !t.compte && t.accepte_sms)
    .map(t => ({ id: t.id, nom: t.nom, prenom: t.prenom, telephone: t.telephone }));
  // Empreinte d'une photographie des destinataires (et numéros) pour détecter
  // tout changement après la prévisualisation, avant une action facturable.
  const empreinte = createHash("sha256").update(JSON.stringify(eligibles)).digest("hex");
  return {
    classeId, totalPrincipaux: parents.length,
    dejaAvecCompte: parents.filter(t => Boolean(t.compte)).length,
    sansConsentementSms: parents.filter(t => !t.compte && !t.accepte_sms).length,
    eligibles, coutMaxFcfa: eligibles.length * COUT_SMS_FCFA,
    empreinte,
  };
}

export async function previsualiserInvitationsClasse(classeId: string): Promise<ReponseApercu> {
  try {
    await requirePermission("tuteur:inviter");
    if (!schemaClasse.safeParse(classeId).success) {
      return { ok: false, message: "Sélectionnez une classe valide." };
    }
    return { ok: true, apercu: await calculerApercu(classeId) };
  } catch {
    return { ok: false, message: "Impossible de consulter les destinataires de cette classe." };
  }
}

const validationEnvoi = z.object({
  classeId: z.string().uuid(),
  empreinte: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.literal(true),
  canal: z.literal("SMS"),
  portee: z.literal("PRINCIPAUX_SANS_COMPTE"),
});
export async function confirmerInvitationsClasse(input: unknown): Promise<ReponseInvitation> {
  try {
    const acteur = await requirePermission("tuteur:inviter");
    const parsed = validationEnvoi.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Configuration ou confirmation invalide." };
    const donnees = parsed.data;
    const apercu = await calculerApercu(donnees.classeId);
    if (apercu.empreinte !== donnees.empreinte) {
      return { ok: false, message: "Les destinataires ont changé. Actualisez l'aperçu avant d'envoyer." };
    }
    if (apercu.eligibles.length === 0) {
      return { ok: false, message: "Aucun tuteur principal éligible à l'envoi SMS dans cette classe." };
    }
    let invites = 0;
    let echecs = 0;
    for (const cible of apercu.eligibles) {
      // Le traitement individuel continue de vérifier les doublons de numéro
      // et réutilise le système existant de code et de file SMS.
      const resultat = await inviterTuteur(cible.id);
      if (resultat.ok) invites += 1;
      else echecs += 1;
    }
    await journaliser(acteur, {
      action: "tuteurs.invites_en_masse",
      entite: "tuteurs",
      entiteId: donnees.classeId,
      apres: {
        canal: "SMS", portee: "PRINCIPAUX_SANS_COMPTE",
        totalApercu: apercu.eligibles.length,
        invites, echecs, coutMaxFcfa: apercu.coutMaxFcfa,
      },
    });
    revalidatePath("/dashboard/parents");
    return {
      ok: invites > 0,
      invites, echecs,
      message: echecs
        ? `${invites} compte(s) créé(s), ${echecs} échec(s). Les SMS sont mis en file, sans garantie de réception immédiate.`
        : `${invites} compte(s) créé(s). Les SMS d'activation ont été mis en file d'envoi.`,
    };
  } catch {
    return { ok: false, message: "Échec des invitations par classe. Vérifiez les résultats avant de réessayer." };
  }
}
