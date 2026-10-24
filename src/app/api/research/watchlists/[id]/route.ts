import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { researchWatchlists } from "@/lib/db/schema";
import { getResearchManagerContext } from "@/lib/research/context";
import { getAccessibleResearchWatchlist } from "@/lib/research/watchlist-access";
import { mutatingApiHeaders } from "@/lib/security/headers";

const bodySchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);
  const { id } = await params;
  const ctx = await getResearchManagerContext(parsed.data.workspaceSlug);
  if ("error" in ctx) return errorResponse(ctx.error, 403);
  if (
    !(await getAccessibleResearchWatchlist({
      workspaceId: ctx.workspace.id,
      actorId: ctx.actor.id,
      watchlistId: id,
    }))
  ) {
    return errorResponse("watchlist_not_found", 404);
  }

  const [archived] = await db
    .update(researchWatchlists)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(researchWatchlists.id, id),
        eq(researchWatchlists.workspaceId, ctx.workspace.id),
        isNull(researchWatchlists.archivedAt),
      ),
    )
    .returning({ id: researchWatchlists.id });
  if (!archived) return errorResponse("watchlist_not_found", 404);
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);
  const { id } = await params;
  const ctx = await getResearchManagerContext(parsed.data.workspaceSlug);
  if ("error" in ctx) return errorResponse(ctx.error, 403);
  if (
    !(await getAccessibleResearchWatchlist({
      workspaceId: ctx.workspace.id,
      actorId: ctx.actor.id,
      watchlistId: id,
    }))
  ) {
    return errorResponse("watchlist_not_found", 404);
  }

  const [restored] = await db
    .update(researchWatchlists)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(researchWatchlists.id, id), eq(researchWatchlists.workspaceId, ctx.workspace.id)))
    .returning({ id: researchWatchlists.id });
  if (!restored) return errorResponse("watchlist_not_found", 404);
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}
