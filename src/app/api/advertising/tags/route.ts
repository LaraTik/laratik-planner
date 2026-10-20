import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { canWriteToWorkspace, INTERNAL_WORKSPACE_ROLES, hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { loadAdvertisingReport } from "@/lib/advertising/reporting-query";
import {
  advertisingTagInputSchema,
  normalizeAdvertisingTag,
} from "@/lib/advertising/reporting-metadata";
import {
  addAdvertisingLocalTag,
  listAdvertisingLocalTags,
  removeAdvertisingLocalTag,
} from "@/lib/advertising/reporting-metadata-service";
import { mutatingApiHeaders } from "@/lib/security/headers";

const querySchema = z.object({ workspace: z.string().min(1), accountId: z.string().uuid() });

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

async function resolveScope(workspaceSlug: string, accountId: string) {
  const actor = await currentActor();
  if (!actor) return { error: "not_signed_in" as const, status: 401 };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return { error: "agency_context_unavailable" as const, status: 404 };
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug, agency.agencyId);
  if (!workspace || !(await hasWorkspaceRole(actor, workspace.id, [...INTERNAL_WORKSPACE_ROLES]))) {
    return { error: "workspace_not_accessible" as const, status: 403 };
  }
  const report = await loadAdvertisingReport(db, {
    actor,
    agencyId: agency.agencyId,
    workspaceId: workspace.id,
    accountId,
    since: recentDate(-92),
    until: recentDate(0),
    surface: "aggregate",
  });
  if (report.kind !== "ok") return { error: "advertising_report_not_found" as const, status: 404 };
  return { actor, agencyId: agency.agencyId, workspace };
}

function recentDate(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    workspace: request.nextUrl.searchParams.get("workspace"),
    accountId: request.nextUrl.searchParams.get("accountId"),
  });
  if (!parsed.success) return response("invalid_query", 400);
  const scope = await resolveScope(parsed.data.workspace, parsed.data.accountId);
  if ("error" in scope) return response(scope.error, scope.status ?? 500);
  const tags = await listAdvertisingLocalTags({
    workspaceId: scope.workspace.id,
    accountId: parsed.data.accountId,
  });
  return NextResponse.json({ tags }, { headers: mutatingApiHeaders() });
}

export async function POST(request: NextRequest) {
  const parsed = advertisingTagInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return response("invalid_body", 400);
  const scope = await resolveScope(parsed.data.workspace, parsed.data.accountId);
  if ("error" in scope) return response(scope.error, scope.status ?? 500);
  // Tagging is a WRITE to the workspace's advertising metadata. The
  // read scope admits `viewer`, so the write needs its own gate — a
  // viewer must not be able to tag or untag campaigns in a workspace
  // they may only read.
  if (!(await canWriteToWorkspace(scope.actor, scope.workspace.id))) {
    return response("workspace_not_accessible", 403);
  }
  const tag = await addAdvertisingLocalTag({
    agencyId: scope.agencyId,
    workspaceId: scope.workspace.id,
    accountId: parsed.data.accountId,
    userId: scope.actor.id,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    labelType: parsed.data.labelType,
    tagValue: normalizeAdvertisingTag(parsed.data.tagValue),
  });
  return NextResponse.json({ tag }, { status: 201, headers: mutatingApiHeaders() });
}

export async function DELETE(request: NextRequest) {
  const parsed = advertisingTagInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return response("invalid_body", 400);
  const scope = await resolveScope(parsed.data.workspace, parsed.data.accountId);
  if ("error" in scope) return response(scope.error, scope.status ?? 500);
  if (!(await canWriteToWorkspace(scope.actor, scope.workspace.id))) {
    return response("workspace_not_accessible", 403);
  }
  const tag = await removeAdvertisingLocalTag({
    workspaceId: scope.workspace.id,
    accountId: parsed.data.accountId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    labelType: parsed.data.labelType,
    tagValue: parsed.data.tagValue,
  });
  return NextResponse.json({ tag }, { headers: mutatingApiHeaders() });
}
