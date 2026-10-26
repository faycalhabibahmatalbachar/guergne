// biome-ignore lint/correctness/noUndeclaredDependencies: Next.js resolves its bundled server-only marker.
import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { maskPhone, redactPhones } from "@/lib/communication-safety";
import { classifyFailure, estimateSms, OUTBOX_STATES, prepareSms, validatedChadPhone } from "@/lib/communication-v2";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { type Db, db } from "@/server/db";

import { createHash } from "node:crypto";

export const campaignSchema = z
  .object({
    anneeId: z.string().uuid(),
    classeId: z.string().uuid().nullable(),
    title: z.string().trim().min(3).max(150),
    body: z.string().trim().min(10).max(2000),
    language: z.enum(["fr", "ar"]).default("fr"),
    notify: z.boolean().default(false),
    scheduledAt: z.string().datetime().nullable().default(null),
    expiresAt: z.string().datetime().nullable(),
    noExpiration: z.boolean().default(false),
  })
  .refine((v) => v.noExpiration || v.expiresAt !== null, {
    message: "Choisir une expiration ou explicitement sans expiration",
  })
  .refine((v) => !v.scheduledAt || Date.parse(v.scheduledAt) > Date.now(), {
    message: "La programmation doit être future",
  })
  .refine(
    (v) =>
      !v.expiresAt || Date.parse(v.expiresAt) > Math.max(Date.now(), v.scheduledAt ? Date.parse(v.scheduledAt) : 0),
    { message: "Expiration antérieure à la diffusion" },
  );
export type CampaignInput = z.infer<typeof campaignSchema>;
export interface Recipient {
  tutorId: string;
  userId: string | null;
  phone: string | null;
  name: string;
  channel: "SMS" | "PUSH" | "IN_APP" | null;
  issue: string | null;
}
type Reader = Pick<Db, "execute">;
/** Shared audience for preview AND commit. No preview-only recipient selection. */
export async function resolveAudience(input: CampaignInput, reader: Reader = db) {
  const source = await reader.execute<{
    id: string;
    utilisateur_id: string | null;
    telephone: string;
    nom: string;
    prenom: string;
    accepte_sms: boolean;
    push: boolean;
  }>(sql`SELECT DISTINCT t.id,t.utilisateur_id,t.telephone,t.nom,t.prenom,t.accepte_sms,
    EXISTS(SELECT 1 FROM appareils a WHERE a.utilisateur_id=t.utilisateur_id AND a.actif) AS push
    FROM inscriptions i JOIN eleve_tuteur et ON et.eleve_id=i.eleve_id AND et.est_principal
    JOIN tuteurs t ON t.id=et.tuteur_id
    LEFT JOIN utilisateurs u ON u.id=t.utilisateur_id
    WHERE i.active AND i.annee_id=${input.anneeId}::uuid
      AND (${input.classeId}::uuid IS NULL OR i.classe_id=${input.classeId}::uuid)
      AND (t.utilisateur_id IS NULL OR u.actif)
    ORDER BY t.id LIMIT 10001`);
  if (source.rows.length > 10000) throw new Error("Audience trop grande : sélectionner une classe");
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let duplicates = 0;
  for (const row of source.rows) {
    const checked = validatedChadPhone(row.telephone ?? "");
    const key = row.utilisateur_id ?? checked.phone ?? row.id;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    let channel: Recipient["channel"] = null;
    if (row.push) channel = "PUSH";
    else if (row.accepte_sms && !checked.failure) channel = "SMS";
    else if (row.utilisateur_id) channel = "IN_APP";
    let issue: string | null = channel ? null : "UNREACHABLE";
    if (row.accepte_sms && checked.failure) issue = checked.failure;
    recipients.push({
      tutorId: row.id,
      userId: row.utilisateur_id,
      phone: checked.phone,
      name: `${row.prenom} ${row.nom}`,
      channel,
      issue,
    });
  }
  return { recipients, duplicates };
}
export function audienceQuote(input: CampaignInput, audience: Awaited<ReturnType<typeof resolveAudience>>) {
  // Match the final adapter signature: customization must invalidate every estimate.
  const signature = process.env.SMS_SIGNATURE ?? "LGR";
  const sms = estimateSms(prepareSms(input.title, input.body, signature), COUT_SMS_FCFA);
  const counts = { sms: 0, push: 0, inApp: 0, unreachable: 0, invalid: 0, duplicates: audience.duplicates };
  for (const r of audience.recipients) {
    if (r.channel === "SMS") counts.sms++;
    else if (r.channel === "PUSH") counts.push++;
    else if (r.channel === "IN_APP") counts.inApp++;
    else counts.unreachable++;
    if (r.issue === "INVALID_NUMBER" || r.issue === "SUSPECT_NUMBER") counts.invalid++;
  }
  const cost = input.notify ? counts.sms * sms.cost : 0;
  const digest = createHash("sha256").update(JSON.stringify({ input, audience, sms, cost })).digest("hex");
  return {
    counts,
    sms,
    cost,
    digest,
    recipients: audience.recipients
      .slice(0, 20)
      .map((r) => ({ key: r.tutorId, name: r.name, phone: maskPhone(r.phone), channel: r.channel, issue: r.issue })),
    total: audience.recipients.length,
  };
}
export async function readOutbox() {
  const [counts, health] = await Promise.all([
    db.execute<{ state: string; simulated: boolean; n: number }>(
      sql`SELECT state,simulated,count(*)::int n FROM communication_outbox GROUP BY state,simulated`,
    ),
    db.execute<{ stale: number; expired_leases: number }>(sql`SELECT
      count(*) FILTER (WHERE state IN ('QUEUED','RETRYABLE') AND due_at < now()-interval '15 minutes')::int stale,
      count(*) FILTER (WHERE state='PROCESSING' AND lease_until < now())::int expired_leases FROM communication_outbox`),
  ]);
  return { counts: counts.rows, health: health.rows[0] };
}

