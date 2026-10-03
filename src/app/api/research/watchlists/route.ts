import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchWatchlistMembers, researchWatchlists } from "@/lib/db/schema";
import { getResearchContext } from "@/lib/research/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const workspaceQuery = z.object({ workspace: z.string().trim().min(1).max(120) });
const createSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  shareScope: z.enum(["me", "workspace"]).default("me"),
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

async function visibleContext(workspaceSlug: string) {
  const ctx = await getResearchContext(workspaceSlug);
  if (!ctx) return { response: errorResponse("workspace_not_accessible", 403) };
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, [
      "workspace_manager",
      "content_planner",
      "content_reviewer",
    ]))
  ) {
    return { response: errorResponse("forbidden", 403) };
  }
  return ctx;
}

export async function GET(request: NextRequest) {
  const parsed = workspaceQuery.safeParse({
    workspace: new URL(request.url).searchParams.get("workspace") ?? "",
  });
  if (!parsed.success) return errorResponse("invalid_query", 400);

  const ctx = await visibleContext(parsed.data.workspace);
  if ("response" in ctx) return ctx.response;

  const lists = await db
    .select()
    .from(researchWatchlists)
    .where(
      and(
        eq(researchWatchlists.workspaceId, ctx.workspace.id),
        isNull(researchWatchlists.archivedAt),
        or(
          eq(researchWatchlists.shareScope, "workspace"),
          eq(researchWatchlists.createdBy, ctx.actor.id),
        ),
      ),
    )
    .orderBy(asc(researchWatchlists.name));
  const members = lists.length
    ? await db
        .select({
          watchlistId: researchWatchlistMembers.watchlistId,
          accountId: researchWatchlistMembers.accountId,
          position: researchWatchlistMembers.position,
        })
        .from(researchWatchlistMembers)
        .where(or(...lists.map((list) => eq(researchWatchlistMembers.watchlistId, list.id))))
    : [];

  return NextResponse.json(
    {
      watchlists: lists.map((list) => ({
        ...list,
        accountIds: members
          .filter((member) => member.watchlistId === list.id)
          .sort((a, b) => a.position - b.position)
          .map((member) => member.accountId),
        memberPositions: Object.fromEntries(
          members
            .filter((member) => member.watchlistId === list.id)
            .map((member) => [member.accountId, member.position]),
        ),
      })),
    },
    { headers: mutatingApiHeaders() },
  );
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);

  const ctx = await getResearchContext(parsed.data.workspaceSlug);
  if (!ctx) return errorResponse("workspace_not_accessible", 403);
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return errorResponse("forbidden", 403);
  }

  const [watchlist] = await db
    .insert(researchWatchlists)
    .values({
      workspaceId: ctx.workspace.id,
      createdBy: ctx.actor.id,
      name: parsed.data.name,
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      shareScope: parsed.data.shareScope,
    })
    .onConflictDoNothing()
    .returning();
  if (!watchlist) return errorResponse("duplicate", 409);

  return NextResponse.json(
    { watchlist: { ...watchlist, accountIds: [], memberPositions: {} } },
    { status: 201, headers: mutatingApiHeaders() },
  );
}
