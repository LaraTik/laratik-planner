import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { INTERNAL_WORKSPACE_ROLES, hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { loadAdvertisingReport } from "@/lib/advertising/reporting-query";
import { advertisingReportViewConfigSchema } from "@/lib/advertising/reporting-view-config";
import { createAdvertisingReportShare } from "@/lib/advertising/reporting-metadata-service";
import { mutatingApiHeaders } from "@/lib/security/headers";

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  viewConfig: advertisingReportViewConfigSchema,
  expiresInDays: z.union([z.literal(7), z.literal(30)]).default(7),
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);
  const actor = await currentActor();
  if (!actor) return errorResponse("not_signed_in", 401);
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return errorResponse("agency_context_unavailable", 404);
  const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug, agency.agencyId);
  if (!workspace || !(await hasWorkspaceRole(actor, workspace.id, [...INTERNAL_WORKSPACE_ROLES]))) {
    return errorResponse("workspace_not_accessible", 403);
  }
  const report = await loadAdvertisingReport(db, {
    actor,
    agencyId: agency.agencyId,
    workspaceId: workspace.id,
    accountId: parsed.data.viewConfig.accountId,
    since: parsed.data.viewConfig.since,
    until: parsed.data.viewConfig.until,
    surface: "aggregate",
  });
  if (report.kind !== "ok") return errorResponse("advertising_report_not_found", 404);
  const share = await createAdvertisingReportShare({
    agencyId: agency.agencyId,
    workspaceId: workspace.id,
    accountId: report.account.id,
    userId: actor.id,
    viewConfig: parsed.data.viewConfig,
    expiresInDays: parsed.data.expiresInDays,
  });
  if (!share) return errorResponse("share_creation_failed", 500);
  const path = `/app/a/${encodeURIComponent(workspace.agencySlug)}/w/${encodeURIComponent(workspace.slug)}/analytics/advertising/share/${share.rawToken}`;
  return NextResponse.json(
    { path, expiresAt: share.expiresAt.toISOString() },
    { status: 201, headers: mutatingApiHeaders() },
  );
}
