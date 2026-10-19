"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { communityConversations, communityEvents, workspaceMemberships } from "@/lib/db/schema";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { stateAfterAssignment } from "./assignment";
import { CommunityAccessError, requireCommunityPermission } from "./service";

export type AssignCommunityConversationResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "unauthorized"
        | "workspace_not_found"
        | "invalid_assignee"
        | "conversation_not_found"
        | "module_unavailable";
    };

export async function assignCommunityConversationAction(
  agencySlug: string,
  workspaceSlug: string,
  conversationId: string,
  assigneeId: string | null,
): Promise<AssignCommunityConversationResult> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { ok: false, code: "unauthorized" };
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { ok: false, code: "workspace_not_found" };

  try {
    await requireCommunityPermission(actor, workspace, "assign_and_route");
    if (assigneeId) {
      const [membership] = await db
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspace.id),
            eq(workspaceMemberships.userId, assigneeId),
            eq(workspaceMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (!membership) return { ok: false, code: "invalid_assignee" };
    }

    const [conversation] = await db
      .select({
        id: communityConversations.id,
        assignedTo: communityConversations.assignedTo,
        state: communityConversations.state,
      })
      .from(communityConversations)
      .where(
        and(
          eq(communityConversations.id, conversationId),
          eq(communityConversations.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!conversation) return { ok: false, code: "conversation_not_found" };
    if (conversation.assignedTo !== assigneeId) {
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(communityConversations)
          .set({
            assignedTo: assigneeId,
            state: stateAfterAssignment(conversation.state, assigneeId),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(communityConversations.id, conversationId),
              eq(communityConversations.workspaceId, workspace.id),
            ),
          )
          .returning({ id: communityConversations.id });
        if (!row) return false;
        await tx.insert(communityEvents).values({
          workspaceId: workspace.id,
          conversationId,
          actorId: actor.id,
          kind: assigneeId ? "conversation_assigned" : "conversation_unassigned",
          detail: assigneeId ? "Conversation assigned" : "Conversation unassigned",
          metadata: { assigneeId },
        });
        return true;
      });
      if (!updated) return { ok: false, code: "conversation_not_found" };
    }

    const basePath = `${workspaceBasePath(agencySlug, workspaceSlug)}/engagement`;
    revalidatePath(`${basePath}/inbox`);
    revalidatePath(`${basePath}/team`);
    revalidatePath(`${basePath}/activity`);
    revalidatePath(basePath);
    return { ok: true };
  } catch (error) {
    if (error instanceof CommunityAccessError) {
      return {
        ok: false,
        code: error.code === "permission_denied" ? "unauthorized" : "module_unavailable",
      };
    }
    throw error;
  }
}
