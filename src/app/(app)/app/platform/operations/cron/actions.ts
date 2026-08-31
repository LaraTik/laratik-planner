"use server";

/**
 * Phase 3 of the social-cron-admin plan — server actions for the
 * platform-admin Cron health page.
 *
 * The Run-now action is the only mutating surface on the page.
 * It calls the same `runSyncTick()` the bearer-authenticated cron
 * route calls, but gated on `platform.console.manage` (a strict
 * subset of platform-admin / operator roles) and writes an audit
 * row to `security_audit_event` with the actor id, the trigger
 * ("manual"), and the result shape.
 *
 * Phase 2 ships the page with a button that binds to this action;
 * Phase 3 fills in the body. The action stub here is a TypeScript
 * placeholder so the page compiles. The full implementation
 * lands in the next commit.
 */

import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { currentActor } from "@/lib/auth/current-actor";
import { recordCronTick } from "@/lib/cron/history";
import { runSyncTick } from "@/lib/social/sync";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { securityAuditEvents } from "@/lib/db/schema";
import { captureError } from "@/lib/observability/sentry";

export type RunSocialMetricsResult = {
  ok: boolean;
  error?: string;
  result?: {
    claimed: number;
    succeeded: number;
    failed: number;
    needsReauth: number;
    skipped: number;
    kekStatus: "ok" | "kek_missing" | null;
    durationMs: number;
  };
};

/**
 * Server action: trigger a synchronous social-metrics tick. The
 * action does NOT short-circuit on `SOCIAL_SYNC_ENABLED=false`
 * (the operator may want to run a tick to validate the pipeline
 * after re-enabling the flag; the tick will claim 0 profiles
 * naturally because the claim query is independent of the flag).
 *
 * The action calls `runSyncTick()` directly (NOT the HTTP route)
 * so the operator doesn't need to mint a CRON_SECRET. The result
 * shape mirrors the GET response so the page can show the same
 * numbers in the audit result.
 *
 * Audit: every call writes one `security_audit_event` row. A
 * failure of the primary action (the tick) still writes the
 * audit row with `outcome=failed`. An audit-write failure fans
 * out to Sentry + structured log.
 */
export async function runSocialMetricsNowAction(): Promise<RunSocialMetricsResult> {
  const actor = await currentActor();
  if (!actor) {
    return { ok: false, error: "Not signed in" };
  }
  try {
    await requirePlatformPermission(actor, "platform.console.manage");
  } catch {
    return { ok: false, error: "Platform console manage permission required" };
  }

  const startedAt = new Date();
  let tickResult: Awaited<ReturnType<typeof runSyncTick>>;
  try {
    tickResult = await runSyncTick();
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const errorText = err instanceof Error ? err.message : "sync failed";
    await recordCronTick({
      cronName: "social-metrics",
      startedAt,
      finishedAt,
      outcome: "error",
      claimed: 0,
      succeeded: 0,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      kekStatus: null,
      retention: {},
      errorText,
      triggeredBy: `manual:${actor.id}`,
    });
    await writeAudit(actor.id, "cron.run-now", "failed", { errorText, durationMs });
    captureError("cron.run_now.failed", err, { actorId: actor.id, cronName: "social-metrics" });
    return { ok: false, error: errorText };
  }
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  await recordCronTick({
    cronName: "social-metrics",
    startedAt,
    finishedAt,
    outcome: "success",
    claimed: tickResult.claimed,
    succeeded: tickResult.succeeded,
    failed: tickResult.failed,
    needsReauth: tickResult.needsReauth,
    skipped: tickResult.skipped,
    kekStatus: tickResult.kekStatus,
    retention: tickResult.retention,
    errorText: null,
    triggeredBy: `manual:${actor.id}`,
  });
  await writeAudit(actor.id, "cron.run-now", "success", {
    claimed: tickResult.claimed,
    succeeded: tickResult.succeeded,
    failed: tickResult.failed,
    needsReauth: tickResult.needsReauth,
    durationMs,
  });
  revalidatePath("/app/platform/operations/cron");
  return {
    ok: true,
    result: {
      claimed: tickResult.claimed,
      succeeded: tickResult.succeeded,
      failed: tickResult.failed,
      needsReauth: tickResult.needsReauth,
      skipped: tickResult.skipped,
      kekStatus: tickResult.kekStatus,
      durationMs,
    },
  };
}

async function writeAudit(
  actorId: string,
  action: string,
  outcome: "success" | "failed" | "denied",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(securityAuditEvents).values({
      actorId,
      action,
      targetType: "cron",
      targetId: "social-metrics",
      outcome,
      metadata: { ...metadata, cron_name: "social-metrics" },
    });
  } catch (err) {
    captureError("cron.audit.write_failed", err, { actorId, action, outcome });
  }
}
