import { NextResponse, type NextRequest } from "next/server";
import { verifyDownloadToken, readFile, StorageNotFoundError } from "@/lib/storage";

/**
 * GET /api/uploads/[id]
 *
 * Streams a previously-uploaded file back to the browser. The
 * download token is verified (`/api/uploads/sign` issues the
 * upload counterpart; `getSignedDownloadUrl` in the storage
 * adapter issues this one). The token binds the request to a
 * specific (workspaceId, fileId) pair so a leaked token cannot
 * read other workspaces' files.
 *
 * Content-Type is derived from the file extension. Cache-Control
 * is `private, max-age=300` so a workspace-internal browser can
 * hold the file in its HTTP cache for the token's lifetime
 * without leaking to shared caches.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

function extOf(fileId: string): string {
  const dot = fileId.lastIndexOf(".");
  return dot < 0 ? "" : fileId.slice(dot + 1).toLowerCase();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: urlId } = await params;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }
  const verified = verifyDownloadToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }
  const { workspaceId, fileId } = verified.payload;

  // The URL segment (`/api/uploads/[id]`) must match the fileId
  // baked into the token. This stops an attacker with a valid
  // token for file A from hitting the URL for file B and
  // receiving A's bytes (the response would 404 on a missing
  // file, but it's better to fail at the auth gate with a clear
  // 401).
  if (urlId !== fileId) {
    return NextResponse.json({ error: "Token does not match file" }, { status: 401 });
  }

  // The fileId embedded in the token is the relative storage path
  // (workspaceId/uuid.ext). The URL `/api/uploads/[id]` uses just
  // the `uuid.ext` segment so the API surface is opaque. The token
  // carries the workspaceId, so we prepend it here.
  const storagePath = `${workspaceId}/${fileId}`;

  try {
    const buffer = await readFile(storagePath);
    const ext = extOf(fileId);
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    // NextResponse expects a Web `BodyInit`; a Node `Buffer` isn't
    // one, so we pass through `Uint8Array` which is structurally
    // compatible and accepted by the runtime.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (cause) {
    if (cause instanceof StorageNotFoundError) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    if (cause instanceof Error && cause.name === "StoragePathError") {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}
