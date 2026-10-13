import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron/auth";
import { runAdvertisingSyncTick } from "@/lib/advertising/sync-worker";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";
import { normalizeAdvertisingSyncDateRange } from "@/lib/advertising/sync-worker";

/**
 * Authenticated read-only Meta advertising ingestion tick.
 *
 * The global flag remains off until controlled provider UAT is signed. Once
 * enabled, only agency-admin-activated sync states are claimed by the worker;
 * credentials are resolved by reference inside the worker and never appear in
 * this route's response or logs.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RUNTIME_MS = 50_000;

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", { status: 401, headers: mutatingApiHeaders() });
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req.headers)) return unauthorized();

  if (!serverEnv.ADVERTISING_SYNC_ENABLED) {
    return NextResponse.json({ skipped: "flag-off" }, { headers: mutatingApiHeaders() });
  }

  const startedAt = Date.now();
  try {
    const requestedSince = req.nextUrl.searchParams.get("since");
    const requestedUntil = req.nextUrl.searchParams.get("until");
    const dateRange =
      requestedSince || requestedUntil
        ? normalizeAdvertisingSyncDateRange({
            since: requestedSince ?? "",
            until: requestedUntil ?? "",
          })
        : undefined;
    const result = await runAdvertisingSyncTick(db, dateRange ? { dateRange } : undefined);
    const durationMs = Date.now() - startedAt;
    return NextResponse.json(
      { ...result, ...(durationMs > MAX_RUNTIME_MS ? { deadlineExceeded: true } : {}), durationMs },
      { headers: mutatingApiHeaders() },
    );
  } catch {
    return NextResponse.json(
      { error: "advertising_sync_failed", durationMs: Date.now() - startedAt },
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
