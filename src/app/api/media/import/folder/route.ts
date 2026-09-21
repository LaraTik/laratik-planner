import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { canWriteToWorkspace } from "@/lib/auth/policy";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inspectMediaFolder } from "@/lib/media/folder-sources";
import {
  MAX_FOLDER_BATCH_IMPORT,
  type MediaFolderErrorCode,
} from "@/lib/media/folder-sources/types";
import { runMediaFolderBatch, type FolderImportReport } from "@/lib/media/folder-import";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const InspectBody = z.object({
  mode: z.literal("inspect"),
  url: z.string().trim().min(1).max(2048),
  workspaceId: z.string().uuid(),
});

const ImportBody = z.object({
  mode: z.literal("import"),
  folderId: z.string().trim().min(1).max(160),
  workspaceId: z.string().uuid(),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(160),
        title: z.string().trim().max(160).optional(),
      }),
    )
    .min(1)
    .max(MAX_FOLDER_BATCH_IMPORT),
  visibility: z.enum(["workspace", "agency"]).optional(),
  contentItemId: z.string().uuid().optional(),
});

const Body = z.discriminatedUnion("mode", [InspectBody, ImportBody]);

const ERROR_STATUS: Record<MediaFolderErrorCode, number> = {
  invalid_url: 400,
  unsafe_host: 400,
  fetch_failed: 502,
  provider_connection_required: 409,
  not_found: 404,
  empty: 422,
  too_large: 413,
  unsupported_type: 422,
  not_implemented: 501,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data.workspaceId))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!(await canWriteToWorkspace(actor, parsed.data.workspaceId))) {
    return NextResponse.json(
      { error: "You do not have permission to import media into this workspace." },
      { status: 403 },
    );
  }

  if (parsed.data.mode === "inspect") {
    return await handleInspect(actor, parsed.data.url);
  }
  return await handleImport(actor, parsed.data, workspace.agencyId);
}

async function handleInspect(actor: { id: string }, url: string) {
  const rate = await enforceRateLimit({
    scope: "media_folder_inspect",
    subject: actor.id,
    actorId: actor.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many folder checks; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const result = await inspectMediaFolder({ folderUrl: url });
  if (!result.ok) {
    const status = ERROR_STATUS[result.code] ?? 422;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  return NextResponse.json({ folder: result }, { status: 200 });
}

async function handleImport(
  actor: { id: string },
  data: z.infer<typeof ImportBody>,
  agencyId: string,
) {
  const rate = await enforceRateLimit({
    scope: "media_folder_import",
    subject: actor.id,
    actorId: actor.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many folder imports; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  try {
    const report: FolderImportReport = await runMediaFolderBatch({
      actor: actor as Parameters<typeof runMediaFolderBatch>[0]["actor"],
      agencyId,
      workspaceId: data.workspaceId,
      folderId: data.folderId,
      items: data.items.map((item) => ({
        id: item.id,
        name: item.title ?? item.id,
        ...(item.title ? { titleOverride: item.title } : {}),
      })),
      ...(data.visibility ? { visibility: data.visibility } : {}),
      ...(data.contentItemId ? { contentItemId: data.contentItemId } : {}),
    });
    return NextResponse.json({ report }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Folder import could not complete.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
