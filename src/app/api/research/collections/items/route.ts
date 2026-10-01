import { NextResponse, type NextRequest } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchBookmarks, researchCollections, researchTeardowns } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const itemSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  collectionId: z.string().uuid(),
  itemKind: z.enum(["bookmark", "teardown"]),
  itemId: z.string().uuid(),
});

async function context(workspaceSlug: string) {
  const actor = await currentActor();
  if (!actor) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return { response: NextResponse.json({ error: "no_active_agency" }, { status: 403 }) };
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug, agency.agencyId);
  if (!workspace)
    return { response: NextResponse.json({ error: "workspace_not_accessible" }, { status: 403 }) };
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"]))) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { actor, workspace };
}

async function canUseCollection(workspaceId: string, actorId: string, collectionId: string) {
  const [collection] = await db
    .select({ id: researchCollections.id })
    .from(researchCollections)
    .where(
      and(
        eq(researchCollections.id, collectionId),
        eq(researchCollections.workspaceId, workspaceId),
        or(
          eq(researchCollections.shareScope, "workspace"),
          eq(researchCollections.createdBy, actorId),
        ),
      ),
    )
    .limit(1);
  return collection;
}

async function itemBelongsToWorkspace(
  workspaceId: string,
  itemKind: "bookmark" | "teardown",
  itemId: string,
) {
  if (itemKind === "bookmark") {
    const [bookmark] = await db
      .select({ id: researchBookmarks.id })
      .from(researchBookmarks)
      .where(and(eq(researchBookmarks.id, itemId), eq(researchBookmarks.workspaceId, workspaceId)))
      .limit(1);
    return bookmark;
  }
  const [teardown] = await db
    .select({ id: researchTeardowns.id })
    .from(researchTeardowns)
    .where(and(eq(researchTeardowns.id, itemId), eq(researchTeardowns.workspaceId, workspaceId)))
    .limit(1);
  return teardown;
}

export async function POST(request: NextRequest) {
  const parsed = itemSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await context(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (!(await canUseCollection(ctx.workspace.id, ctx.actor.id, parsed.data.collectionId)))
    return NextResponse.json(
      { error: "collection_not_accessible" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  if (!(await itemBelongsToWorkspace(ctx.workspace.id, parsed.data.itemKind, parsed.data.itemId)))
    return NextResponse.json(
      { error: "item_not_found" },
      { status: 404, headers: mutatingApiHeaders() },
    );

  if (parsed.data.itemKind === "bookmark") {
    await db
      .update(researchBookmarks)
      .set({ collectionId: parsed.data.collectionId })
      .where(
        and(
          eq(researchBookmarks.id, parsed.data.itemId),
          eq(researchBookmarks.workspaceId, ctx.workspace.id),
        ),
      );
  } else {
    await db
      .update(researchTeardowns)
      .set({ collectionId: parsed.data.collectionId })
      .where(
        and(
          eq(researchTeardowns.id, parsed.data.itemId),
          eq(researchTeardowns.workspaceId, ctx.workspace.id),
        ),
      );
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: mutatingApiHeaders() });
}

export async function DELETE(request: NextRequest) {
  const parsed = itemSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await context(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (parsed.data.itemKind === "bookmark") {
    await db
      .update(researchBookmarks)
      .set({ collectionId: null })
      .where(
        and(
          eq(researchBookmarks.id, parsed.data.itemId),
          eq(researchBookmarks.workspaceId, ctx.workspace.id),
          eq(researchBookmarks.collectionId, parsed.data.collectionId),
        ),
      );
  } else {
    await db
      .update(researchTeardowns)
      .set({ collectionId: null })
      .where(
        and(
          eq(researchTeardowns.id, parsed.data.itemId),
          eq(researchTeardowns.workspaceId, ctx.workspace.id),
          eq(researchTeardowns.collectionId, parsed.data.collectionId),
        ),
      );
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: mutatingApiHeaders() });
}
