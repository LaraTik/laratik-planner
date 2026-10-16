"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { CommunityAccessError, requireCommunityPermission } from "./service";
import { syncMetaCommunityComments } from "./comment-sync-service";
import { syncMetaCommunityPrivateMessages } from "./private-message-sync-service";

export type CommunityCommentSyncActionResult =
  | { ok: true; insertedMessages: number; readChannels: number; failures: string[] }
  | { ok: false; code: "unauthorized" | "workspace_not_found" | "sync_failed" };

export async function syncCommunityCommentsAction(
  agencySlug: string,
  workspaceSlug: string,
): Promise<CommunityCommentSyncActionResult> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { ok: false, code: "unauthorized" };
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { ok: false, code: "workspace_not_found" };
  try {
    await requireCommunityPermission(actor, workspace, "manage_connections");
    const result = await syncMetaCommunityComments(workspace.agencyId, workspace.id);
    const basePath = `${workspaceBasePath(agencySlug, workspaceSlug)}/engagement`;
    revalidatePath(`${basePath}/connections`);
    revalidatePath(`${basePath}/inbox`);
    revalidatePath(`${basePath}/comments`);
    revalidatePath(basePath);
    return {
      ok: true,
      insertedMessages: result.insertedMessages,
      readChannels: result.readChannels,
      failures: result.failures,
    };
  } catch (error) {
    if (error instanceof CommunityAccessError && error.code === "permission_denied") {
      return { ok: false, code: "unauthorized" };
    }
    return { ok: false, code: "sync_failed" };
  }
}

export async function syncCommunityPrivateMessagesAction(
  agencySlug: string,
  workspaceSlug: string,
): Promise<CommunityCommentSyncActionResult> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { ok: false, code: "unauthorized" };
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { ok: false, code: "workspace_not_found" };
  try {
    await requireCommunityPermission(actor, workspace, "manage_connections");
    const result = await syncMetaCommunityPrivateMessages(workspace.agencyId, workspace.id);
    const basePath = `${workspaceBasePath(agencySlug, workspaceSlug)}/engagement`;
    revalidatePath(`${basePath}/connections`);
    revalidatePath(`${basePath}/inbox`);
    revalidatePath(`${basePath}/activity`);
    revalidatePath(basePath);
    return {
      ok: true,
      insertedMessages: result.insertedMessages,
      readChannels: result.readChannels,
      failures: result.failures,
    };
  } catch (error) {
    if (error instanceof CommunityAccessError && error.code === "permission_denied") {
      return { ok: false, code: "unauthorized" };
    }
    return { ok: false, code: "sync_failed" };
  }
}
