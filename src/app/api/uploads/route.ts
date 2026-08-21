import { NextResponse, type NextRequest } from "next/server";
import { verifyUploadToken } from "@/lib/storage";
import { writeFile, UPLOAD_SIZE_LIMITS, type UploadKind } from "@/lib/storage";

/**
 * PUT /api/uploads
 *
 * Auth: signed token (no NextAuth session — the browser has no
 * way to attach the NextAuth cookie to a raw `fetch` PUT, and
 * short-lived signed tokens are the auth mechanism for this route).
 *
 * The token can arrive via the `Authorization: Bearer <token>`
 * header or the `?token=` query string. The verifier checks the
 * token's signature, expiry, and (workspaceId, kind, ext) binding.
 *
 * The body is read as a Buffer. We use the `arrayBuffer()` form
 * rather than `req.body` so the bytes are fully buffered before we
 * measure the size — Next.js streams `req.body` and a malicious
 * client could otherwise claim a tiny file and stream gigabytes.
 *
 * On success: returns `{ fileId, storagePath, size }`. The client
 * then submits the brand-kit asset create form with the
 * `storagePath` to persist the DB row.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim() || null;
  }
  const fromQuery = req.nextUrl.searchParams.get("token");
  return fromQuery?.trim() || null;
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing upload token" }, { status: 401 });
  }

  const verified = verifyUploadToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }
  const { workspaceId, kind, ext } = verified.payload;

  // The body must be fully buffered so we can enforce the size
  // limit. Limit per-kind to keep a 25MB document from being
  // misclassified as a 5MB 'other' asset.
  const limit = UPLOAD_SIZE_LIMITS[kind as UploadKind];
  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength > limit) {
    return NextResponse.json(
      { error: `File too large: max ${limit} bytes for ${kind}` },
      { status: 413 },
    );
  }
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  try {
    const result = await writeFile(workspaceId, kind as UploadKind, ext, buffer);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "StoragePathError") {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}
