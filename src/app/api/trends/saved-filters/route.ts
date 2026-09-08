import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedFilters, workspaceMemberships } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";

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
  workspace: z.string().min(1).optional(),
  scope: z.enum(["me", "workspace", "agency", "all"]).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  shareScope: z.enum(["me", "workspace", "agency"]),
  filters: z.record(z.unknown()),
  workspaceId: z.string().min(1),
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
    const memberships = await db
      .select({ workspaceId: workspaceMemberships.workspaceId })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.userId, actor.id));
    const workspaceIds = memberships.map((m) => m.workspaceId);
    if (workspaceIds.length === 0) {
      return NextResponse.json({ filters: [] }, { status: 200, headers: mutatingApiHeaders() });
    }

    // The planner surfaces both the user's own filters and any
    // workspace-shared ones. The test fixture requests `?workspace=
    // demo` and expects workspace-shared filters to be present.
    const conditions = [
      or(
        eq(savedFilters.userId, actor.id),
        eq(savedFilters.shareScope, "workspace"),
        eq(savedFilters.shareScope, "agency"),
      )!,
    ];
    if (parsed.data.scope === "me") {
      conditions.length = 0;
      conditions.push(eq(savedFilters.userId, actor.id));
    } else if (parsed.data.scope === "workspace") {
      conditions.length = 0;
      conditions.push(eq(savedFilters.shareScope, "workspace"));
    } else if (parsed.data.scope === "agency") {
      conditions.length = 0;
      conditions.push(eq(savedFilters.shareScope, "agency"));
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

    const [row] = await db
      .insert(savedFilters)
      .values({
        workspaceId: parsed.data.workspaceId,
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
