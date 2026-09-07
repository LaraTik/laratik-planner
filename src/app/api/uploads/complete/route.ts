import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { canWriteToWorkspace } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";
import { completeStorageUpload, StorageIntentError } from "@/lib/storage/intent-service";
import { StorageConfigurationError } from "@/lib/storage/r2-adapter";

const Body = z.object({ intentId: z.string().uuid(), workspaceId: z.string().uuid() });

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { intentId, workspaceId } = parsed.data;
  if (!(await canWriteToWorkspace({ id: session.user.id }, workspaceId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  try {
    return NextResponse.json(
      await completeStorageUpload({ agencyId: workspace.agencyId, workspaceId, intentId }),
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
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
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json(
        { error: "Storage is not configured", code: "storage.unavailable" },
        { status: 503 },
      );
    }
    throw error;
  }
}
