import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runSyncTick } from "@/lib/social/sync";
import { serverEnv } from "@/lib/validation/env";

/**
 * GET /api/cron/social-metrics
 *
 * Authenticated cron route called every 15 minutes by
 * `scripts/vps/social-metrics-sync.sh`. The route:
 *
 *   1. Verifies `Authorization: Bearer <CRON_SECRET>` with a
 *      timing-safe comparison. A missing or wrong secret returns
 *      401 without invoking the worker.
 *   2. Refuses to run when `SOCIAL_SYNC_ENABLED=false`.
 *   3. Calls `runSyncTick()` which claims at most 20 due profiles,
 *      processes them, and runs the retention cleanup.
 *   4. Returns a JSON shape that is safe to log:
 *        { "claimed": int, "succeeded": int, "failed": int,
 *          "needsReauth": int, "skipped": int,
 *          "retention": { "oauthStatesDeleted": int, "oldMetricsDeleted": int } }
 *
 * The route has a 60-second ceiling enforced by the VPS script
 * (`curl --max-time 60`); the worker itself processes 20 profiles
 * in well under that budget because the provider calls are
 * short-lived.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RUNTIME_MS = 50_000; // leave a 10s cushion under the 60s VPS timeout

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
  return new NextResponse("Unauthorized", { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return unauthorized();
  const presented = auth.slice("Bearer ".length).trim();
  if (!serverEnv.CRON_SECRET) return unauthorized();
  if (!safeEqual(presented, serverEnv.CRON_SECRET)) return unauthorized();

  if (!serverEnv.SOCIAL_SYNC_ENABLED) {
    return NextResponse.json({ skipped: "flag-off" });
  }

  // Enforce a soft budget. If the tick exceeds 50s we return the
  // partial result so the route handler can return 200 to the VPS
  // script and avoid a non-zero exit. (VPS scripts treat any
  // non-2xx as an alert.)
  const start = Date.now();
  let result: Awaited<ReturnType<typeof runSyncTick>>;
  try {
    result = await runSyncTick();
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "sync failed",
        durationMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
  if (Date.now() - start > MAX_RUNTIME_MS) {
    return NextResponse.json(
      { ...result, deadlineExceeded: true, durationMs: Date.now() - start },
      { status: 200 },
    );
  }
  return NextResponse.json({ ...result, durationMs: Date.now() - start });
}
