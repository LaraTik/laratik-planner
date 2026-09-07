import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { requireWriteCapability } from "@/lib/auth/policy";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { UPLOAD_SIZE_LIMITS, type UploadKind } from "@/lib/storage";
import { createStorageUploadIntent, StorageIntentError } from "@/lib/storage/intent-service";
import { StorageConfigurationError } from "@/lib/storage/r2-adapter";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";

/**
 * POST /api/uploads/sign
 *
 * Body: { workspaceId, kind, ext, fileSize }
 * Auth: signed in + workspace_manager
 *
 * Issues a short-lived signed upload URL the client then PUTs the
 * file bytes to. The server enforces the per-kind size limit
 * (`UPLOAD_SIZE_LIMITS`) so a misbehaving client can't try to
 * upload a 500MB logo.
 *
 * The returned `uploadUrl` already carries the token in the query
 * string, so the client only needs to `fetch(uploadUrl, { method:
 * "PUT", body })` to land the file.
 */
const Body = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum(["logo", "color", "font", "image", "video", "document", "other"]),
  ext: z.string().min(1).max(8),
  fileSize: z
    .number()
    .int()
    .min(1)
    .max(1024 * 1024 * 1024),
  contentType: z.string().trim().min(1).max(160).default("application/octet-stream"),
  originalName: z.string().trim().max(255).optional(),
  checksumSha256: z.string().trim().max(128).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Per-user rate limit on the sign route. A single multi-file
  // upload (logo + color swatch + font + document) asks for 4 sign
  // URLs in one click, so 60/10min is generous; the threat is a
  // leaked session token farm-running the route to exhaust storage
  // quota or harvest signed PUT URLs.
  const rate = await enforceRateLimit({
    scope: "upload_sign",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many upload requests; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { workspaceId, kind, ext, fileSize, contentType, originalName, checksumSha256 } =
    parsed.data;

  // FEAT-16 (GAP-FULL-REVIEW-2026-08-25) — explicit write gate.
  // Workspace managers, planners, designers, internal reviewers, and
  // publishers can upload; viewer/client roles cannot. The policy
  // helper also preserves the agency-admin shortcut.
  try {
    await requireWriteCapability({ id: session.user.id }, workspaceId, "upload_sign");
  } catch {
    return NextResponse.json(
      { error: "Read-only users cannot request upload URLs" },
      { status: 403 },
    );
  }

  const limit = UPLOAD_SIZE_LIMITS[kind as UploadKind];
  if (fileSize > limit) {
    return NextResponse.json(
      { error: `File too large: ${kind} max is ${limit} bytes`, code: "media.file_too_large" },
      { status: 413 },
    );
  }

  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  try {
    const signed = await createStorageUploadIntent({
      agencyId: workspace.agencyId,
      workspaceId,
      userId: session.user.id,
      kind: kind as UploadKind,
      extension: ext,
      contentType,
      expectedByteSize: fileSize,
      ...(checksumSha256 ? { checksumSha256 } : {}),
      ...(originalName ? { originalName } : {}),
    });
    return NextResponse.json(signed, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof StorageIntentError) {
      const status =
        error.code === "storage.quota_exceeded"
          ? 413
          : error.code === "storage.workspace_not_found"
            ? 404
            : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json(
        { error: "Storage is not configured", code: "storage.unavailable" },
        { status: 503 },
      );
    }
    throw error;
  }
}
