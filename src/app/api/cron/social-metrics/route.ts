import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runSyncTick, type SyncTickResult } from "@/lib/social/sync";
import { recordCronTick } from "@/lib/cron/history";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";

/**
 * GET /api/cron/social-metrics
 *
 * Authenticated cron route called every 15 minutes by
 * `scripts/vps/social-metrics-sync.sh`. The route:
 *
 *   1. Verifies `Authorization: Bearer <CRON_SECRET>` with a
 *      timing-safe comparison. A missing or wrong secret returns
 *      401 without invoking the worker AND without writing a
 *      history row (we don't want unauthenticated probes to
 *      pollute the history).
 *   2. Refuses to run when `SOCIAL_SYNC_ENABLED=false`. The
 *      short-circuit writes a `skipped` history row so the
 *      platform-admin page can tell "flag is off" from "cron is
 *      dead".
 *   3. Calls `runSyncTick()` which claims at most 20 due profiles,
 *      processes them, and runs the retention cleanup.
 *   4. Returns a JSON shape that is safe to log:
 *        { "claimed": int, "succeeded": int, "failed": int,
 *          "needsReauth": int, "skipped": int,
 *          "retention": { "oauthStatesDeleted": int, "oldMetricsDeleted": int } }
 *
 * History (Phase 1 of the social-cron-admin plan, M4.7):
 * every tick — success, soft deadline, flag-off, KEK missing,
 * or exception — writes one row to `cron_tick_history`. The write
 * is best-effort: a wedged history table never breaks the cron.
 *
 * The route has a 60-second ceiling enforced by the VPS script
 * (`curl --max-time 60`); the worker itself processes 20 profiles
 * in well under that budget because the provider calls are
 * short-lived.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RUNTIME_MS = 50_000; // leave a 10s cushion under the 60s VPS timeout
const CRON_NAME = "social-metrics";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Run a constant-time comparison anyway to keep the timing side-channel
    // from leaking the expected length.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", { status: 401, headers: mutatingApiHeaders() });
}

type TickOutcome =
  | { kind: "flag-off" }
  | { kind: "exception"; error: unknown; startedAt: Date; durationMs: number }
  | { kind: "soft_deadline"; result: SyncTickResult; startedAt: Date; durationMs: number }
  | { kind: "success"; result: SyncTickResult; startedAt: Date; durationMs: number };

async function persistTick(outcome: TickOutcome): Promise<void> {
  // Build the history-row payload from the outcome. We never
  // throw out of this function — the route's response shape
  // (and the VPS script's exit code) MUST be independent of the
  // history-table health.
  if (outcome.kind === "flag-off") {
    const now = new Date();
    await recordCronTick({
      cronName: CRON_NAME,
      startedAt: now,
      finishedAt: now,
      outcome: "skipped",
      claimed: 0,
      succeeded: 0,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      kekStatus: null,
      retention: {},
      errorText: null,
      triggeredBy: "cron",
    });
    return;
  }
  // The exception branch has no `result`; the success / soft_deadline
  // branches do. Narrow first, then destructure.
  if (outcome.kind === "exception") {
    await recordCronTick({
      cronName: CRON_NAME,
      startedAt: outcome.startedAt,
      finishedAt: new Date(),
      outcome: "error",
      claimed: 0,
      succeeded: 0,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      kekStatus: null,
      retention: {},
      errorText: outcome.error instanceof Error ? outcome.error.message : "sync failed",
      triggeredBy: "cron",
    });
    return;
  }
  await recordCronTick({
    cronName: CRON_NAME,
    startedAt: outcome.startedAt,
    finishedAt: new Date(),
    outcome: outcome.kind,
    claimed: outcome.result.claimed,
    succeeded: outcome.result.succeeded,
    failed: outcome.result.failed,
    needsReauth: outcome.result.needsReauth,
    skipped: outcome.result.skipped,
    kekStatus: outcome.result.kekStatus,
    retention: outcome.result.retention,
    errorText: null,
    triggeredBy: "cron",
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return unauthorized();
  const presented = auth.slice("Bearer ".length).trim();
  if (!serverEnv.CRON_SECRET) return unauthorized();
  if (!safeEqual(presented, serverEnv.CRON_SECRET)) return unauthorized();

  if (!serverEnv.SOCIAL_SYNC_ENABLED) {
    // Best-effort history. If the insert fails, the route still
    // returns 200 with `{ skipped: "flag-off" }` and the VPS
    // script still exits silently.
    await persistTick({ kind: "flag-off" });
    return NextResponse.json({ skipped: "flag-off" });
  }

  // Enforce a soft budget. If the tick exceeds 50s we return the
  // partial result so the route handler can return 200 to the VPS
  // script and avoid a non-zero exit. (VPS scripts treat any
  // non-2xx as an alert.)
  const start = Date.now();
  const startedAt = new Date(start);
  try {
    const result = await runSyncTick();
    const durationMs = Date.now() - start;
    if (durationMs > MAX_RUNTIME_MS) {
      await persistTick({ kind: "soft_deadline", result, startedAt, durationMs });
      return NextResponse.json({ ...result, deadlineExceeded: true, durationMs }, { status: 200 });
    }
    await persistTick({ kind: "success", result, startedAt, durationMs });
    return NextResponse.json({ ...result, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    await persistTick({ kind: "exception", error: err, startedAt, durationMs });
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "sync failed",
        durationMs,
      },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
