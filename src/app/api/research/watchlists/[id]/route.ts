import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchWatchlists } from "@/lib/db/schema";
import { getResearchContext } from "@/lib/research/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const bodySchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

async function manageContext(workspaceSlug: string) {
  const ctx = await getResearchContext(workspaceSlug);
  if (!ctx) return { response: errorResponse("workspace_not_accessible", 403) };
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return { response: errorResponse("forbidden", 403) };
  }
  return ctx;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);
  const { id } = await params;
  const ctx = await manageContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;

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
  const ctx = await manageContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;

  const [restored] = await db
    .update(researchWatchlists)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(researchWatchlists.id, id), eq(researchWatchlists.workspaceId, ctx.workspace.id)))
    .returning({ id: researchWatchlists.id });
  if (!restored) return errorResponse("watchlist_not_found", 404);
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}
