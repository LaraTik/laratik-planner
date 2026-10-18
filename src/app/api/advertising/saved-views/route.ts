import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedFilters } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { INTERNAL_WORKSPACE_ROLES, hasWorkspaceRole } from "@/lib/auth/policy";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { advertisingReportViewConfigSchema } from "@/lib/advertising/reporting-view-config";

const querySchema = z.object({ workspace: z.string().min(1) });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shareScope: z.enum(["me", "workspace"]),
  workspaceSlug: z.string().min(1),
  viewConfig: advertisingReportViewConfigSchema,
});

function isAdvertisingView(value: unknown) {
  return advertisingReportViewConfigSchema.safeParse(value).success;
}

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      workspace: new URL(req.url).searchParams.get("workspace") ?? undefined,
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
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspace, agency.agencyId);
    if (
      !workspace ||
      !(await hasWorkspaceRole(actor, workspace.id, [...INTERNAL_WORKSPACE_ROLES]))
    ) {
      return NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    const rows = await db
      .select()
      .from(savedFilters)
      .where(
        and(
          eq(savedFilters.workspaceId, workspace.id),
          or(eq(savedFilters.userId, actor.id), eq(savedFilters.shareScope, "workspace")),
        ),
      )
      .orderBy(asc(savedFilters.createdAt))
      .limit(100);

    return NextResponse.json(
      {
        views: rows
          .filter((row) => isAdvertisingView(row.filters))
          .map((row) => ({
            id: row.id,
            name: row.name,
            shareScope: row.shareScope,
            viewConfig: row.filters,
            createdAt: row.createdAt.toISOString(),
          })),
      },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("advertising_saved_views.list.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
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
    if (
      !workspace ||
      !(await hasWorkspaceRole(actor, workspace.id, [...INTERNAL_WORKSPACE_ROLES]))
    ) {
      return NextResponse.json(
        { error: "workspace_not_accessible" },
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
        filters: parsed.data.viewConfig,
      })
      .returning();

    return NextResponse.json(
      {
        ok: true,
        view: row
          ? {
              id: row.id,
              name: row.name,
              shareScope: row.shareScope,
              viewConfig: row.filters,
              createdAt: row.createdAt.toISOString(),
            }
          : null,
      },
      { status: 201, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("advertising_saved_views.create.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
