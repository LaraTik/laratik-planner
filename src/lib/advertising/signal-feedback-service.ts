import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { advertisingSignalFeedback, securityAuditEvents } from "@/lib/db/schema";
import type {
  AdvertisingSignalFeedbackMutation,
  AdvertisingSignalFeedbackView,
} from "./signal-feedback";

function toView(row: typeof advertisingSignalFeedback.$inferSelect): AdvertisingSignalFeedbackView {
  return {
    id: row.id,
    signalKey: row.signalKey,
    entityType: row.entityType as AdvertisingSignalFeedbackView["entityType"],
    entityId: row.entityId,
    state: row.state as AdvertisingSignalFeedbackView["state"],
    reason: row.reason,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    generatedAt: row.generatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdvertisingSignalFeedback(args: {
  workspaceId: string;
  accountId: string;
  userId: string;
  since: string;
  until: string;
}): Promise<AdvertisingSignalFeedbackView[]> {
  const rows = await db
    .select()
    .from(advertisingSignalFeedback)
    .where(
      and(
        eq(advertisingSignalFeedback.workspaceId, args.workspaceId),
        eq(advertisingSignalFeedback.accountId, args.accountId),
        eq(advertisingSignalFeedback.userId, args.userId),
        eq(advertisingSignalFeedback.periodSince, args.since),
        eq(advertisingSignalFeedback.periodUntil, args.until),
      ),
    );
  return rows.map(toView);
}

export async function saveAdvertisingSignalFeedback(args: {
  agencyId: string;
  workspaceId: string;
  accountId: string;
  userId: string;
  since: string;
  until: string;
  mutation: AdvertisingSignalFeedbackMutation;
}): Promise<AdvertisingSignalFeedbackView> {
  const [row] = await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(advertisingSignalFeedback)
      .values({
        agencyId: args.agencyId,
        workspaceId: args.workspaceId,
        accountId: args.accountId,
        userId: args.userId,
        signalKey: args.mutation.signalKey,
        entityType: args.mutation.entityType,
        entityId: args.mutation.entityId,
        periodSince: args.since,
        periodUntil: args.until,
        state: args.mutation.state,
        reason: args.mutation.reason?.trim() || null,
        snoozedUntil: args.mutation.snoozedUntil ? new Date(args.mutation.snoozedUntil) : null,
      })
      .onConflictDoUpdate({
        target: [
          advertisingSignalFeedback.workspaceId,
          advertisingSignalFeedback.accountId,
          advertisingSignalFeedback.userId,
          advertisingSignalFeedback.signalKey,
          advertisingSignalFeedback.entityType,
          advertisingSignalFeedback.entityId,
          advertisingSignalFeedback.periodSince,
          advertisingSignalFeedback.periodUntil,
        ],
        set: {
          state: args.mutation.state,
          reason: args.mutation.reason?.trim() || null,
          snoozedUntil: args.mutation.snoozedUntil ? new Date(args.mutation.snoozedUntil) : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!saved) throw new Error("advertising_signal_feedback_not_saved");
    await tx.insert(securityAuditEvents).values({
      actorId: args.userId,
      action: "advertising_signal_feedback.updated",
      targetType: "advertising_signal_feedback",
      targetId: saved.id,
      outcome: "success",
      metadata: {
        agencyId: args.agencyId,
        workspaceId: args.workspaceId,
        accountId: args.accountId,
        signalKey: args.mutation.signalKey,
        entityType: args.mutation.entityType,
        entityId: args.mutation.entityId,
        state: args.mutation.state,
      },
    });
    return [saved];
  });

  return toView(row);
}
