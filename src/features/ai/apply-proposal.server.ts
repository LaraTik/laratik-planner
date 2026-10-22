import "server-only";

import { and, eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { monthlyPlanningSessions, planningProposals } from "@/lib/db/schema";
import type { BatchCreateInput } from "@/lib/content/batch";
import { batchCreateContentItems } from "@/features/content/server";

/**
 * Apply the approved proposal and its generated content as one unit.
 * A failure at any point leaves the proposal approved and creates no posts.
 */
export async function applyMonthlyProposalAtomically(input: {
  actor: Actor;
  workspaceId: string;
  sessionId: string;
  proposalId: string;
  content: BatchCreateInput;
}): Promise<string[] | null> {
  if (input.content.workspaceId !== input.workspaceId) {
    throw new Error("Monthly planning content must match the proposal workspace");
  }

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(planningProposals)
      .set({ status: "applying", updatedAt: new Date() })
      .where(
        and(
          eq(planningProposals.id, input.proposalId),
          eq(planningProposals.sessionId, input.sessionId),
          eq(planningProposals.status, "approved"),
        ),
      )
      .returning({ id: planningProposals.id });
    if (!claimed) return null;

    const contentIds = await batchCreateContentItems(input.actor, input.content, tx);
    const now = new Date();
    const [appliedProposal] = await tx
      .update(planningProposals)
      .set({
        status: "applied",
        appliedContentIds: contentIds,
        appliedAt: now,
        appliedBy: input.actor.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(planningProposals.id, input.proposalId),
          eq(planningProposals.sessionId, input.sessionId),
          eq(planningProposals.status, "applying"),
        ),
      )
      .returning({ id: planningProposals.id });
    if (!appliedProposal) throw new Error("Monthly planning proposal could not be finalized");

    const [appliedSession] = await tx
      .update(monthlyPlanningSessions)
      .set({ status: "applied", updatedAt: now })
      .where(
        and(
          eq(monthlyPlanningSessions.id, input.sessionId),
          eq(monthlyPlanningSessions.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: monthlyPlanningSessions.id });
    if (!appliedSession) throw new Error("Monthly planning session could not be finalized");

    return contentIds;
  });
}
