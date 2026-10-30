"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { reveillerFile } from "@/server/notifications/reveil";

type Resultat = { ok: boolean; message: string };

const messageSchema = z.object({
  tuteurId: z.string().uuid(),
  titre: z.string().trim().min(3).max(100),
  contenu: z.string().trim().min(5).max(320),
  confirmationCout: z.literal(true),
});

/** Mise en file explicite ; ne promet pas un SMS envoyé avant l'accusé du fournisseur. */
export async function programmerSmsParent(input: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("message:envoyer");
    const resultat = messageSchema.safeParse(input);
    if (!resultat.success) return { ok: false, message: "Vérifiez le message et confirmez le coût SMS." };
    const v = resultat.data;
    const parent = await db.execute<{ telephone: string; accepte_sms: boolean }>(sql`
      SELECT telephone, accepte_sms FROM tuteurs WHERE id = ${v.tuteurId}::uuid
    `);
    const ligne = parent.rows[0];
    if (!ligne) return { ok: false, message: "Responsable introuvable." };
    if (!ligne.accepte_sms) return { ok: false, message: "Ce responsable n'accepte pas les SMS." };

    const notification = await db.execute<{ id: string }>(sql`
      INSERT INTO notifications (telephone, type, canal, titre, corps)
      VALUES (${ligne.telephone}, 'AUTRE'::type_notification, 'SMS'::canal_notification, ${v.titre}, ${v.contenu})
      RETURNING id
    `);
    const id = notification.rows[0]?.id;
    if (id) {
      await journaliser(acteur, {
        action: "parent.sms_programme",
        entite: "notifications",
        entiteId: id,
        apres: { tuteurId: v.tuteurId, tarifSegmentFcfa: COUT_SMS_FCFA },
      });
    }
    revalidatePath("/dashboard/parents/" + v.tuteurId);
    reveillerFile();
    return { ok: true, message: "SMS mis en file. Son état réel apparaîtra dans l'historique." };
  } catch (e) {
    if (!(e instanceof ErreurAutorisation)) console.error("[parent:sms]", e);
    return { ok: false, message: "Impossible de programmer ce SMS." };
  }
}

const rattachementSchema = z.object({
  tuteurId: z.string().uuid(),
  matricule: z.string().trim().min(3).max(80),
  lien: z.enum(["PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE"]),
  confirmation: z.literal(true),
});

/** Rattachement vérifié à un élève existant, sans création de doublon. */
export async function rattacherEnfantParent(input: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    await requirePermission("eleve:modifier");
    const validation = rattachementSchema.safeParse(input);
    if (!validation.success) return { ok: false, message: "Matricule, lien de parenté et confirmation requis." };
    const v = validation.data;
    const trouvaille = await db.execute<{ id: string; nom: string; prenom: string }>(sql`
      SELECT id, nom, prenom FROM eleves WHERE matricule = ${v.matricule} LIMIT 1
    `);
    const enfant = trouvaille.rows[0];
    if (!enfant) return { ok: false, message: "Aucun élève ne correspond à ce matricule." };
    const rattachement = await db.execute<{ id: string }>(sql`
      INSERT INTO eleve_tuteur (
        eleve_id, tuteur_id, lien,
        est_principal, est_responsable_financier, est_tuteur_legal,
        est_contact_urgence, autorise_retrait
      )
      SELECT ${enfant.id}::uuid, t.id, ${v.lien}::lien_parente,
        false, false, false, false, false
      FROM tuteurs t WHERE t.id = ${v.tuteurId}::uuid
      ON CONFLICT (eleve_id, tuteur_id) DO NOTHING
      RETURNING id
    `);
    const rattachementId = rattachement.rows[0]?.id;
    if (!rattachementId)
      return { ok: false, message: "Ce responsable est déjà rattaché à cet élève, ou sa fiche est introuvable." };
    await journaliser(acteur, {
      action: "tuteur.enfant_rattache",
      entite: "eleve_tuteur",
      entiteId: rattachementId,
      eleveId: enfant.id,
      apres: { tuteurId: v.tuteurId, lien: v.lien, matricule: v.matricule },
    });
    revalidatePath("/dashboard/parents/" + v.tuteurId);
    revalidatePath("/dashboard/eleves/" + enfant.id);
    return {
      ok: true,
      message:
        enfant.prenom +
        " " +
        enfant.nom +
        " a été rattaché. Les autres responsabilités restent à définir dans le dossier élève.",
    };
  } catch (e) {
    if (!(e instanceof ErreurAutorisation)) console.error("[parent:rattachement]", e);
    return { ok: false, message: "Le rattachement n'a pas pu être effectué." };
  }
}

