"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItems, securityAuditEvents } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { captureError } from "@/lib/observability/sentry";
import { LIVE_STATUSES } from "@/lib/content/reset-all-ideas";

/**
 * Bulk destructive "Reset all ideas" action.
 *
 * Hard-deletes every idea in a workspace (optionally excluding
 * live `published` / `partially_published` rows) plus all cascade
 * children. Same FK CASCADE contract as the per-idea reset; the
 * 3 SET-NULL tables keep their rows with the link cleared.
 *
 * The "includePublished" toggle is OFF by default. The typed-phrase
 * is the workspace's name (case-sensitive exact match), which
 * means a fat-finger at the wrong route (or in the wrong tenant)
 * is caught by the cross-tenant guard BEFORE the typed phrase
 * check ever runs.
 *
 * Audit: a single row per bulk operation. The metadata carries:
 *   - the count of ideas deleted
 *   - the array of idea IDs (so a reviewer can grep for a specific
 *     idea in the audit log)
 *   - the breakdown by status (the same shape the dialog showed
 *     to the operator at confirm time)
 *   - the includePublished toggle value (so a future "did the
 *     operator include live ideas?" review is one query)
 *
 * One row per operation, NOT one row per idea. The per-idea
 * audit trail already exists in `content_item`'s tombstone (or
 * the lack thereof — the row is gone), and the workspace-level
 * audit row is the right granularity for a bulk action.
 */

const resetAllIdeasCommandSchema = z.object({
  includePublished: z.boolean(),
  typedPhrase: z.string().min(1).max(500),
  reason: z
    .string()
    .trim()
    .min(8, "Reason must be at least 8 characters.")
    .max(2000, "Reason must be 2,000 characters or fewer."),
});

export type ResetAllIdeasCommand = z.infer<typeof resetAllIdeasCommandSchema>;

export type ResetAllIdeasActionState =
  | { ok: true; redirected: true }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Partial<Record<keyof ResetAllIdeasCommand, string>> };

function recordAudit(args: {
  actorId: string;
  workspaceId: string;
  workspaceName: string;
  includePublished: boolean;
  ideaIds: string[];
  byStatus: Record<string, number>;
  outcome: "success" | "denied" | "failed";
  reason: string;
  typedPhraseMatch: boolean;
  errorMessage?: string;
}) {
  db.insert(securityAuditEvents)
    .values({
      actorId: args.actorId,
      action: "platform.destructive.reset_all_ideas",
      targetType: "workspace",
      targetId: args.workspaceId,
      outcome: args.outcome,
      metadata: {
        workspace_name: args.workspaceName,
        include_published: args.includePublished,
        reason: args.reason,
        typed_phrase_match: args.typedPhraseMatch,
        idea_count: args.ideaIds.length,
        idea_ids: args.ideaIds,
        by_status: args.byStatus,
        error_message: args.errorMessage ?? null,
      },
    })
    .catch((error) => {
      captureError("reset_all_ideas.audit_write_failed", error, {
        actorId: args.actorId,
        workspaceId: args.workspaceId,
        outcome: args.outcome,
      });
    });
}

