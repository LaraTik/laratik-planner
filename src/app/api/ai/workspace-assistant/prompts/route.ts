import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AssistantPromptInputSchema,
  createAssistantPrompt,
  listAssistantPrompts,
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

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function GET(request: NextRequest) {
  const scope = await resolveScope(request.nextUrl.searchParams.get("workspaceSlug"));
  if ("error" in scope) return errorResponse(scope.error, scope.status ?? 500);
  try {
    const prompts = await listAssistantPrompts(scope.actor, scope.agencyId, scope.workspace.id);
    return NextResponse.json({ prompts }, { headers: mutatingApiHeaders() });
  } catch {
    return errorResponse("forbidden", 403);
  }
}

export async function POST(request: NextRequest) {
  const body = z
    .object({ workspaceSlug: workspaceSlugSchema, prompt: AssistantPromptInputSchema })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("invalid_request", 400);
  const scope = await resolveScope(body.data.workspaceSlug);
  if ("error" in scope) return errorResponse(scope.error, scope.status ?? 500);
  try {
    const prompt = await createAssistantPrompt(
      scope.actor,
      scope.agencyId,
      scope.workspace.id,
      body.data.prompt,
    );
    return NextResponse.json({ prompt }, { status: 201, headers: mutatingApiHeaders() });
  } catch {
    return errorResponse("forbidden", 403);
  }
}
