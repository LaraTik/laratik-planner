import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pruneAppErrorRetention } from "@/lib/observability/app-errors";
import { logError } from "@/lib/observability/logger";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";

/**
 * GET|POST /api/cron/error-retention
 *
 * Authenticated cron route called daily by
 * `scripts/vps/error-retention.sh`. Auth is
 * `Authorization: Bearer <CRON_SECRET>` with a timing-safe comparison;
 * a missing or wrong secret returns 401 without touching the database.
 *
 * ## Why this job exists
 *
 * `docs/operations/app-error-event.md` used to say plainly: *"A 30-day
 * prune is **not implemented yet** — the table grows linearly with
 * traffic."* That was survivable while only the two client boundaries
 * wrote rows. It is not survivable now that `onRequestError` records
 * every server render, route handler, and server action failure: a hot
 * error loop becomes a disk-exhaustion and Postgres-load incident, not
 * just a noisy table.
 *
 * Retention is therefore part of the same change that widens capture,
 * not a follow-up. Defaults (30 days for events, 90 for resolved
 * groups) are overridable per call for testing.
 *
 * ## Idempotent
 *
 * Running it twice in a row is a no-op the second time. The VPS script
 * treats any non-2xx as an alert, so the route always answers 200 with
 * the deletion counts on success.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Defaults; a test or an operator can tighten them per call. */
const EVENT_RETENTION_DAYS = 30;
const GROUP_RETENTION_DAYS = 90;

function authorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || !serverEnv.CRON_SECRET) return false;
  const supplied = Buffer.from(header.slice(7).trim());
  const expected = Buffer.from(serverEnv.CRON_SECRET);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401, headers: mutatingApiHeaders() });
  }
  const startedAt = Date.now();
  try {
    const result = await pruneAppErrorRetention({
      eventDays: EVENT_RETENTION_DAYS,
      groupDays: GROUP_RETENTION_DAYS,
    });
    return NextResponse.json(
      { ok: true, ...result, durationMs: Date.now() - startedAt },
      { headers: mutatingApiHeaders() },
    );
  } catch (err) {
    // A prune failure is worth alerting on (the table is still growing),
    // but it must not take the app down, so we log and answer 500 for
    // the VPS script to surface.
    logError("cron.error_retention_failed", { err });
    return NextResponse.json(
      { ok: false, error: "retention prune failed" },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