export async function resetAllIdeasAction(
  workspaceSlug: string,
  _previous: ResetAllIdeasActionState | undefined,
  formData: FormData,
): Promise<ResetAllIdeasActionState> {
  const actor = await currentActor();
  if (!actor) {
    return { ok: false, error: "Sign in again to perform this action." };
  }

  // Parse the command. The `includePublished` flag is rendered as
  // a hidden input that carries `"true"` or `"false"`.
  const includePublishedRaw = formData.get("includePublished");
  const includePublished = includePublishedRaw === "true";

  const parsed = resetAllIdeasCommandSchema.safeParse({
    includePublished,
    typedPhrase: formData.get("typedPhrase"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ResetAllIdeasCommand, string>> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string" && !fieldErrors[path as keyof ResetAllIdeasCommand]) {
        fieldErrors[path as keyof ResetAllIdeasCommand] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  // Permission gate. Same `platform.destructive.execute` as the
  // per-idea reset — bulk reset is destructive in the same way,
  // so the gate is the same.
  try {
    await requirePlatformPermission(actor, "platform.destructive.execute");
  } catch (error) {
    recordAudit({
      actorId: actor.id,
      workspaceId: "",
      workspaceName: "",
      includePublished: parsed.data.includePublished,
      ideaIds: [],
      byStatus: {},
      outcome: "denied",
      reason: parsed.data.reason,
      typedPhraseMatch: false,
      errorMessage: error instanceof Error ? error.message : "Permission denied",
    });
    return {
      ok: false,
      error: "You don't have permission to perform this action.",
    };
  }

  // Cross-tenant guard: resolve the workspace from the route slug,
  // scoped to the operator's accessible workspaces.
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug);
  if (!workspace) {
    return { ok: false, error: "Workspace not found." };
  }

  // Typed-phrase validation. The phrase is the workspace's live
  // name (case-sensitive exact match). A wrong tenant that
  // happens to have a workspace with a similar name will fail
  // here because we already resolved the right workspace above.
  if (parsed.data.typedPhrase !== workspace.name) {
    recordAudit({
      actorId: actor.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      includePublished: parsed.data.includePublished,
      ideaIds: [],
      byStatus: {},
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: false,
      errorMessage: "Typed phrase did not match workspace name",
    });
    return {
      ok: false,
      fieldErrors: {
        typedPhrase: `Type the workspace's name exactly: "${workspace.name}".`,
      },
    };
  }

  // Run the delete. We snapshot the idea IDs first (inside the
  // same transaction as the DELETE) so the audit row carries the
  // full list. We also pull the per-status counts at the same
  // time so the audit is self-describing.
  let ideaIds: string[] = [];
  let byStatus: Record<string, number> = {};
  try {
    await db.transaction(async (tx) => {
      // Pre-flight inside the transaction. We always snapshot the
      // FULL list of idea IDs (regardless of includePublished) so
      // the audit can show "would have been X more if you toggled
      // includePublished" — but we only ACTUALLY delete the ones
      // that match the toggle.
      const all = await tx
        .select({ id: contentItems.id, status: contentItems.status })
        .from(contentItems)
        .where(eq(contentItems.workspaceId, workspace.id));
      ideaIds = all.map((r) => r.id);
      byStatus = all.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});

      // Apply the includePublished filter at the DELETE level.
      // When OFF, skip live rows; when ON, delete everything.
      const targetIds = parsed.data.includePublished
        ? ideaIds
        : all
            .filter((r) => !LIVE_STATUSES.includes(r.status as (typeof LIVE_STATUSES)[number]))
            .map((r) => r.id);

      if (targetIds.length === 0) {
        // Nothing to delete — we still want the audit row so a
        // reviewer can see the operator ran the flow and there
        // was nothing in scope. We throw a sentinel error and
        // catch it below.
        throw new NoOpSentinel();
      }

      await tx.delete(contentItems).where(inArray(contentItems.id, targetIds));

      recordAudit({
        actorId: actor.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        includePublished: parsed.data.includePublished,
        ideaIds: targetIds,
        byStatus,
        outcome: "success",
        reason: parsed.data.reason,
        typedPhraseMatch: true,
      });
    });
  } catch (error) {
    if (error instanceof NoOpSentinel) {
      // Nothing to delete. Audit still records the attempt so
      // "why did this operator even run it?" has an answer.
      recordAudit({
        actorId: actor.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        includePublished: parsed.data.includePublished,
        ideaIds: [],
        byStatus,
        outcome: "failed",
        reason: parsed.data.reason,
        typedPhraseMatch: true,
        errorMessage: "No ideas in scope",
      });
      return {
        ok: false,
        error: parsed.data.includePublished
          ? "This workspace has no ideas to delete."
          : "This workspace has no non-live ideas to delete. Toggle 'Include published ideas' if you also want to remove live content.",
      };
    }
    captureError("reset_all_ideas.delete_failed", error, {
      actorId: actor.id,
      workspaceId: workspace.id,
    });
    recordAudit({
      actorId: actor.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      includePublished: parsed.data.includePublished,
      ideaIds,
      byStatus,
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: true,
      errorMessage: error instanceof Error ? error.message : "Unknown DB error",
    });
    return {
      ok: false,
      error: "The ideas could not be deleted. Try again or contact platform support.",
    };
  }

  // Refresh everything that depends on the workspace's idea count.
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  revalidatePath(`/app/w/${workspaceSlug}`);
  revalidatePath(`/app/w/${workspaceSlug}/settings`);
  revalidatePath(`/app`);
  redirect(`/app/w/${workspaceSlug}/planning?reset=bulk`);
}

class NoOpSentinel extends Error {
  constructor() {
    super("No ideas in scope for the bulk reset");
    this.name = "NoOpSentinel";
  }
}
