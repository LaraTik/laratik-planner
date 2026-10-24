import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listAssistantKnowledgeRevisions } from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ knowledgeId: string }> },
) {
  const workspaceSlug = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .safeParse(request.nextUrl.searchParams.get("workspaceSlug"));
  if (!workspaceSlug.success) return fail("invalid_request", 400);
  const { knowledgeId } = await context.params;
  if (!z.string().guid().safeParse(knowledgeId).success) return fail("not_found", 404);
  const actor = await currentActor();
  if (!actor) return fail("not_signed_in", 401);
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return fail("agency_context_unavailable", 403);
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug.data, agency.agencyId);
  if (!workspace) return fail("workspace_not_accessible", 403);
  try {
    const revisions = await listAssistantKnowledgeRevisions(
      actor,
      agency.agencyId,
      workspace.id,
      knowledgeId,
    );
    return revisions
      ? NextResponse.json({ revisions }, { headers: mutatingApiHeaders() })
      : fail("not_found", 404);
  } catch {
    return fail("forbidden", 403);
  }
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}
