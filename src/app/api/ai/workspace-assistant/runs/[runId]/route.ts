import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getAssistantRunEvents,
  requestAssistantRunCancellation,
} from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

type RouteContext = { params: Promise<{ runId: string }> };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const query = z
    .object({
      workspaceSlug: z.string().trim().min(1).max(120),
      after: z.coerce.number().int().min(0).max(64).default(0),
    })
    .safeParse({
      workspaceSlug: request.nextUrl.searchParams.get("workspaceSlug"),
      after: request.nextUrl.searchParams.get("after") ?? undefined,
    });
  if (!query.success) return errorResponse("invalid_request", 400);
  const actor = await currentActor();
  if (!actor) return errorResponse("not_signed_in", 401);
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return errorResponse("agency_context_unavailable", 403);
  const workspace = await getAccessibleWorkspace(actor, query.data.workspaceSlug, agency.agencyId);
  if (!workspace) return errorResponse("workspace_not_accessible", 403);
  const { runId } = await params;
  if (!z.string().guid().safeParse(runId).success) return errorResponse("invalid_request", 400);
  try {
    const run = await getAssistantRunEvents(actor, workspace.id, runId, query.data.after, 100);
    return run
      ? NextResponse.json({ run }, { headers: mutatingApiHeaders() })
      : errorResponse("run_not_found", 404);
  } catch {
    return errorResponse("forbidden", 403);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const body = z
    .object({ workspaceSlug: z.string().trim().min(1).max(120), action: z.literal("cancel") })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("invalid_request", 400);
  const actor = await currentActor();
  if (!actor) return errorResponse("not_signed_in", 401);
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return errorResponse("agency_context_unavailable", 403);
  const workspace = await getAccessibleWorkspace(actor, body.data.workspaceSlug, agency.agencyId);
  if (!workspace) return errorResponse("workspace_not_accessible", 403);
  const { runId } = await params;
  if (!z.string().guid().safeParse(runId).success) return errorResponse("invalid_request", 400);
  try {
    const result = await requestAssistantRunCancellation(actor, workspace.id, runId);
    return result
      ? NextResponse.json(result, { headers: mutatingApiHeaders() })
      : errorResponse("run_not_found", 404);
  } catch {
    return errorResponse("forbidden", 403);
  }
}
