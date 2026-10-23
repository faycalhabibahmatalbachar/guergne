"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { segmentsSms } from "@/lib/segments-sms";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { journaliser } from "@/server/audit";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { ErreurAutorisation, requirePermission } from "@/server/guard";
import { reveillerFile } from "@/server/notifications/reveil";
import { signatureSms } from "@/server/notifications/sms";
import { construireFiltreTuteurs } from "@/server/domain/parents";

const idsSchema = z.array(z.string().uuid()).min(1)
  .refine(ids => new Set(ids).size === ids.length, "La sélection contient des doublons.");
const filtresSchema = z.object({
  recherche: z.string().max(150).default(""),
  etat: z.enum(["", "sans_compte", "invite", "actif", "revoque", "doublon"]).default(""),
  classeId: z.union([z.literal(""), z.string().uuid()]).default(""),
});
const selectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ids"), ids: idsSchema }),
  z.object({
    mode: z.literal("filtres"),
    filtres: filtresSchema,
    exclureIds: z.array(z.string().uuid()).default([]),
  }),
]);
export type SelectionGroupe = z.input<typeof selectionSchema>;
const canalSchema = z.enum(["AUTO", "APP", "SMS", "APP_ET_SMS"]);
type Canal = z.infer<typeof canalSchema>;
const contenuSchema = z.object({
  selection: selectionSchema,
  titre: z.string().trim().min(3).max(80),
  corps: z.string().trim().min(5).max(600),
  canal: canalSchema,
  programmation: z.string().datetime({ offset: true }).nullable().optional(),
});
const envoiSchema = contenuSchema.extend({
  plafondCoutFcfa: z.number().int().min(0).max(1_000_000_000),
  plafondNotifications: z.number().int().min(0),
  parentsConfirmes: z.number().int().min(0),
  empreinteAudience: z.string().length(64),
  cleEnvoi: z.string().uuid(),
});

type Contact = {
  id: string;
  utilisateur_id: string | null;
  compte_actif: boolean | null;
  telephone: string | null;
  accepte_sms: boolean | null;
  push_disponible: boolean;
  politique: string;
  partage: boolean;
};
type CanalReel = "PUSH" | "SMS" | "IN_APP";
type Depot = {
  tuteurId: string; destinataireId: string | null; telephone: string | null;
  canal: CanalReel;
};

export type DevisGroupe = {
  parentsSelectionnes: number; parentsJoignables: number; nonJoignables: number;
  numerosPartages: number; total: number; parPush: number; parSms: number;
  dansApplication: number; coutFcfa: number; segments: number; programmationPossible: boolean;
  smsDedoublonnes: number; empreinteAudience: string;
};

