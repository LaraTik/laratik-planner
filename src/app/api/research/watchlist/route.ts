import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchWatchlistAccounts } from "@/lib/db/schema";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

const workspaceQuery = z.object({ workspace: z.string().trim().min(1).max(120) });
const platform = z.enum(["instagram", "facebook", "tiktok", "youtube"]);
const sourceUrl = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine((value) => {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username;
  }, "source_url_invalid");
const createSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  platform,
  handle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, "").toLowerCase())
    .pipe(
      z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9._-]+$/),
    ),
  displayName: z.string().trim().max(160).optional(),
  sourceUrl,
});
const deleteSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  id: z.string().uuid(),
});

async function context(slug: string) {
  const actor = await currentActor();
  if (!actor) {
    return {
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: mutatingApiHeaders() },
      ),
    };
  }
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) {
    return {
      response: NextResponse.json(
        { error: "no_active_agency" },
        { status: 403, headers: mutatingApiHeaders() },
      ),
    };
  }
  const workspace = await getAccessibleWorkspace(actor, slug, agency.agencyId);
  if (!workspace) {
    return {
      response: NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      ),
    };
  }
  return { actor, workspace };
}

export async function GET(request: NextRequest) {
  const parsed = workspaceQuery.safeParse({
    workspace: new URL(request.url).searchParams.get("workspace") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const ctx = await context(parsed.data.workspace);
  if ("response" in ctx) return ctx.response;
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, [
      "workspace_manager",
      "content_planner",
      "content_reviewer",
    ]))
  ) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const accounts = await db
    .select()
    .from(researchWatchlistAccounts)
    .where(
      and(
        eq(researchWatchlistAccounts.workspaceId, ctx.workspace.id),
        isNull(researchWatchlistAccounts.archivedAt),
      ),
    )
    .orderBy(asc(researchWatchlistAccounts.createdAt));
  return NextResponse.json({ accounts }, { headers: mutatingApiHeaders() });
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const ctx = await context(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const [account] = await db
    .insert(researchWatchlistAccounts)
    .values({
      workspaceId: ctx.workspace.id,
      createdBy: ctx.actor.id,
      platform: parsed.data.platform,
      handle: parsed.data.handle,
      ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
      sourceUrl: parsed.data.sourceUrl,
    })
    .onConflictDoNothing({
      target: [
        researchWatchlistAccounts.workspaceId,
        researchWatchlistAccounts.platform,
        researchWatchlistAccounts.handle,
      ],
    })
    .returning();
  if (!account) {
    return NextResponse.json(
      { error: "already_exists" },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }
  return NextResponse.json({ account }, { status: 201, headers: mutatingApiHeaders() });
}

export async function DELETE(request: NextRequest) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const ctx = await context(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  await db
    .update(researchWatchlistAccounts)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(researchWatchlistAccounts.id, parsed.data.id),
        eq(researchWatchlistAccounts.workspaceId, ctx.workspace.id),
        isNull(researchWatchlistAccounts.archivedAt),
      ),
    );
  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}
