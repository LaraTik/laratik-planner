import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteAssistantConversation,
  getAssistantConversation,
  updateAssistantConversation,
} from "@/features/workspace-assistant/server";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

const querySchema = z.object({ workspaceSlug: z.string().trim().min(1).max(120) });
const idSchema = z.string().guid();

async function scope(request: NextRequest) {
  const query = querySchema.safeParse({
    workspaceSlug: request.nextUrl.searchParams.get("workspaceSlug"),
  });
  if (!query.success) return { error: "invalid_request", status: 400 as const };
  const actor = await currentActor();
  if (!actor) return { error: "not_signed_in", status: 401 as const };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return { error: "agency_context_unavailable", status: 403 as const };
  const workspace = await getAccessibleWorkspace(actor, query.data.workspaceSlug, agency.agencyId);
  if (!workspace) return { error: "workspace_not_accessible", status: 403 as const };
  return { actor, workspace };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return errorResponse(resolved.error, resolved.status ?? 500);
  const { conversationId } = await context.params;
  if (!idSchema.safeParse(conversationId).success) return errorResponse("not_found", 404);
  try {
    const conversation = await getAssistantConversation(
      resolved.actor,
      resolved.workspace.id,
      conversationId,
      request.nextUrl.searchParams.get("archived") === "true",
    );
    return conversation
      ? NextResponse.json({ conversation }, { headers: mutatingApiHeaders() })
      : errorResponse("not_found", 404);
  } catch {
    return errorResponse("forbidden", 403);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return errorResponse(resolved.error, resolved.status ?? 500);
  const { conversationId } = await context.params;
  if (!idSchema.safeParse(conversationId).success) return errorResponse("not_found", 404);
  const body = z
    .object({
      title: z.string().trim().min(1).max(160).optional(),
      archived: z.boolean().optional(),
      mode: z.enum(["ask", "plan", "apply"]).optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.title !== undefined || value.archived !== undefined || value.mode !== undefined,
    )
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("invalid_request", 400);
  try {
    const updated = await updateAssistantConversation(
      resolved.actor,
      resolved.workspace.id,
      conversationId,
      {
        ...(body.data.title !== undefined ? { title: body.data.title } : {}),
        ...(body.data.archived !== undefined ? { archived: body.data.archived } : {}),
        ...(body.data.mode !== undefined ? { mode: body.data.mode } : {}),
      },
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
  context: { params: Promise<{ conversationId: string }> },
) {
  const resolved = await scope(request);
  if ("error" in resolved) return errorResponse(resolved.error, resolved.status ?? 500);
  const { conversationId } = await context.params;
  if (!idSchema.safeParse(conversationId).success) return errorResponse("not_found", 404);
  try {
    const deleted = await deleteAssistantConversation(
      resolved.actor,
      resolved.workspace.id,
      conversationId,
    );
    return deleted
      ? NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() })
      : errorResponse("not_found", 404);
  } catch {
    return errorResponse("forbidden", 403);
  }
}
