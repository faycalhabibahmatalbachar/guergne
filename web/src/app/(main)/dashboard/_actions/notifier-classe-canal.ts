"use server";

/**
 * Canaux manuels de la page Classes.
 * Ne modifie pas la politique générale des notifications automatiques.
 * Le même plan sert au devis et au dépôt dans la file d'envoi.
 */
import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { segmentsSms } from "@/lib/segments-sms";
import { parametresUuid } from "@/lib/sql-uuid";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { reveillerFile } from "@/server/notifications/reveil";

const modeSchema = z.enum(["AUTO", "APP", "SMS", "APP_ET_SMS"]);
export type CanalClasse = z.infer<typeof modeSchema>;

const envoiSchema = z.object({
  titre: z.string().trim().min(3).max(80),
  corps: z.string().trim().min(5).max(600),
  canal: modeSchema,
  // Plafonds validés par le serveur, issus du dernier aperçu confirmé.
  plafondCoutFcfa: z.number().int().min(0),
  plafondNotifications: z.number().int().min(0),
});

type LigneTuteur = {
  eleve_id: string;
  tuteur_id: string;
  utilisateur_id: string | null;
  telephone: string | null;
  accepte_sms: boolean;
  canal_auto: string;
  push_disponible: boolean;
  politique: string;
};
type Depot = {
  eleveId: string;
  destinataireId: string | null;
  telephone: string | null;
  canal: "PUSH" | "SMS" | "IN_APP";
};

export interface ApercuCanalClasse {
  total: number;
  parPush: number;
  parSms: number;
  sansCanal: number;
  exclus: number;
  segments: number;
  coutFcfa: number;
  tuteurs: number;
}

const uuid = z.string().uuid();

async function trouverTuteurs(
  executer: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  classeId: string,
): Promise<LigneTuteur[]> {
  const resultat = await executer.execute<LigneTuteur>(sql`
    SELECT i.eleve_id,
           t.id AS tuteur_id,
           t.utilisateur_id,
           t.telephone,
           COALESCE(t.accepte_sms, TRUE) AS accepte_sms,
           fn_canal_tuteur(t.id)::text AS canal_auto,
           EXISTS (
             SELECT 1 FROM appareils a
             WHERE a.utilisateur_id = t.utilisateur_id
               AND a.actif AND a.jeton_fcm IS NOT NULL
           ) AS push_disponible,
           COALESCE(
             (SELECT p.politique::text FROM politiques_notification p
              WHERE p.type = 'ANNONCE'::type_notification),
             'PUSH_SINON_SMS'
           ) AS politique
    FROM inscriptions i
    INNER JOIN eleve_tuteur et ON et.eleve_id = i.eleve_id
    INNER JOIN tuteurs t ON t.id = et.tuteur_id
    WHERE i.classe_id = ${classeId}::uuid AND i.active
    ORDER BY i.eleve_id, t.id
  `);
  return resultat.rows;
}

function planifier(lignes: LigneTuteur[], canal: CanalClasse): { depots: Depot[]; exclus: number; tuteurs: number } {
  const depots: Depot[] = [];
  let exclus = 0;
  const tuteurs = new Set<string>();
  for (const l of lignes) {
    tuteurs.add(l.tuteur_id);
    const compte = l.utilisateur_id;
    const telephone = l.telephone?.trim() || null;
    const push = Boolean(compte && l.push_disponible);
    const sms = Boolean(telephone && l.accepte_sms);
    const politique = l.politique;
    let ajouterPush = false;
    let ajouterSms = false;
    let autoriserRepli = true;

    if (canal === "APP") {
      ajouterPush = push;
    } else if (canal === "SMS") {
      ajouterSms = sms;
      autoriserRepli = false; // Choix SMS strict : pas de push caché.
    } else if (canal === "APP_ET_SMS") {
      ajouterPush = push;
      ajouterSms = sms;
    } else if (politique !== "AUCUN") {
      ajouterPush = push && ["PUSH_SINON_SMS", "PUSH_ET_SMS", "PUSH_SEUL"].includes(politique);
      ajouterSms =
        sms && (["SMS_SEUL", "PUSH_ET_SMS"].includes(politique) || (politique === "PUSH_SINON_SMS" && !push));
    } else {
      autoriserRepli = false;
    }

    if (ajouterPush && compte)
      depots.push({ eleveId: l.eleve_id, destinataireId: compte, telephone: null, canal: "PUSH" });
    if (ajouterSms && telephone) depots.push({ eleveId: l.eleve_id, destinataireId: compte, telephone, canal: "SMS" });
    // Le repli IN_APP exige un compte ; jamais un SMS sans consentement.
    if (!ajouterPush && !ajouterSms && autoriserRepli && compte) {
      depots.push({ eleveId: l.eleve_id, destinataireId: compte, telephone: null, canal: "IN_APP" });
    } else if (!ajouterPush && !ajouterSms) {
      exclus += 1;
    }
  }
  return { depots, exclus, tuteurs: tuteurs.size };
}

