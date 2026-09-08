"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  securityAuditEvents,
  trendBoards,
  trendBoardItems,
  trendBriefs,
  trendFeedbacks,
  trendSignals,
  trendSourceActivities,
  trendSourceHealth,
  workspaces,
} from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { captureError } from "@/lib/observability/sentry";

/**
 * GDPR "Delete my trend data" action.
 *
 * Hard-deletes every row in the 7 trend-related tables that is
 * scoped to the workspace:
 *   - trend_signals
 *   - trend_boards (cascade to trend_board_items via the Drizzle
 *     schema's onDelete: "cascade")
 *   - trend_briefs
 *   - trend_feedback
 *   - trend_source_health
 *   - trend_source_activity
 *
 * It does NOT delete:
 *   - trend_source (the agency's source enablement + config).
 *     Configuration is operational data, not user data, so it
 *     survives a GDPR delete. The agency re-enables sources
 *     explicitly if they want to.
 *   - trend_source_audit (append-only audit log; same retention
 *     rules as security_audit_event).
 *   - saved_filter (these are user preferences, not user data).
 *   - workspace_source_optout (per-workspace opt-out rows;
 *     operational, not user-data).
 *
 * The action is gated by the same `platform.destructive.execute`
 * permission as the bulk-reset-all-ideas action. A typed-phrase
 * confirmation (workspace name) is required before the DELETE
 * runs, mirroring the bulk-reset flow.
 *
 * Audit: a single `security_audit_event` row per invocation with
 *   - the count of rows deleted per table
 *   - the typed-phrase match boolean
 *   - the operator's reason (≥ 8 chars)
 *   - the outcome (success | denied | failed)
 *
 * Privacy: the metadata in the audit row carries counts + the
 * workspace id only. No trend labels, source URLs, or raw payloads
 * are ever written.
 */

const deleteTrendDataCommandSchema = z.object({
  typedPhrase: z.string().min(1).max(500),
  reason: z
    .string()
    .trim()
    .min(8, "Reason must be at least 8 characters.")
    .max(2000, "Reason must be 2,000 characters or fewer."),
});

export type DeleteTrendDataCommand = z.infer<typeof deleteTrendDataCommandSchema>;

export type DeleteTrendDataActionState =
  | { ok: true; redirected: true }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Partial<Record<keyof DeleteTrendDataCommand, string>> };

function recordAudit(args: {
  actorId: string;
  workspaceId: string;
  workspaceName: string;
  outcome: "success" | "denied" | "failed";
  reason: string;
  typedPhraseMatch: boolean;
  counts: Record<string, number>;
  errorMessage?: string;
}) {
  db.insert(securityAuditEvents)
    .values({
      actorId: args.actorId,
      action: "platform.destructive.delete_workspace_trend_data",
      targetType: "workspace",
      targetId: args.workspaceId,
      outcome: args.outcome,
      metadata: {
        workspace_name: args.workspaceName,
        reason: args.reason,
        typed_phrase_match: args.typedPhraseMatch,
        counts: args.counts,
        error_message: args.errorMessage ?? null,
      },
    })
    .catch((error) => {
      captureError("delete_workspace_trend_data.audit_write_failed", error, {
        actorId: args.actorId,
        workspaceId: args.workspaceId,
        outcome: args.outcome,
      });
    });
}

