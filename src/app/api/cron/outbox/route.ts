import { NextResponse, type NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/route-auth";
import { dispatchOutboxOnce } from "@/lib/notifications/service";
import { mutatingApiHeaders } from "@/lib/security/headers";

/**
 * GET/POST /api/cron/outbox
 *
 * Authenticated cron route called every minute by
 * `scripts/vps/outbox-dispatch.sh`. The route:
 *
 *   1. Verifies `Authorization: Bearer <CRON_SECRET>` with a
 *      timing-safe comparison. A missing or wrong secret returns
 *      401 without invoking the dispatcher.
 *   2. Calls `dispatchOutboxOnce({ maxEvents: 50 })` which claims at
 *      most 50 due `outbox_events` rows, fans out in-app
 *      notifications per event, and writes `processed_at` on
 *      success. Per-event failures bump `attempt_count` and write
 *      `last_error` so a stuck event is observable.
 *   3. Returns a JSON shape that is safe to log:
 *        { "ok": true, "processed": int, "durationMs": int }
 *
 * The 60-second ceiling on the VPS side (`curl --max-time 60`) is
 * more than enough: the dispatcher is a short Postgres transaction
 * per event with no external calls in v1 (the email leg is a Goal 13+
 * worker; this route only fans out in-app notifications).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RUNTIME_MS = 50_000; // leave a 10s cushion under the 60s VPS timeout

async function handle(req: NextRequest): Promise<NextResponse> {
  const authResponse = authorizeCronRequest(req.headers);
  if (authResponse) return authResponse;

  const start = Date.now();
  let result: Awaited<ReturnType<typeof dispatchOutboxOnce>>;
  try {
    result = await dispatchOutboxOnce({ maxEvents: 50 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "dispatch failed",
        durationMs: Date.now() - start,
      },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
  if (Date.now() - start > MAX_RUNTIME_MS) {
    return NextResponse.json(
      { ok: true, ...result, deadlineExceeded: true, durationMs: Date.now() - start },
      { status: 200, headers: mutatingApiHeaders() },
    );
  }
  return NextResponse.json(
    { ok: true, ...result, durationMs: Date.now() - start },
    { headers: mutatingApiHeaders() },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
