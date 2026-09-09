import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { trendBoardItems, trendBoards, trendSignals } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { mutatingApiHeaders } from "@/lib/security/headers";

const querySchema = z.object({ workspace: z.string().min(1), boardId: z.string().uuid() });
const mutationSchema = z.object({
  workspaceSlug: z.string().min(1),
  boardId: z.string().uuid(),
  signalId: z.string().uuid(),
});

async function getContext(slug: string) {
  const actor = await currentActor();
  if (!actor) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return { response: NextResponse.json({ error: "no_active_agency" }, { status: 403 }) };
  const workspace = await getAccessibleWorkspace(actor, slug, agency.agencyId);
  if (!workspace)
    return { response: NextResponse.json({ error: "workspace_not_accessible" }, { status: 403 }) };
  return { actor, workspace };
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    workspace: new URL(req.url).searchParams.get("workspace") ?? "",
    boardId: new URL(req.url).searchParams.get("boardId") ?? "",
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_query" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await getContext(parsed.data.workspace);
  if ("response" in ctx) return ctx.response;
  const [board] = await db
    .select({ id: trendBoards.id })
    .from(trendBoards)
    .where(
      and(eq(trendBoards.id, parsed.data.boardId), eq(trendBoards.workspaceId, ctx.workspace.id)),
    )
    .limit(1);
  if (!board)
    return NextResponse.json(
      { error: "board_not_found" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  const items = await db
    .select({
      savedAt: trendBoardItems.savedAt,
      signal: trendSignals,
    })
    .from(trendBoardItems)
    .innerJoin(trendSignals, eq(trendSignals.id, trendBoardItems.signalId))
    .where(
      and(eq(trendBoardItems.boardId, board.id), eq(trendSignals.workspaceId, ctx.workspace.id)),
    )
    .orderBy(desc(trendBoardItems.savedAt));
  return NextResponse.json({ items }, { status: 200, headers: mutatingApiHeaders() });
}

export async function POST(req: NextRequest) {
  const parsed = mutationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await getContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  )
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  const [board] = await db
    .select({ id: trendBoards.id })
    .from(trendBoards)
    .where(
      and(eq(trendBoards.id, parsed.data.boardId), eq(trendBoards.workspaceId, ctx.workspace.id)),
    )
    .limit(1);
  const [signal] = await db
    .select({ id: trendSignals.id })
    .from(trendSignals)
    .where(
      and(
        eq(trendSignals.id, parsed.data.signalId),
        eq(trendSignals.workspaceId, ctx.workspace.id),
      ),
    )
    .limit(1);
  if (!board || !signal)
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  const [item] = await db
    .insert(trendBoardItems)
    .values({ boardId: board.id, signalId: signal.id })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json(
    { ok: true, saved: Boolean(item) },
    { status: 200, headers: mutatingApiHeaders() },
  );
}

export async function DELETE(req: NextRequest) {
  const parsed = mutationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await getContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  )
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  await db
    .delete(trendBoardItems)
    .where(
      and(
        eq(trendBoardItems.boardId, parsed.data.boardId),
        eq(trendBoardItems.signalId, parsed.data.signalId),
      ),
    );
  return NextResponse.json({ ok: true }, { status: 200, headers: mutatingApiHeaders() });
}
