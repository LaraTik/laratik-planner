import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceSourceOptouts } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";

/**
 * POST /api/trends/sources/{key}/optout
 *   Body: { workspaceSlug: string, reason: string (≥4 chars) }
 *   Effect: inserts a row in `workspace_source_optout` for the
 *   given workspace + source key. Idempotent — re-acknowledging
 *   overwrites the reason.
 *
 * DELETE /api/trends/sources/{key}/optout?workspaceSlug=...
 *   Effect: removes the opt-out row. Idempotent — deleting a
 *   non-existent row is a no-op.
 *
 * Permission: any workspace_manager in the workspace.
 */
const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  reason: z.string().trim().min(4).max(280),
});

const querySchema = z.object({
  workspaceSlug: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key: sourceKey } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    }

    const actor = await currentActor();
    if (!actor) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: mutatingApiHeaders() },
      );
    }

    const ws = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!ws) {
      return NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }
    const canManage = await hasWorkspaceRole(actor, ws.id, ["workspace_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    await db
      .insert(workspaceSourceOptouts)
      .values({
        workspaceId: ws.id,
        sourceKey,
        optedOutBy: actor.id,
        reason: parsed.data.reason,
      })
      .onConflictDoUpdate({
        target: [workspaceSourceOptouts.workspaceId, workspaceSourceOptouts.sourceKey],
        set: {
          optedOutBy: actor.id,
          optedOutAt: new Date(),
          reason: parsed.data.reason,
        },
      });

    return NextResponse.json(
      { ok: true, sourceKey, optedOut: true },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_source.optout.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key: sourceKey } = await ctx.params;
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      workspaceSlug: url.searchParams.get("workspaceSlug") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_query" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    }

    const actor = await currentActor();
    if (!actor) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: mutatingApiHeaders() },
      );
    }

    const ws = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!ws) {
      return NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }
    const canManage = await hasWorkspaceRole(actor, ws.id, ["workspace_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    await db
      .delete(workspaceSourceOptouts)
      .where(
        and(
          eq(workspaceSourceOptouts.workspaceId, ws.id),
          eq(workspaceSourceOptouts.sourceKey, sourceKey),
        ),
      );

    return NextResponse.json(
      { ok: true, sourceKey, optedOut: false },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_source.optout.clear.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
