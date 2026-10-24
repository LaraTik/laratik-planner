import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AssistantPromptParametersSchema } from "@/features/workspace-assistant";
import {
  archiveAssistantPrompt,
  publishAssistantPrompt,
  updateAssistantPrompt,
} from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

async function scope(request: NextRequest) {
  const workspaceSlug = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .safeParse(request.nextUrl.searchParams.get("workspaceSlug"));
  if (!workspaceSlug.success) return { error: "invalid_request", status: 400 as const };
  const actor = await currentActor();
  if (!actor) return { error: "not_signed_in", status: 401 as const };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return { error: "agency_context_unavailable", status: 403 as const };
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug.data, agency.agencyId);
  if (!workspace) return { error: "workspace_not_accessible", status: 403 as const };
  return { actor, agencyId: agency.agencyId, workspace };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ promptId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return errorResponse(resolved.error, resolved.status ?? 500);
  const { promptId } = await context.params;
  if (!z.string().guid().safeParse(promptId).success) return errorResponse("not_found", 404);
  const body = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("publish") }).strict(),
      z
        .object({
          action: z.literal("save"),
          prompt: z
            .object({
              name: z.string().trim().min(2).max(120),
              purpose: z.string().trim().min(1).max(500),
              goal: z.string().trim().min(1).max(1000),
              instructions: z.string().trim().min(1).max(12000),
              tags: z.array(z.string().trim().min(1).max(40)).max(12),
              parameters: AssistantPromptParametersSchema.default([]),
            })
            .strict(),
        })
        .strict(),
    ])
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("invalid_request", 400);
  try {
    const updated =
      body.data.action === "publish"
        ? await publishAssistantPrompt(
            resolved.actor,
            resolved.agencyId,
            resolved.workspace.id,
            promptId,
          )
        : await updateAssistantPrompt(
            resolved.actor,
            resolved.agencyId,
            resolved.workspace.id,
            promptId,
            body.data.prompt,
          );
    return updated
      ? NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() })
      : errorResponse("not_found", 404);
  } catch {
    return errorResponse("forbidden", 403);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ promptId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return errorResponse(resolved.error, resolved.status ?? 500);
  const { promptId } = await context.params;
  if (!z.string().guid().safeParse(promptId).success) return errorResponse("not_found", 404);
  try {
    const archived = await archiveAssistantPrompt(
      resolved.actor,
      resolved.agencyId,
      resolved.workspace.id,
      promptId,
    );
    return archived
      ? NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() })
      : errorResponse("not_found", 404);
  } catch {
    return errorResponse("forbidden", 403);
  }
}