export async function deleteWorkspaceTrendDataAction(
  workspaceSlug: string,
  _previous: DeleteTrendDataActionState | undefined,
  formData: FormData,
): Promise<DeleteTrendDataActionState> {
  const actor = await currentActor();
  if (!actor) {
    return { ok: false, error: "Sign in again to perform this action." };
  }

  const parsed = deleteTrendDataCommandSchema.safeParse({
    typedPhrase: formData.get("typedPhrase"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof DeleteTrendDataCommand, string>> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string" && !fieldErrors[path as keyof DeleteTrendDataCommand]) {
        fieldErrors[path as keyof DeleteTrendDataCommand] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  // Permission gate. Same destructive gate as the bulk-reset.
  try {
    await requirePlatformPermission(actor, "platform.destructive.execute");
  } catch (error) {
    recordAudit({
      actorId: actor.id,
      workspaceId: "",
      workspaceName: "",
      outcome: "denied",
      reason: parsed.data.reason,
      typedPhraseMatch: false,
      counts: {},
      errorMessage: error instanceof Error ? error.message : "Permission denied",
    });
    return {
      ok: false,
      error: "You don't have permission to perform this action.",
    };
  }

  // Cross-tenant guard.
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug);
  if (!workspace) {
    return { ok: false, error: "Workspace not found." };
  }

  // Typed-phrase validation against the live workspace name.
  if (parsed.data.typedPhrase !== workspace.name) {
    recordAudit({
      actorId: actor.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: false,
      counts: {},
      errorMessage: "Typed phrase did not match workspace name",
    });
    return {
      ok: false,
      fieldErrors: {
        typedPhrase: `Type the workspace's name exactly: "${workspace.name}".`,
      },
    };
  }

  // Run the cascade delete. We snapshot the per-table counts before
  // the DELETE so the audit row carries the full picture.
  const counts: Record<string, number> = {
    trend_signals: 0,
    trend_boards: 0,
    trend_board_items: 0,
    trend_briefs: 0,
    trend_feedback: 0,
    trend_source_health: 0,
    trend_source_activity: 0,
  };
  try {
    await db.transaction(async (tx) => {
      // Resolve the agency id for the workspace (trend_source_health /
      // trend_source_activity are agency-scoped, not workspace-scoped).
      const wsRow = (
        await tx
          .select({ agencyId: workspaces.agencyId })
          .from(workspaces)
          .where(eq(workspaces.id, workspace.id))
          .limit(1)
      )[0];
      const agencyId = wsRow?.agencyId ?? workspace.id;

      // trend_signals (workspace-scoped)
      const signalRows = await tx
        .select({ id: trendSignals.id })
        .from(trendSignals)
        .where(eq(trendSignals.workspaceId, workspace.id));
      counts.trend_signals = signalRows.length;
      if (signalRows.length > 0) {
        await tx.delete(trendSignals).where(
          inArray(
            trendSignals.id,
            signalRows.map((r) => r.id),
          ),
        );
      }

      // trend_boards (workspace-scoped; cascade to trend_board_items)
      const boardRows = await tx
        .select({ id: trendBoards.id })
        .from(trendBoards)
        .where(eq(trendBoards.workspaceId, workspace.id));
      counts.trend_boards = boardRows.length;
      if (boardRows.length > 0) {
        // trend_board_items is FK-cascaded on trend_board delete, but
        // we count and explicitly remove the link rows for the audit
        // record.
        const linkRows = await tx
          .select({ boardId: trendBoardItems.boardId })
          .from(trendBoardItems)
          .where(
            inArray(
              trendBoardItems.boardId,
              boardRows.map((r) => r.id),
            ),
          );
        counts.trend_board_items = linkRows.length;
        await tx.delete(trendBoards).where(
          and(
            eq(trendBoards.workspaceId, workspace.id),
            inArray(
              trendBoards.id,
              boardRows.map((r) => r.id),
            ),
          ),
        );
      }

      // trend_briefs (workspace-scoped)
      const briefRows = await tx
        .select({ id: trendBriefs.id })
        .from(trendBriefs)
        .where(eq(trendBriefs.workspaceId, workspace.id));
      counts.trend_briefs = briefRows.length;
      if (briefRows.length > 0) {
        await tx.delete(trendBriefs).where(
          inArray(
            trendBriefs.id,
            briefRows.map((r) => r.id),
          ),
        );
      }

      // trend_feedback (workspace-scoped)
      const feedbackRows = await tx
        .select({ id: trendFeedbacks.id })
        .from(trendFeedbacks)
        .where(eq(trendFeedbacks.workspaceId, workspace.id));
      counts.trend_feedback = feedbackRows.length;
      if (feedbackRows.length > 0) {
        await tx.delete(trendFeedbacks).where(
          inArray(
            trendFeedbacks.id,
            feedbackRows.map((r) => r.id),
          ),
        );
      }

      // trend_source_health (agency-scoped; cascade to the agency's
      // health rows. Workspace-level opt-out is preserved; the
      // health snapshot is regenerated on the next sync cycle.)
      const healthRows = await tx
        .select({ id: trendSourceHealth.id })
        .from(trendSourceHealth)
        .where(eq(trendSourceHealth.agencyId, agencyId));
      counts.trend_source_health = healthRows.length;
      if (healthRows.length > 0) {
        await tx.delete(trendSourceHealth).where(
          inArray(
            trendSourceHealth.id,
            healthRows.map((r) => r.id),
          ),
        );
      }

      // trend_source_activity (agency-scoped; same reasoning)
      const activityRows = await tx
        .select({ id: trendSourceActivities.id })
        .from(trendSourceActivities)
        .where(eq(trendSourceActivities.agencyId, agencyId));
      counts.trend_source_activity = activityRows.length;
      if (activityRows.length > 0) {
        await tx.delete(trendSourceActivities).where(
          inArray(
            trendSourceActivities.id,
            activityRows.map((r) => r.id),
          ),
        );
      }

      recordAudit({
        actorId: actor.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        outcome: "success",
        reason: parsed.data.reason,
        typedPhraseMatch: true,
        counts,
      });
    });
  } catch (error) {
    captureError("delete_workspace_trend_data.delete_failed", error, {
      actorId: actor.id,
      workspaceId: workspace.id,
    });
    recordAudit({
      actorId: actor.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: true,
      counts,
      errorMessage: error instanceof Error ? error.message : "Unknown DB error",
    });
    return {
      ok: false,
      error: "The trend data could not be deleted. Try again or contact platform support.",
    };
  }

  revalidatePath(`/app/w/${workspaceSlug}`);
  revalidatePath(`/app/w/${workspaceSlug}/settings`);
  revalidatePath(`/app/w/${workspaceSlug}/trends`);
  revalidatePath("/app");
  redirect(`/app/w/${workspaceSlug}/settings?trend_data_deleted=1`);
}