function agreger(lignes: LigneTuteur[], titre: string, corps: string, canal: CanalClasse): ApercuCanalClasse {
  const { depots, exclus, tuteurs } = planifier(lignes, canal);
  const segments = segmentsSms(`LGR : ${titre}\n${corps}`);
  const parSms = depots.filter((d) => d.canal === "SMS").length;
  const parPush = depots.filter((d) => d.canal === "PUSH").length;
  const sansCanal = depots.filter((d) => d.canal === "IN_APP").length;
  return {
    total: depots.length,
    parPush,
    parSms,
    sansCanal,
    exclus,
    tuteurs,
    segments,
    coutFcfa: parSms * segments * COUT_SMS_FCFA,
  };
}

export async function apercuClasseCanal(
  classeId: string,
  titre: string,
  corps: string,
  canal: CanalClasse,
): Promise<ApercuCanalClasse> {
  await requirePermission("message:envoyer");
  if (!uuid.safeParse(classeId).success) throw new Error("Classe invalide");
  if (!modeSchema.safeParse(canal).success) throw new Error("Canal invalide");
  const lignes = await trouverTuteurs(db, classeId);
  return agreger(lignes, titre, corps, canal);
}

export async function notifierClasseCanal(
  classeId: string,
  donnees: unknown,
): Promise<{
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
  posees?: number;
}> {
  try {
    const acteur = await requirePermission("message:envoyer");
    if (!uuid.safeParse(classeId).success) return { ok: false, message: "Classe invalide." };
    const validation = envoiSchema.safeParse(donnees);
    if (!validation.success) {
      return { ok: false, message: "Vérifiez le message, le canal et le devis avant l’envoi." };
    }
    const { titre, corps, canal, plafondCoutFcfa, plafondNotifications } = validation.data;

    const resultat = await db.transaction(async (tx) => {
      const lignes = await trouverTuteurs(tx, classeId);
      const devis = agreger(lignes, titre, corps, canal);
      if (devis.total === 0) return { ok: false, message: "Aucun destinataire joignable par le canal sélectionné." };
      if (devis.coutFcfa > plafondCoutFcfa || devis.total > plafondNotifications) {
        return {
          ok: false,
          message: "Le nombre de notifications ou le coût a augmenté. Actualisez l’aperçu avant de confirmer l’envoi.",
        };
      }
      const { depots } = planifier(lignes, canal);
      for (let index = 0; index < depots.length; index += 100) {
        await tx.insert(notifications).values(
          depots.slice(index, index + 100).map((d) => ({
            destinataireId: d.destinataireId,
            telephone: d.telephone,
            eleveId: d.eleveId,
            type: "ANNONCE" as const,
            canal: d.canal,
            titre,
            corps,
            routeCible: `/eleves/${d.eleveId}`,
            donnees: { origine: "page_classe", canalChoisi: canal },
          })),
        );
      }
      return { ok: true, posees: depots.length, message: `${depots.length} notification(s) déposée(s) en file.` };
    });

    if (!resultat.ok) return resultat;

    // La notification est déjà en file après la transaction : un échec
    // d'audit ne doit pas faire croire que rien n'est parti (risque de doublon).
    try {
      await journaliser(acteur, {
        action: "notification.envoyee_depuis_classe",
        entite: "classes",
        entiteId: classeId,
        apres: { titre, canal, destinataires: resultat.posees },
      });
    } catch (erreurAudit) {
      console.error("[notifierClasseCanal:audit]", erreurAudit);
    }
    try {
      reveillerFile();
    } catch (erreurReveil) {
      console.error("[notifierClasseCanal:reveil]", erreurReveil);
    }
    revalidatePath("/dashboard/classes");
    return resultat;
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation) {
      return { ok: false, message: "Vous n’avez pas les droits pour prévenir les parents." };
    }
    console.error("[notifierClasseCanal]", erreur);
    return { ok: false, message: "L’envoi n’a pas été confirmé. Réessayez." };
  }
}

/**
 * Canaux manuels unifiés pour un élève ou une sélection (max 200).
 * Les 4 options ont le même planificateur, les mêmes permissions et plafonds
 * budgétaires que le module Classes. Les politiques automatiques restent
 * inchangées.
 */
