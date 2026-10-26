"use server";

import { revalidatePath } from "next/cache";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { assertBudget } from "@/lib/communication-v2";
import { db } from "@/server/db";
import { audienceQuote, campaignSchema, resolveAudience } from "@/server/domain/communication-v2";
import { requirePermission } from "@/server/guard";
import { processOutbox } from "@/server/notifications/outbox-v2";

function requireV2() {
  if (process.env.COMMUNICATION_V2 !== "true") throw new Error("Communication V2 désactivée");
}
export async function previewCampaign(data: unknown) {
  requireV2();
  await requirePermission("annonce:publier");
  const input = campaignSchema.parse(data);
  if (input.classeId) await requirePermission("annonce:publier", { classeId: input.classeId });
  return audienceQuote(input, await resolveAudience(input));
}
export async function commitCampaign(data: unknown, digest: string, confirmation: boolean, requestId: string) {
  requireV2();
  const input = campaignSchema.parse(data);
  const key = z.string().uuid().parse(requestId);
  z.boolean().parse(confirmation);
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(digest);
  const actor = await requirePermission("annonce:publier", input.classeId ? { classeId: input.classeId } : undefined);
  const result = await db.transaction(async (tx) => {
    // Budget reservation and creation are serialized in one DB transaction.
    const control = await tx.execute<{ monthly_budget: number; confirmation_threshold: number; simulation: boolean }>(
      sql`SELECT * FROM communication_control FOR UPDATE`,
    );
    const policy = control.rows[0];
    if (!policy) throw new Error("Configuration V2 absente");
    if (!policy.simulation) throw new Error("Recette uniquement : diffusion réelle non activée");
    const previous = await tx.execute<{ id: string }>(
      sql`SELECT id FROM communication_campaigns WHERE author_id=${actor.id}::uuid AND id=${key}::uuid`,
    );
    if (previous.rows.length) return { id: key, duplicate: true };
    const rate = await tx.execute<{ n: number }>(sql`SELECT count(*)::int n FROM communication_campaigns
      WHERE author_id=${actor.id}::uuid AND created_at > now()-interval '1 minute'`);
    if (Number(rate.rows[0]?.n ?? 0) >= 5) throw new Error("Limite : cinq campagnes par minute");
    const audience = await resolveAudience(input, tx);
    const quote = audienceQuote(input, audience);
    if (quote.digest !== digest) throw new Error("Audience ou tarif modifié : recalculer l'aperçu");
    const totals = await tx.execute<{ spent: number; reserved: number }>(sql`SELECT
      coalesce(sum(actual_cost) FILTER(WHERE state IN ('ACCEPTED','DELIVERED','READ')),0)::int spent,
      coalesce(sum(estimated_cost) FILTER(WHERE state IN ('QUEUED','SCHEDULED','PROCESSING','RETRYABLE')),0)::int reserved
      FROM communication_outbox WHERE created_at >= date_trunc('month',now()) AND NOT simulated`);
    assertBudget(
      quote.cost,
      Number(totals.rows[0]?.spent ?? 0),
      Number(totals.rows[0]?.reserved ?? 0),
      policy.monthly_budget,
      policy.confirmation_threshold,
      confirmation,
    );
    // Simulation must never create real announcements or legacy notifications.
    await tx.execute(sql`INSERT INTO communication_campaigns(id,author_id,school_year_id,class_id,title,body,language,scheduled_at,expires_at)
      VALUES(${key}::uuid,${actor.id}::uuid,${input.anneeId}::uuid,${input.classeId}::uuid,${input.title},${input.body},${input.language},
      ${input.scheduledAt}::timestamptz,${input.expiresAt}::timestamptz)`);
    if (input.notify) {
      const rows = audience.recipients
        .filter((r) => r.channel)
        .map((r) => ({
          user: r.userId,
          phone: r.channel === "SMS" ? r.phone : null,
          channel: r.channel,
          key: `${key}:${r.userId ?? r.phone ?? r.tutorId}:${r.channel}`,
        }));
      await tx.execute(sql`INSERT INTO communication_outbox(campaign_id,idempotency_key,channel,state,simulated,due_at,expires_at,estimated_cost,payload)
      SELECT ${key}::uuid,key,channel,
        CASE WHEN ${input.scheduledAt}::timestamptz IS NOT NULL THEN 'SCHEDULED' WHEN channel='IN_APP' THEN 'DELIVERED' ELSE 'QUEUED' END,
        true,${input.scheduledAt ?? new Date().toISOString()}::timestamptz,${input.expiresAt}::timestamptz,
        CASE WHEN channel='SMS' THEN ${quote.sms.cost} ELSE 0 END,
        jsonb_build_object('user_id',"user",'phone',phone,'title',${input.title},'body',${input.body})
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("user" uuid,phone text,channel text,key text)`);
    }
    return { id: key, duplicate: false };
  });
  revalidatePath("/dashboard/communication");
  return result;
}
export async function suspendDispatch() {
  requireV2();
  await requirePermission("notification:configurer");
  // UI may suspend but cannot lift safety or authorize real spending.
  await db.execute(sql`UPDATE communication_control SET paused=true,updated_at=now()`);
  revalidatePath("/dashboard/communication");
}
export async function runSimulation() {
  requireV2();
  await requirePermission("annonce:publier");
  if (process.env.NOTIFICATIONS_MODE === "live") throw new Error("Utiliser un environnement de simulation");
  return processOutbox(20);
}
export async function updateOutbox(id: string, action: "retry" | "cancel") {
  requireV2();
  const actor = await requirePermission("annonce:publier");
  const key = z.string().uuid().parse(id);
  z.enum(["retry", "cancel"]).parse(action);
  const next = action === "retry" ? "QUEUED" : "CANCELLED";
  await db.transaction(async (tx) => {
    const result = await tx.execute<{ state: string }>(
      sql`SELECT state FROM communication_outbox WHERE id=${key}::uuid AND simulated FOR UPDATE`,
    );
    const state = result.rows[0]?.state;
    if (
      !state ||
      (action === "retry" ? state !== "FAILED" : !["DRAFT", "SCHEDULED", "QUEUED", "RETRYABLE"].includes(state))
    )
      throw new Error("Transition indisponible");
    await tx.execute(
      sql`UPDATE communication_outbox SET state=${next},due_at=now(),failure_category=NULL,updated_at=now() WHERE id=${key}::uuid`,
    );
    await tx.execute(sql`INSERT INTO communication_events(outbox_id,actor_id,action,previous_state,next_state)
      VALUES(${key}::uuid,${actor.id}::uuid,${action},${state},${next})`);
  });
  revalidatePath("/dashboard/communication");
}
