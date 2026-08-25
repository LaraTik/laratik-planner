import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getSignedUploadUrl, UPLOAD_SIZE_LIMITS, type UploadKind } from "@/lib/storage";

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
  kind: z.enum(["logo", "color", "font", "image", "document", "other"]),
  ext: z.string().min(1).max(8),
  fileSize: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024),
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
  const { workspaceId, kind, ext, fileSize } = parsed.data;

  if (!(await hasWorkspaceRole({ id: session.user.id }, workspaceId, ["workspace_manager"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = UPLOAD_SIZE_LIMITS[kind as UploadKind];
  if (fileSize > limit) {
    return NextResponse.json(
      { error: `File too large: ${kind} max is ${limit} bytes` },
      { status: 413 },
    );
  }

  const signed = getSignedUploadUrl(workspaceId, kind as UploadKind, ext);
  return NextResponse.json(signed, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
