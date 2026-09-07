import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { canWriteToWorkspace } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";
import { StorageIntentError, uploadStorageObject } from "@/lib/storage/intent-service";
import { StorageConfigurationError, StorageUnavailableError } from "@/lib/storage/r2-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PUT /api/uploads/proxy
 *
 * Same-origin upload transport used only when direct browser-to-R2 PUT is
 * blocked by the bucket's CORS policy. The request body is converted to a
 * Node stream and forwarded without buffering the file in application memory.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const intentId = req.nextUrl.searchParams.get("intentId");
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!intentId || !workspaceId || !req.body) {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }
  if (!(await canWriteToWorkspace({ id: session.user.id }, workspaceId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && !/^\d+$/.test(contentLength)) {
    return NextResponse.json({ error: "Invalid content length" }, { status: 400 });
  }

  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  try {
    await uploadStorageObject({
      agencyId: workspace.agencyId,
      workspaceId,
      intentId,
      body: Readable.fromWeb(
        req.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
      ),
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof StorageIntentError) {
      const status =
        error.code === "storage.intent_not_found"
          ? 404
          : error.code === "storage.intent_expired"
            ? 410
            : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof StorageConfigurationError || error instanceof StorageUnavailableError) {
      return NextResponse.json(
        { error: "Storage is temporarily unavailable", code: "storage.unavailable" },
        { status: 503 },
      );
    }
    throw error;
  }
}
