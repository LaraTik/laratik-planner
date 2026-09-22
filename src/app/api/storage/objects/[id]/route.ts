import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { canAccessWorkspace } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { storageObjects } from "@/lib/db/schema";
import { fetchStorageObject } from "@/lib/storage/read-service";
import { StorageConfigurationError } from "@/lib/storage/r2-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const [object] = await db
    .select({
      workspaceId: storageObjects.workspaceId,
      agencyId: storageObjects.agencyId,
      mimeType: storageObjects.mimeType,
    })
    .from(storageObjects)
    .where(eq(storageObjects.id, id))
    .limit(1);
  if (!object) return NextResponse.json({ error: "Object not found" }, { status: 404 });
  if (!(await canAccessWorkspace({ id: session.user.id }, object.workspaceId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const remote = await fetchStorageObject({
      agencyId: object.agencyId,
      workspaceId: object.workspaceId,
      objectId: id,
      expiresInSeconds: 300,
      ...(req.headers.get("range") ? { headers: { Range: req.headers.get("range")! } } : {}),
    });
    if (!remote) return NextResponse.json({ error: "Object not found" }, { status: 404 });
    const headers = new Headers({
      "Content-Type": object.mimeType,
      "Cache-Control": "private, max-age=86400",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    });
    // Pass-through order: don't include `content-type` here because
    // we'd overwrite the explicit Content-Type below (or R2's value
    // if we never set one). The storage_object row has the
    // authoritative MIME type from the upload validator; we want
    // that one, not R2's. The other headers are added here so the
    // browser can do range requests + ETag-based revalidation.
    for (const name of [
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
    ]) {
      const value = remote.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(remote.body, { status: remote.status, headers });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
    }
    throw error;
  }
}
