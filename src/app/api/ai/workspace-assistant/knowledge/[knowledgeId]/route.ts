import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  archiveAssistantKnowledge,
  AssistantKnowledgeInputSchema,
  updateAssistantKnowledge,
} from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

const requestSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  expectedRevision: z.number().int().positive().optional(),
  knowledge: AssistantKnowledgeInputSchema.optional(),
});

async function scope(request: NextRequest) {
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return { error: "invalid_request", status: 400 as const };
  const actor = await currentActor();
  if (!actor) return { error: "not_signed_in", status: 401 as const };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return { error: "agency_context_unavailable", status: 403 as const };
  const workspace = await getAccessibleWorkspace(actor, body.data.workspaceSlug, agency.agencyId);
  if (!workspace) return { error: "workspace_not_accessible", status: 403 as const };
  return { ...body.data, actor, agencyId: agency.agencyId, workspace };
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ knowledgeId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return fail(resolved.error, resolved.status ?? 400);
  const { knowledgeId } = await context.params;
  if (!z.string().guid().safeParse(knowledgeId).success) return fail("not_found", 404);
  if (!resolved.knowledge || !resolved.expectedRevision) return fail("invalid_request", 400);
  try {
    const result = await updateAssistantKnowledge(
      resolved.actor,
      resolved.agencyId,
      resolved.workspace.id,
      knowledgeId,
      resolved.expectedRevision,
      resolved.knowledge,
    );
    if (result.status === "not_found") return fail("not_found", 404);
    if (result.status === "conflict") return fail("revision_conflict", 409);
    return NextResponse.json({ knowledge: result.row }, { headers: mutatingApiHeaders() });
  } catch (error) {
    return fail(
      error instanceof Error && error.message === "workspace_assistant_knowledge_forbidden"
        ? "forbidden"
        : "knowledge_save_failed",
      error instanceof Error && error.message === "workspace_assistant_knowledge_forbidden"
        ? 403
        : 400,
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ knowledgeId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return fail(resolved.error, resolved.status ?? 400);
  const { knowledgeId } = await context.params;
  if (!z.string().guid().safeParse(knowledgeId).success) return fail("not_found", 404);
  try {
    const archived = await archiveAssistantKnowledge(
      resolved.actor,
      resolved.agencyId,
      resolved.workspace.id,
      knowledgeId,
    );
    return archived
      ? NextResponse.json({ archived: true }, { headers: mutatingApiHeaders() })
      : fail("not_found", 404);
  } catch (error) {
    return fail(
      error instanceof Error && error.message === "workspace_assistant_knowledge_forbidden"
        ? "forbidden"
        : "knowledge_archive_failed",
      error instanceof Error && error.message === "workspace_assistant_knowledge_forbidden"
        ? 403
        : 400,
    );
  }
}
