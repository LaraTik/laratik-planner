import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedFilters } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";

/**
 * GET /api/trends/saved-filters?workspace=<slug>
 *   Returns the workspace's saved filters (private + shared with
 *   workspace).
 *
 * POST /api/trends/saved-filters
 *   Body: { name, shareScope: "me"|"workspace"|"agency", filters: {...},
 *   workspaceId: string }. Persists a new saved filter.
 *
 * Schema notes: the `saved_filter` table is workspace-scoped (not
 * agency-scoped). The share scope is text-enum ("me" | "workspace" |
 * "agency"). Filters are stored as jsonb in the `filters` column.
 */
const querySchema = z.object({
  workspace: z.string().min(1),
  scope: z.enum(["me", "workspace", "agency", "all"]).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  shareScope: z.enum(["me", "workspace", "agency"]),
  filters: z.record(z.unknown()),
  workspaceSlug: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      workspace: url.searchParams.get("workspace") ?? undefined,
      scope: url.searchParams.get("scope") ?? undefined,
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

    const agency = await resolveActiveAgencyContext({ actor });
    if (!agency) {
      return NextResponse.json(
        { error: "no_active_agency" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    // Find the user's workspaces in the agency.
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspace, agency.agencyId);
    if (!workspace)
      return NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      );

    // The planner surfaces both the user's own filters and any
    // workspace-shared ones. The test fixture requests `?workspace=
    // demo` and expects workspace-shared filters to be present.
    const conditions = [eq(savedFilters.workspaceId, workspace.id)];
    if (parsed.data.scope === "me") {
      conditions.push(eq(savedFilters.userId, actor.id));
    } else if (parsed.data.scope === "workspace") {
      conditions.push(eq(savedFilters.shareScope, "workspace"));
    } else if (parsed.data.scope === "agency") {
      conditions.push(eq(savedFilters.shareScope, "agency"));
    } else {
      conditions.push(
        or(
          eq(savedFilters.userId, actor.id),
          eq(savedFilters.shareScope, "workspace"),
          eq(savedFilters.shareScope, "agency"),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(savedFilters)
      .where(and(...conditions))
      .orderBy(asc(savedFilters.createdAt))
      .limit(50);

    return NextResponse.json(
      {
        filters: rows.map((r) => ({
          id: r.id,
          name: r.name,
          shareScope: r.shareScope,
          filters: r.filters,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_saved_filters.list.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(json);
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

    const agency = await resolveActiveAgencyContext({ actor });
    if (!agency) {
      return NextResponse.json(
        { error: "no_active_agency" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    const workspace = await getAccessibleWorkspace(
      actor,
      parsed.data.workspaceSlug,
      agency.agencyId,
    );
    if (!workspace)
      return NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"]))) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    const [row] = await db
      .insert(savedFilters)
      .values({
        workspaceId: workspace.id,
        userId: actor.id,
        name: parsed.data.name,
        shareScope: parsed.data.shareScope,
        filters: parsed.data.filters,
      })
      .returning();

    return NextResponse.json(
      { ok: true, filter: row },
      { status: 201, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_saved_filters.create.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = z
    .object({
      id: z.string().uuid(),
      workspaceSlug: z.string().min(1),
      shareScope: z.enum(["me", "workspace", "agency"]),
    })
    .safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const actor = await currentActor();
  if (!actor)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return NextResponse.json(
      { error: "no_active_agency" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug, agency.agencyId);
  if (!workspace || !(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]))) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const [row] = await db
    .update(savedFilters)
    .set({ shareScope: parsed.data.shareScope, updatedAt: new Date() })
    .where(
      and(
        eq(savedFilters.id, parsed.data.id),
        eq(savedFilters.workspaceId, workspace.id),
        eq(savedFilters.userId, actor.id),
      ),
    )
    .returning({ id: savedFilters.id, shareScope: savedFilters.shareScope });
  if (!row)
    return NextResponse.json(
      { error: "filter_not_found" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  return NextResponse.json(
    { ok: true, filter: row },
    { status: 200, headers: mutatingApiHeaders() },
  );
}
