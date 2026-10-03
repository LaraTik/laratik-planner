import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
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
const reorderSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  mode: z.literal("reorder"),
  accountIds: z.array(z.string().uuid()).min(1).max(100),
});
const transferSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  mode: z.enum(["move", "copy"]),
  accountId: z.string().uuid(),
  targetWatchlistId: z.string().uuid(),
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const body = await request.json().catch(() => ({}));
  const { id } = await params;
  const parsedReorder = reorderSchema.safeParse(body);
  const parsedTransfer = transferSchema.safeParse(body);
  const workspaceSlug = parsedReorder.success
    ? parsedReorder.data.workspaceSlug
    : parsedTransfer.success
      ? parsedTransfer.data.workspaceSlug
      : "";
  if (!workspaceSlug) return errorResponse("invalid_body", 400);
  const ctx = await manageContext(workspaceSlug);
  if ("response" in ctx) return ctx.response;

  if (parsedReorder.success) {
    const members = await db
      .select({ accountId: researchWatchlistMembers.accountId })
      .from(researchWatchlistMembers)
      .innerJoin(
        researchWatchlists,
        eq(researchWatchlists.id, researchWatchlistMembers.watchlistId),
      )
      .where(
        and(
          eq(researchWatchlistMembers.watchlistId, id),
          eq(researchWatchlists.workspaceId, ctx.workspace.id),
          isNull(researchWatchlists.archivedAt),
        ),
      );
    const currentIds = new Set(members.map((member) => member.accountId));
    const requestedIds = new Set(parsedReorder.data.accountIds);
    if (
      currentIds.size !== requestedIds.size ||
      [...currentIds].some((accountId) => !requestedIds.has(accountId))
    ) {
      return errorResponse("membership_set_mismatch", 400);
    }
    await db.transaction(async (tx) => {
      for (const [position, accountId] of parsedReorder.data.accountIds.entries()) {
        await tx
          .update(researchWatchlistMembers)
          .set({ position, updatedAt: new Date() })
          .where(
            and(
              eq(researchWatchlistMembers.watchlistId, id),
              eq(researchWatchlistMembers.accountId, accountId),
            ),
          );
      }
    });
    return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
  }

  if (!parsedTransfer.success) return errorResponse("invalid_body", 400);
  if (id === parsedTransfer.data.targetWatchlistId) {
    return errorResponse("same_watchlist", 400);
  }
  const source = await assertScope(id, parsedTransfer.data.accountId, ctx.workspace.id);
  const target = await db
    .select({ id: researchWatchlists.id })
    .from(researchWatchlists)
    .where(
      and(
        eq(researchWatchlists.id, parsedTransfer.data.targetWatchlistId),
        eq(researchWatchlists.workspaceId, ctx.workspace.id),
        isNull(researchWatchlists.archivedAt),
      ),
    )
    .limit(1);
  if (!source || !target[0]) return errorResponse("account_or_watchlist_not_found", 404);

  await db.transaction(async (tx) => {
    if (parsedTransfer.data.mode === "move") {
      await tx
        .delete(researchWatchlistMembers)
        .where(
          and(
            eq(researchWatchlistMembers.watchlistId, id),
            eq(researchWatchlistMembers.accountId, parsedTransfer.data.accountId),
          ),
        );
    }
    const [nextPosition] = await tx
      .select({ value: sql<number>`coalesce(max(${researchWatchlistMembers.position}), -1) + 1` })
      .from(researchWatchlistMembers)
      .where(eq(researchWatchlistMembers.watchlistId, parsedTransfer.data.targetWatchlistId));
    await tx
      .insert(researchWatchlistMembers)
      .values({
        watchlistId: parsedTransfer.data.targetWatchlistId,
        accountId: parsedTransfer.data.accountId,
        position: nextPosition?.value ?? 0,
      })
      .onConflictDoNothing();
  });
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}
