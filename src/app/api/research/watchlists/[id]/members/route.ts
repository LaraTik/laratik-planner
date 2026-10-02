import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  researchWatchlistAccounts,
  researchWatchlistMembers,
  researchWatchlists,
} from "@/lib/db/schema";
import { getResearchContext } from "@/lib/research/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const bodySchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  accountId: z.string().uuid(),
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

async function assertScope(watchlistId: string, accountId: string, workspaceId: string) {
  const [scope] = await db
    .select({ watchlistId: researchWatchlists.id, accountId: researchWatchlistAccounts.id })
    .from(researchWatchlists)
    .innerJoin(
      researchWatchlistAccounts,
      and(
        eq(researchWatchlistAccounts.id, accountId),
        eq(researchWatchlistAccounts.workspaceId, workspaceId),
        isNull(researchWatchlistAccounts.archivedAt),
      ),
    )
    .where(
      and(
        eq(researchWatchlists.id, watchlistId),
        eq(researchWatchlists.workspaceId, workspaceId),
        isNull(researchWatchlists.archivedAt),
      ),
    )
    .limit(1);
  return scope;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);
  const { id } = await params;
  const ctx = await manageContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (!(await assertScope(id, parsed.data.accountId, ctx.workspace.id))) {
    return errorResponse("account_or_watchlist_not_found", 404);
  }

  await db
    .insert(researchWatchlistMembers)
    .values({ watchlistId: id, accountId: parsed.data.accountId })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);
  const { id } = await params;
  const ctx = await manageContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (!(await assertScope(id, parsed.data.accountId, ctx.workspace.id))) {
    return errorResponse("account_or_watchlist_not_found", 404);
  }

  await db
    .delete(researchWatchlistMembers)
    .where(
      and(
        eq(researchWatchlistMembers.watchlistId, id),
        eq(researchWatchlistMembers.accountId, parsed.data.accountId),
      ),
    );
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}
