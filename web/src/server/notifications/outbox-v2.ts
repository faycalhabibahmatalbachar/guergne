// biome-ignore lint/correctness/noUndeclaredDependencies: Next.js resolves its bundled server-only marker.
import "server-only";

import { sql } from "drizzle-orm";

import { dispatchMode } from "@/lib/communication-safety";
import { db } from "@/server/db";

interface Work extends Record<string, unknown> {
  id: string;
  notification_id: string;
  idempotency_key: string;
  channel: string;
  lease_token: string;
  attempts: number;
  simulated: boolean;
  estimated_cost: number;
  payload: { title?: string; body?: string };
}
/** V2 never consumes historical legacy failures. Simulation is stored separately. */
export async function processOutbox(limit = 20) {
  const mode = dispatchMode(process.env);
  const result = { processed: 0, accepted: 0, failed: 0, simulated: 0, suspended: mode === "suspended" };
  if (mode === "suspended") return result;
  if (mode !== "simulation") throw new Error("V2 real dispatch is not certified");
  const simulation = true;
  const started = Date.now();
  // Small sequential claims: a request killed at 60s must not leave 200 leased items.
  for (let count = 0; count < Math.min(200, Math.max(0, limit)) && Date.now() - started < 35_000; count++) {
    const claimed = await db.execute<Work>(sql`SELECT * FROM communication_claim(1,${simulation})`);
    const row = claimed.rows[0];
    if (!row) break;
    // Recheck persistent suspension after every claim and before provider I/O.
    const control = await db.execute<{ paused: boolean }>(sql`SELECT paused FROM communication_control`);
    if (control.rows[0]?.paused !== false || dispatchMode(process.env) === "suspended") break;
    // This implementation intentionally processes only isolated simulation data.
    // Real provider enablement requires a separate reviewed adapter certification.
    const reference = `simulation:${row.idempotency_key}`;
    const category = null;
    const state = row.channel === "IN_APP" ? "DELIVERED" : "ACCEPTED";
    const finished = await db.execute<{ ok: boolean }>(sql`SELECT communication_finish(
      ${row.id}::uuid,${row.lease_token}::uuid,${state},${category},${reference ?? null},
      ${0},${0}) AS ok`);
    if (!finished.rows[0]?.ok) continue;
    result.processed++;
    result.simulated++;
    result.accepted++;
  }
  return result;
}
