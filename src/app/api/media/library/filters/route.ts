import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { mediaAssets, users } from "@/lib/db/schema";
import { isAgencyMember } from "@/lib/auth/policy";
import { accessibleWorkspaceIdsForActor } from "@/lib/media/accessible-workspaces";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({
  agencyId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
});

/**
 * Returns distinct tags + uploaders for the active workspace so the
 * library can render faceted filter chips (plan §3.3 / §3.4).
 *
 * Pulled as a separate route so the heavy aggregate queries don't run
 * when the user isn't filtering; the response is cheap to cache.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Query.safeParse({
    agencyId: req.nextUrl.searchParams.get("agencyId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  if (!(await isAgencyMember(actor, parsed.data.agencyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const accessible = await accessibleWorkspaceIdsForActor(actor, parsed.data.agencyId);
  if (parsed.data.workspaceId && !accessible.includes(parsed.data.workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const scopeWorkspaceIds = parsed.data.workspaceId ? [parsed.data.workspaceId] : accessible;

  // Tags: unnest the array and count.
  const tagRows = await db
    .select({
      name: sql<string>`unnest(${mediaAssets.tags})`,
      count: sql<number>`count(*)::int`,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.agencyId, parsed.data.agencyId),
        inArray(mediaAssets.ownerWorkspaceId, scopeWorkspaceIds),
        inArray(mediaAssets.status, ["processing", "ready", "failed"]),
        sql`array_length(${mediaAssets.tags}, 1) > 0`,
      ),
    )
    .groupBy(sql`unnest(${mediaAssets.tags})`)
    .orderBy(sql`count(*) desc`)
    .limit(50);

  // Uploaders: join users via the asset's created_by.
  const uploaderRows = await db
    .select({
      id: users.id,
      name: users.name,
      count: sql<number>`count(${mediaAssets.id})::int`,
    })
    .from(mediaAssets)
    .innerJoin(users, eq(users.id, mediaAssets.createdBy))
    .where(
      and(
        eq(mediaAssets.agencyId, parsed.data.agencyId),
        inArray(mediaAssets.ownerWorkspaceId, scopeWorkspaceIds),
        inArray(mediaAssets.status, ["processing", "ready", "failed"]),
      ),
    )
    .groupBy(users.id, users.name)
    .orderBy(sql`count(${mediaAssets.id}) desc`)
    .limit(20);

  return NextResponse.json(
    { tags: tagRows, uploaders: uploaderRows },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
