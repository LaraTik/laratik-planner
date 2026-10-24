import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AssistantKnowledgeInputSchema,
  createAssistantKnowledge,
  listAssistantKnowledge,
} from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

const workspaceSlugSchema = z.string().trim().min(1).max(120);

async function resolveScope(workspaceSlug: unknown) {
  const parsed = workspaceSlugSchema.safeParse(workspaceSlug);
  if (!parsed.success) return { error: "invalid_request", status: 400 as const };
  const actor = await currentActor();
  if (!actor) return { error: "not_signed_in", status: 401 as const };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return { error: "agency_context_unavailable", status: 403 as const };
  const workspace = await getAccessibleWorkspace(actor, parsed.data, agency.agencyId);
  if (!workspace) return { error: "workspace_not_accessible", status: 403 as const };
  return { actor, agencyId: agency.agencyId, workspace };
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function GET(request: NextRequest) {
  const scope = await resolveScope(request.nextUrl.searchParams.get("workspaceSlug"));
  if ("error" in scope) return fail(scope.error, scope.status ?? 400);
  const search = z
    .string()
    .trim()
    .max(200)
    .safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!search.success) return fail("invalid_request", 400);
  try {
    const knowledge = await listAssistantKnowledge(
      scope.actor,
      scope.agencyId,
      scope.workspace.id,
      search.data,
    );
    return NextResponse.json({ knowledge }, { headers: mutatingApiHeaders() });
  } catch {
    return fail("forbidden", 403);
  }
}

export async function POST(request: NextRequest) {
  const body = z
    .object({ workspaceSlug: workspaceSlugSchema, knowledge: AssistantKnowledgeInputSchema })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("invalid_request", 400);
  const scope = await resolveScope(body.data.workspaceSlug);
  if ("error" in scope) return fail(scope.error, scope.status ?? 400);
  try {
    const knowledge = await createAssistantKnowledge(
      scope.actor,
      scope.agencyId,
      scope.workspace.id,
      body.data.knowledge,
    );
    return NextResponse.json({ knowledge }, { status: 201, headers: mutatingApiHeaders() });
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