async function lireContacts(
  selection: z.infer<typeof selectionSchema>,
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<Contact[]> {
  const condition = selection.mode === "ids"
    ? sql`t.id IN (${sql.join(selection.ids.map(id => sql`${id}::uuid`), sql`, `)})`
    : sql`${construireFiltreTuteurs(selection.filtres)} ${selection.exclureIds.length
      ? sql`AND t.id NOT IN (${sql.join(selection.exclureIds.map(id => sql`${id}::uuid`), sql`, `)})`
      : sql``}`;
  const r = await tx.execute<Contact & Record<string, unknown>>(sql`
    SELECT t.id, t.utilisateur_id, u.actif AS compte_actif,
           t.telephone, t.accepte_sms,
           EXISTS (SELECT 1 FROM appareils a WHERE a.utilisateur_id=t.utilisateur_id
                    AND a.actif AND a.jeton_fcm IS NOT NULL) AS push_disponible,
           EXISTS (SELECT 1 FROM tuteurs aut WHERE aut.id<>t.id AND
                   regexp_replace(aut.telephone, '[^0-9]', '', 'g') =
                   regexp_replace(t.telephone, '[^0-9]', '', 'g')) AS partage,
           COALESCE((SELECT p.politique::text FROM politiques_notification p
                     WHERE p.type='ANNONCE'::type_notification), 'PUSH_SINON_SMS') AS politique
    FROM tuteurs t
    LEFT JOIN utilisateurs u ON u.id=t.utilisateur_id
    WHERE ${condition}
    ORDER BY t.id
  `);
  return r.rows;
}

/** Empreinte de la liste exacte, y compris les coordonnées et consentements. */
function empreinte(contacts: Contact[]): string {
  const h = createHash("sha256");
  for (const t of contacts) h.update(JSON.stringify([
    t.id, t.utilisateur_id, t.compte_actif, t.telephone,
    t.accepte_sms, t.push_disponible, t.politique,
  ]) + "\n");
  return h.digest("hex");
}

function planifier(t: Contact, canal: Canal): Depot[] {
  const compte = t.utilisateur_id;
  const peutApp = !!compte && t.compte_actif === true;
  const push = peutApp && t.push_disponible;
  const sms = !!t.telephone && t.accepte_sms === true;
  let canaux: CanalReel[] = [];
  if (canal === "APP") canaux = push ? ["PUSH"] : peutApp ? ["IN_APP"] : [];
  else if (canal === "SMS") canaux = sms ? ["SMS"] : [];
  else if (canal === "APP_ET_SMS") canaux = [...(push ? ["PUSH" as const] : peutApp ? ["IN_APP" as const] : []), ...(sms ? ["SMS" as const] : [])];
  else if (t.politique !== "AUCUN") {
    if (t.politique === "PUSH_SINON_SMS") canaux = push ? ["PUSH"] : sms ? ["SMS"] : [];
    else if (t.politique === "PUSH_ET_SMS") canaux = [...(push ? ["PUSH" as const] : []), ...(sms ? ["SMS" as const] : [])];
    else if (t.politique === "PUSH_SEUL" && push) canaux = ["PUSH"];
    else if (t.politique === "SMS_SEUL" && sms) canaux = ["SMS"];
    if (!canaux.length && peutApp) canaux = ["IN_APP"];
  }
  return canaux.map(c => ({
    tuteurId: t.id, destinataireId: compte,
    telephone: c === "SMS" ? t.telephone : null,
    canal: c,
  }));
}

function calculer(contacts: Contact[], titre: string, corps: string, canal: Canal): { devis: DevisGroupe; depots: Depot[] } {
  const bruts = contacts.flatMap(t => planifier(t, canal));
  const uniques = new Set<string>();
  const depots: Depot[] = [];
  let smsDedoublonnes = 0;
  for (const depot of bruts) {
    const cle = depot.canal === "SMS"
      ? "SMS:" + (depot.telephone ?? "").replace(/[^0-9]/g, "")
      : depot.canal + ":" + depot.destinataireId;
    if (uniques.has(cle)) {
      if (depot.canal === "SMS") smsDedoublonnes++;
      continue;
    }
    uniques.add(cle);
    depots.push(depot);
  }
  const parentsJoignables = new Set(bruts.map(d => d.tuteurId)).size;
  const parSms = depots.filter(d => d.canal === "SMS").length;
  const parPush = depots.filter(d => d.canal === "PUSH").length;
  const dansApplication = depots.filter(d => d.canal === "IN_APP").length;
  const segments = segmentsSms(`${signatureSms()}${titre}\n${corps}`);
  return { depots, devis: {
    parentsSelectionnes: contacts.length,
    parentsJoignables,
    nonJoignables: contacts.length - parentsJoignables,
    numerosPartages: contacts.filter(t => t.partage && !!t.telephone && t.accepte_sms && bruts.some(d => d.tuteurId === t.id && d.canal === "SMS")).length,
    total: depots.length, parSms, parPush, dansApplication,
    segments, coutFcfa: parSms * segments * COUT_SMS_FCFA,
    programmationPossible: dansApplication === 0,
    smsDedoublonnes, empreinteAudience: empreinte(contacts),
  } };
}

function dateDemandee(valeur: string | null | undefined): { ok: boolean; date: string | null; erreur?: string } {
  if (!valeur) return { ok: true, date: null };
  const ms = Date.parse(valeur);
  if (!Number.isFinite(ms) || ms < Date.now() + 15 * 60_000 || ms > Date.now() + 30 * 86400_000) {
    return { ok: false, date: null, erreur: "La date doit être comprise entre 15 minutes et 30 jours dans le futur." };
  }
  return { ok: true, date: new Date(ms).toISOString() };
}

export async function apercuNotificationsGroupe(input: unknown): Promise<DevisGroupe> {
  await requirePermission("message:envoyer");
  await requirePermission("tuteur:gerer");
  const parsed = contenuSchema.safeParse(input);
  if (!parsed.success) throw new Error("Sélection ou message invalide.");
  const v = parsed.data;
  const date = dateDemandee(v.programmation);
  if (!date.ok) throw new Error(date.erreur);
  const contacts = await lireContacts(v.selection, db);
  const { devis } = calculer(contacts, v.titre, v.corps, v.canal);
  if (date.date && !devis.programmationPossible) {
    throw new Error("Les notifications internes ne peuvent pas être programmées ; choisissez un autre canal.");
  }
  return devis;
}

type DepotResultat =
  | { ok: true; existant: boolean; n: number; prevu: string | null }
  | { ok: false; message: string };

export async function envoyerNotificationsGroupe(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const acteur = await requirePermission("message:envoyer");
    await requirePermission("tuteur:gerer");
    const parsed = envoiSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Sélection, confirmation ou contenu invalide." };
    const v = parsed.data;
    const date = dateDemandee(v.programmation);
    if (!date.ok) return { ok: false, message: date.erreur ?? "Date invalide." };

    const resultat = await db.transaction(async (tx): Promise<DepotResultat> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${v.cleEnvoi}))`);
      const existant = await tx.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM notifications
        WHERE donnees->>'cleEnvoi'=${v.cleEnvoi} AND donnees->>'origine'='selection_parents'
      `);
      if (Number(existant.rows[0]?.n) > 0) return { ok: true, existant: true, n: 0, prevu: date.date };
      const contacts = await lireContacts(v.selection, tx);
      const { devis, depots } = calculer(contacts, v.titre, v.corps, v.canal);
      if (!devis.total) return { ok: false, message: "Aucun parent joignable via le canal choisi." };
      if (date.date && !devis.programmationPossible) {
        return { ok: false, message: "Programmation impossible pour la boîte interne." };
      }
      if (devis.empreinteAudience !== v.empreinteAudience || devis.parentsSelectionnes !== v.parentsConfirmes ||
          devis.total !== v.plafondNotifications || devis.coutFcfa !== v.plafondCoutFcfa) {
        return { ok: false, message: "Le nombre ou le coût a augmenté : vérifiez de nouveau l’aperçu." };
      }
      for (let i = 0; i < depots.length; i += 200) {
        await tx.insert(notifications).values(depots.slice(i, i + 200).map(d => ({
        destinataireId: d.destinataireId, telephone: d.telephone,
        eleveId: null, type: "ANNONCE" as const, canal: d.canal,
        titre: v.titre, corps: v.corps, routeCible: null,
        prochaineTentativeLe: date.date ?? new Date().toISOString(),
        donnees: { origine: "selection_parents", tuteurId: d.tuteurId, canalChoisi: v.canal, cleEnvoi: v.cleEnvoi, programmation: date.date },
      })));
      }
      return { ok: true, existant: false, n: depots.length, prevu: date.date };
    });

    if (!resultat.ok) return resultat;
    if (resultat.existant) return { ok: true, message: "Cet envoi est déjà enregistré, aucun doublon créé." };
    try {
      await journaliser(acteur, { action: "notification.parents_selection", entite: "tuteurs",
        apres: { quantite: resultat.n, canal: v.canal, programmation: resultat.prevu, destinataires: v.parentsConfirmes, portee: v.selection.mode } });
    } catch (e) { console.error("[parents:groupe:audit]", e); }
    if (!resultat.prevu) try { reveillerFile(); } catch (e) { console.error("[parents:groupe:reveil]", e); }
    revalidatePath("/dashboard/parents");
    return { ok: true, message: resultat.prevu
      ? `${resultat.n} notification(s) programmée(s). Expédition au prochain passage de la file après la date choisie.`
      : `${resultat.n} notification(s) mise(s) en file.` };
  } catch (e) {
    if (e instanceof ErreurAutorisation) return { ok: false, message: "Droit d’envoi manquant." };
    console.error("[parents:groupe]", e);
    return { ok: false, message: "Dépôt non confirmé. Vérifiez le suivi avant de réessayer." };
  }
}
