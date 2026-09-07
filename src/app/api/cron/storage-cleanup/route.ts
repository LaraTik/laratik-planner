import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPendingMediaAssets } from "@/lib/media/service";
import {
  expireStorageUploadIntents,
  purgeSoftDeletedStorageObjects,
} from "@/lib/storage/intent-service";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || !serverEnv.CRON_SECRET) return false;
  const supplied = Buffer.from(header.slice(7).trim());
  const expected = Buffer.from(serverEnv.CRON_SECRET);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function handle(req: NextRequest) {
  if (!authorized(req))
    return new NextResponse("Unauthorized", { status: 401, headers: mutatingApiHeaders() });
  const startedAt = Date.now();
  const expired = await expireStorageUploadIntents(100);
  const media = await processPendingMediaAssets(50);
  const purged = await purgeSoftDeletedStorageObjects(100);
  return NextResponse.json(
    { ok: true, expired, media, purged, durationMs: Date.now() - startedAt },
    { headers: mutatingApiHeaders() },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