const rolesFamiliauxSchema = z.object({
  tuteurId: z.string().uuid(),
  eleveId: z.string().uuid(),
  lien: z.enum(["PERE", "MERE", "TUTEUR", "ONCLE", "TANTE", "GRAND_PARENT", "FRERE_SOEUR", "AUTRE"]),
  estResponsableFinancier: z.boolean(),
  estTuteurLegal: z.boolean(),
  estContactUrgence: z.boolean(),
  autoriseRetrait: z.boolean(),
  motif: z.string().trim().min(10, "Motif obligatoire (10 caractères minimum)").max(300),
  piecesVerifiees: z.literal(true),
});

/** Les habilitations familiales sont modifiées UN LIEN À LA FOIS,
 * sans modifier le tuteur principal, ni un autre enfant, ni un compte.
 * Seul le personnel autorisé peut valider la vérification documentaire.
 */
export async function mettreAJourRolesFamiliaux(input: unknown): Promise<Resultat> {
  try {
    const acteur = await requirePermission("tuteur:gerer");
    await requirePermission("eleve:modifier");
    const p = rolesFamiliauxSchema.safeParse(input);
    if (!p.success)
      return { ok: false, message: "Vérifiez les rôles, le motif et la confirmation des pièces justificatives." };
    const d = p.data;
    const precedent = await db.transaction(async (tx) => {
      const r = await tx.execute<{
        id: string;
        lien: string;
        est_responsable_financier: boolean;
        est_tuteur_legal: boolean;
        est_contact_urgence: boolean;
        autorise_retrait: boolean;
        est_principal: boolean;
      }>(sql`
        SELECT id::text, lien::text, est_principal,
               est_responsable_financier, est_tuteur_legal,
               est_contact_urgence, autorise_retrait
          FROM eleve_tuteur
         WHERE eleve_id = ${d.eleveId}::uuid AND tuteur_id = ${d.tuteurId}::uuid
         FOR UPDATE
      `);
      const avant = r.rows[0];
      if (!avant) return null;
      await tx.execute(sql`
        UPDATE eleve_tuteur
           SET lien = ${d.lien}::lien_parente,
               est_responsable_financier = ${d.estResponsableFinancier},
               est_tuteur_legal = ${d.estTuteurLegal},
               est_contact_urgence = ${d.estContactUrgence},
               autorise_retrait = ${d.autoriseRetrait}
         WHERE id = ${avant.id}::uuid
      `);
      return avant;
    });
    if (!precedent)
      return { ok: false, message: "Ce responsable n'est plus rattaché à cet élève. Actualisez la fiche." };
    await journaliser(acteur, {
      action: "tuteur.responsabilites_verifiees",
      entite: "eleve_tuteur",
      entiteId: precedent.id,
      eleveId: d.eleveId,
      avant: {
        lien: precedent.lien,
        estResponsableFinancier: precedent.est_responsable_financier,
        estTuteurLegal: precedent.est_tuteur_legal,
        estContactUrgence: precedent.est_contact_urgence,
        autoriseRetrait: precedent.autorise_retrait,
        estPrincipal: precedent.est_principal,
      },
      apres: {
        tuteurId: d.tuteurId,
        lien: d.lien,
        estResponsableFinancier: d.estResponsableFinancier,
        estTuteurLegal: d.estTuteurLegal,
        estContactUrgence: d.estContactUrgence,
        autoriseRetrait: d.autoriseRetrait,
        motif: d.motif,
        piecesVerifiees: true,
      },
    });
    revalidatePath("/dashboard/parents/" + d.tuteurId);
    revalidatePath("/dashboard/parents/familles");
    revalidatePath("/dashboard/eleves/" + d.eleveId);
    return {
      ok: true,
      message: "Responsabilités actualisées et journalisées. Le responsable principal n'a pas été modifié.",
    };
  } catch (e) {
    if (!(e instanceof ErreurAutorisation)) console.error("[parent:roles]", e);
    return { ok: false, message: "Les responsabilités n'ont pas pu être modifiées." };
  }
}
