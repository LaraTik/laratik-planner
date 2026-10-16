"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { CommunityAccessError, requireCommunityPermission } from "./service";
import { sendCommunityReply, type CommunityReplyResult } from "./reply-service";

export async function sendCommunityReplyAction(
  agencySlug: string,
  workspaceSlug: string,
  conversationId: string,
  body: string,
  visibility: "public" | "private",
): Promise<CommunityReplyResult | { ok: false; code: "unauthorized" | "workspace_not_found" }> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { ok: false, code: "unauthorized" };
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { ok: false, code: "workspace_not_found" };
  try {
    await requireCommunityPermission(
      actor,
      workspace,
      visibility === "public" ? "reply_publicly" : "reply_privately",
    );
    const result = await sendCommunityReply({
      actorId: actor.id,
      agencyId: workspace.agencyId,
      workspaceId: workspace.id,
      conversationId,
      body,
      visibility,
    });
    if (result.ok) {
      const basePath = `${workspaceBasePath(agencySlug, workspaceSlug)}/engagement`;
      revalidatePath(`${basePath}/inbox`);
      revalidatePath(`${basePath}/comments`);
      revalidatePath(`${basePath}/activity`);
      revalidatePath(basePath);
    }
    return result;
  } catch (error) {
    if (error instanceof CommunityAccessError) {
      return {
        ok: false,
        code: error.code === "permission_denied" ? "unauthorized" : "module_unavailable",
      };
    }
    return { ok: false, code: "provider_failed" };
  }
}
