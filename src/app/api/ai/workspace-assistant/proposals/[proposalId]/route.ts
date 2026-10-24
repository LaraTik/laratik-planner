import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decideAssistantProposal } from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { aiFeatureSettings } from "@/lib/db/schema";
import { loadEnabledCapabilities } from "@/lib/ai/governance";
import { eq } from "drizzle-orm";

const requestSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  decision: z.enum(["apply", "reject"]),
});

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await context.params;
  if (!z.string().guid().safeParse(proposalId).success) return response("not_found", 404);
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return response("invalid_request", 400);
  const actor = await currentActor();
  if (!actor) return response("not_signed_in", 401);
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return response("agency_context_unavailable", 403);
  const workspace = await getAccessibleWorkspace(actor, body.data.workspaceSlug, agency.agencyId);
  if (!workspace) return response("workspace_not_accessible", 403);
  const [feature, capabilities] = await Promise.all([
    db
      .select()
      .from(aiFeatureSettings)
      .where(eq(aiFeatureSettings.agencyId, agency.agencyId))
      .limit(1)
      .then((rows) => rows[0]),
    loadEnabledCapabilities(agency.agencyId),
  ]);
  if (
    !feature?.enabled ||
    !feature.enabledCapabilities.includes("monthly_planning_copilot") ||
    !capabilities.has("monthly_planning_copilot")
  ) {
    return response("ai_capability_unavailable", 403);
  }
  try {
    const result = await decideAssistantProposal(
      actor,
      workspace.id,
      proposalId,
      body.data.decision,
    );
    return result.status === "not_found"
      ? response("not_found", 404)
      : NextResponse.json(result, { headers: mutatingApiHeaders() });
  } catch {
    return response("proposal_decision_failed", 409);
  }
}
