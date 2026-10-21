import { NextResponse, type NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/route-auth";
import { processPendingMediaAssets } from "@/features/media/server";
import { expungeExpiredTrashedMedia } from "@/lib/media/service";
import {
  expireStorageUploadIntents,
  purgeSoftDeletedStorageObjects,
} from "@/lib/storage/intent-service";
import { mutatingApiHeaders } from "@/lib/security/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const authResponse = authorizeCronRequest(req.headers);
  if (authResponse) return authResponse;
  const startedAt = Date.now();
  const expired = await expireStorageUploadIntents(100);
  const media = await processPendingMediaAssets(50);
  const expunged = await expungeExpiredTrashedMedia(200);
  const purged = await purgeSoftDeletedStorageObjects(100);
  return NextResponse.json(
    {
      ok: true,
      expired,
      media,
      expunged,
      purged,
      durationMs: Date.now() - startedAt,
    },
    { headers: mutatingApiHeaders() },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
