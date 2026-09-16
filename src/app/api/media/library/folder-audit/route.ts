import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { mediaFolderReconcileLogs, users } from "@/lib/db/schema";
import { isAgencyMember } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({
  agencyId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Returns recent folder reconcile events for a workspace. Powers the
 * tree-row "info" panel (plan §3.9 rule 2).
 *
 * Returns one row per reconcile, joined to the actor's display name
 * so the UI doesn't have to fetch the user list.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Query.safeParse({
    agencyId: req.nextUrl.searchParams.get("agencyId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  if (!(await isAgencyMember(actor, parsed.data.agencyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = parsed.data.limit ?? 20;

  const rows = await db
    .select({
      id: mediaFolderReconcileLogs.id,
      reason: mediaFolderReconcileLogs.reason,
      fromFolderId: mediaFolderReconcileLogs.fromFolderId,
      toFolderId: mediaFolderReconcileLogs.toFolderId,
      contentItemId: mediaFolderReconcileLogs.contentItemId,
      mediaAssetId: mediaFolderReconcileLogs.mediaAssetId,
      reconciledAt: mediaFolderReconcileLogs.reconciledAt,
      actorName: users.name,
    })
    .from(mediaFolderReconcileLogs)
    .leftJoin(users, eq(users.id, mediaFolderReconcileLogs.actorId))
    .where(
      and(
        eq(mediaFolderReconcileLogs.agencyId, parsed.data.agencyId),
        eq(mediaFolderReconcileLogs.workspaceId, parsed.data.workspaceId),
      ),
    )
    .orderBy(desc(mediaFolderReconcileLogs.reconciledAt))
    .limit(limit);

  return NextResponse.json(
    {
      events: rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        fromFolderId: row.fromFolderId,
        toFolderId: row.toFolderId,
        contentItemId: row.contentItemId,
        mediaAssetId: row.mediaAssetId,
        reconciledAt: row.reconciledAt.toISOString(),
        actorName: row.actorName ?? "Unknown",
      })),
    },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