async function trouverTuteursEleves(
  executer: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  ids: string[],
): Promise<LigneTuteur[]> {
  if (!ids.length) return [];
  const p = parametresUuid(ids);
  const resultat = await executer.execute<LigneTuteur>(sql`
    SELECT et.eleve_id,
           t.id AS tuteur_id,
           t.utilisateur_id,
           t.telephone,
           COALESCE(t.accepte_sms, FALSE) AS accepte_sms,
           fn_canal_tuteur(t.id)::text AS canal_auto,
           EXISTS (
             SELECT 1 FROM appareils a
             WHERE a.utilisateur_id = t.utilisateur_id
               AND a.actif AND a.jeton_fcm IS NOT NULL
           ) AS push_disponible,
           COALESCE(
             (SELECT p.politique::text FROM politiques_notification p
              WHERE p.type = 'ANNONCE'::type_notification),
             'PUSH_SINON_SMS'
           ) AS politique
    FROM eleve_tuteur et
    JOIN tuteurs t ON t.id = et.tuteur_id
    WHERE et.eleve_id IN (${p})
    ORDER BY et.eleve_id, t.id
  `);
  return resultat.rows;
}

function verifierEleves(ids: string[]): string[] {
  if (!ids.length || ids.length > 200 || ids.some((id) => !uuid.safeParse(id).success))
    throw new Error("Sélection invalide ou trop large (200 élèves maximum).");
  const uniques = [...new Set(ids)];
  if (uniques.length !== ids.length) throw new Error("La sélection comporte des doublons.");
  return uniques;
}

export async function apercuElevesCanal(
  ids: string[],
  titre: string,
  corps: string,
  canal: CanalClasse,
): Promise<ApercuCanalClasse> {
  await requirePermission("message:envoyer");
  const selection = verifierEleves(ids);
  if (!modeSchema.safeParse(canal).success) throw new Error("Canal invalide");
  return agreger(await trouverTuteursEleves(db, selection), titre, corps, canal);
}

export async function notifierElevesCanal(
  ids: string[],
  donnees: unknown,
): Promise<{ ok: boolean; message?: string; erreurs?: Record<string, string>; posees?: number }> {
  try {
    const acteur = await requirePermission("message:envoyer");
    const selection = verifierEleves(ids);
    const validation = envoiSchema.safeParse(donnees);
    if (!validation.success)
      return { ok: false, message: "Vérifiez le texte, le canal et l'estimation avant l'envoi." };
    const { titre, corps, canal, plafondCoutFcfa, plafondNotifications } = validation.data;
    const origine = selection.length === 1 ? "page_eleve" : "selection";
    const resultat = await db.transaction(async (tx) => {
      const lignes = await trouverTuteursEleves(tx, selection);
      const devis = agreger(lignes, titre, corps, canal);
      if (devis.total === 0) return { ok: false, message: "Aucun parent joignable par le canal sélectionné." };
      if (devis.coutFcfa > plafondCoutFcfa || devis.total > plafondNotifications) {
        return { ok: false, message: "Destinataires ou coûts modifiés : actualisez l'estimation avant de confirmer." };
      }
      const depots = planifier(lignes, canal).depots;
      for (let i = 0; i < depots.length; i += 100) {
        await tx.insert(notifications).values(
          depots.slice(i, i + 100).map((d) => ({
            destinataireId: d.destinataireId,
            telephone: d.telephone,
            eleveId: d.eleveId,
            type: "ANNONCE" as const,
            canal: d.canal,
            titre,
            corps,
            routeCible: `/eleves/${d.eleveId}`,
            donnees: { origine, canalChoisi: canal },
          })),
        );
      }
      return { ok: true, posees: depots.length, message: `${depots.length} notification(s) déposée(s) en file.` };
    });
    if (!resultat.ok) return resultat;

    try {
      await journaliser(acteur, {
        action: "notification.envoyee_depuis_selection",
        entite: "eleves",
        entiteId: selection.length === 1 ? selection[0] : undefined,
        apres: { titre, canal, eleves: selection.length, destinataires: resultat.posees, coutMaxFcfa: plafondCoutFcfa },
      });
    } catch (erreurAudit) {
      console.error("[notifierElevesCanal:audit]", erreurAudit);
    }
    try {
      reveillerFile();
    } catch (erreurReveil) {
      console.error("[notifierElevesCanal:reveil]", erreurReveil);
    }
    revalidatePath("/dashboard/eleves");
    return resultat;
  } catch (erreur) {
    if (erreur instanceof ErreurAutorisation)
      return { ok: false, message: "Vous n'avez pas les droits pour prévenir les parents." };
    console.error("[notifierElevesCanal]", erreur);
    return { ok: false, message: "L'envoi n'a pas été confirmé." };
  }
}
