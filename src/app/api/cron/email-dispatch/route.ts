import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchEmailOnce } from "@/lib/notifications/service";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";

/**
 * GET/POST /api/cron/email-dispatch (FEAT-10).
 *
 * Authenticated cron route called every minute by
 * `scripts/vps/email-dispatch.sh`. The route:
 *
 *   1. Verifies `Authorization: Bearer <CRON_SECRET>` with a
 *      timing-safe comparison (the same pattern the outbox
 *      dispatcher uses — `route.ts` below in this directory).
 *   2. Calls `dispatchEmailOnce({ maxEvents: 50 })` which claims
 *      due outbox_events rows, fans out via `sendEmail` (Mailcow)
 *      honouring `notification_preferences.email_enabled`, and
 *      writes `processed_at` on success. Failures bump
 *      `attempt_count` and write `last_error` so the row can be
 *      retried on the next tick.
 *   3. Returns a JSON shape that is safe to log:
 *        { "ok": true, "processed": int, "sent": int, "skipped": int, "failed": int, "durationMs": int }
 *
 * The 60-second ceiling on the VPS side is the same as the outbox
 * dispatcher; the email path is bounded by SMTP latency for up to
 * 50 messages per tick, which a healthy Mailcow handles in <10s.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RUNTIME_MS = 50_000;

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", { status: 401, headers: mutatingApiHeaders() });
}

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const presented = auth.slice("Bearer ".length).trim();
  if (!serverEnv.CRON_SECRET) return false;
  return safeEqual(presented, serverEnv.CRON_SECRET);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) return unauthorized();

  const start = Date.now();
  let result: Awaited<ReturnType<typeof dispatchEmailOnce>>;
  try {
    result = await dispatchEmailOnce({ maxEvents: 50 });
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