export const journalFilterSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  query: z.string().trim().max(100).catch(""),
  channel: z.enum(["ALL", "SMS", "PUSH", "IN_APP", "EMAIL"]).catch("ALL"),
  status: z.enum(["ALL", "EN_ATTENTE", "ENVOYE", "ECHOUE", "LU", ...OUTBOX_STATES]).catch("ALL"),
});
interface JournalRow {
  id: string;
  outbox_id: string | null;
  title: string;
  channel: string;
  state: string;
  error: string | null;
  phone: string | null;
  parent: string | null;
  created_at: string;
  due_at: string;
  reference: string | null;
  cost: number | null;
  simulated: boolean;
}
export async function readJournal(filter: z.infer<typeof journalFilterSchema>) {
  const result = await db.execute<{ total: number; rows: JournalRow[] }>(sql`WITH journal AS (
    SELECT n.id,NULL::uuid outbox_id,n.titre AS title,n.canal::text AS channel,n.statut::text AS state,n.erreur AS error,n.telephone AS phone,
      concat_ws(' ',u.prenom,u.nom) parent,n.cree_le AS created_at,n.prochaine_tentative_le AS due_at,
      n.reference_externe AS reference,n.cout_fcfa AS cost,false AS simulated
      FROM notifications n LEFT JOIN utilisateurs u ON u.id=n.destinataire_id
    UNION ALL
    SELECT o.id,o.id,coalesce(c.title,'Simulation'),o.channel,o.state,o.failure_category,
      o.payload->>'phone',NULL,o.created_at,o.due_at,o.provider_ref,o.actual_cost,o.simulated
      FROM communication_outbox o LEFT JOIN communication_campaigns c ON c.id=o.campaign_id
  ), filtered AS (SELECT * FROM journal WHERE
    (${filter.channel}='ALL' OR channel=${filter.channel})
    AND (${filter.status}='ALL' OR state=${filter.status})
    AND (${filter.query}='' OR title ILIKE ${`%${filter.query.replace(/[%_\\]/g, "\\$&")}%`} ESCAPE '\\'))
    SELECT (SELECT count(*)::int FROM filtered) total,coalesce(jsonb_agg(p ORDER BY p.created_at DESC,p.id DESC),'[]'::jsonb) rows
    FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ${(filter.page - 1) * 25}) p`);
  const data = result.rows[0];
  return {
    total: Number(data?.total ?? 0),
    rows: (data?.rows ?? []).map((row) => ({
      id: row.id,
      outboxId: row.outbox_id,
      title: redactPhones(row.title),
      channel: row.channel,
      status: row.state,
      category: row.error ? categoryForJournal(row.error, row.simulated) : null,
      phone: maskPhone(row.phone),
      parent: row.parent,
      createdAt: row.created_at,
      nextAttempt: row.due_at,
      reference: row.reference ? redactPhones(row.reference) : null,
      cost: row.cost,
      simulated: row.simulated,
    })),
  };
}

function categoryForJournal(error: string, simulated: boolean) {
  return simulated ? error : classifyFailure(error);
}
export async function readSimulationCampaigns() {
  const result = await db.execute<{
    id: string;
    title: string;
    created_at: string;
    recipients: number;
    read: number;
  }>(sql`
    SELECT c.id,c.title,c.created_at::text,count(o.id)::int recipients,
      count(o.id) FILTER(WHERE o.state='READ')::int read FROM communication_campaigns c
      LEFT JOIN communication_outbox o ON o.campaign_id=c.id
      WHERE c.expires_at IS NULL OR c.expires_at > now()
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT 20`);
  return result.rows.map((row) => ({ ...row, title: redactPhones(row.title) }));
}
