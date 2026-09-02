"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItems, securityAuditEvents, activityEvents } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { captureError } from "@/lib/observability/sentry";
import { logWarn } from "@/lib/observability/logger";

/**
 * Destructive "Reset idea" action (FEAT-DESTRUCTIVE-IDEA-2026-08-28).
 *
 * Server-side companion to the Danger zone button on the content
 * detail page. The action:
 *
 *   1. Requires `platform.destructive.execute` — LaraTik owners
 *      only, NOT agency operators / auditors / support.
 *   2. Re-loads the idea so the typed-phrase confirm can be
 *      compared to the live title (the page may have been cached).
 *   3. Validates the typed phrase AND reason client-side echoes
 *      (server is the source of truth — never trust the client).
 *   4. Writes a `security_audit_event` row BEFORE the delete (so
 *      the audit trail survives even if the transaction rolls
 *      back). The metadata captures the per-bucket counts and the
 *      operator's reason.
 *   5. Runs `DELETE FROM content_item WHERE id = $1` inside a
 *      transaction. The DB's FK CASCADEs clean up the 8 child
 *      tables; the 3 SET-NULL children keep their rows with
 *      `content_item_id = NULL`.
 *   6. On success: revalidates the planning list and redirects the
 *      operator back to `/app/w/[slug]/planning` so they can see
 *      the idea is gone.
 *
 * The action returns a state object compatible with React 19's
 * `useActionState`, so the destructive dialog can show the error
 * inline without unmounting.
 */

const resetIdeaCommandSchema = z.object({
  contentItemId: z.string().uuid(),
  typedPhrase: z.string().min(1).max(500),
  reason: z
    .string()
    .trim()
    .min(8, "Reason must be at least 8 characters.")
    .max(2000, "Reason must be 2,000 characters or fewer."),
});

export type ResetIdeaCommand = z.infer<typeof resetIdeaCommandSchema>;

export type ResetIdeaActionState =
  | { ok: true; redirected: true }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Partial<Record<keyof ResetIdeaCommand, string>> };

function recordAudit(args: {
  actorId: string;
  contentItemId: string;
  outcome: "success" | "denied" | "failed";
  reason: string;
  typedPhraseMatch: boolean;
  errorMessage?: string;
  bucketCounts?: Record<string, number>;
}) {
  // Audit failures must never change the action contract. A 403
  // stays a 403 even if the audit row can't be written; a successful
  // delete stays successful. The observability stack will surface
  // the audit-write failure separately so a reviewer can correlate.
  db.insert(securityAuditEvents)
    .values({
      actorId: args.actorId,
      action: "platform.destructive.reset_idea",
      targetType: "content_item",
      targetId: args.contentItemId,
      outcome: args.outcome,
      metadata: {
        reason: args.reason,
        typed_phrase_match: args.typedPhraseMatch,
        error_message: args.errorMessage ?? null,
        bucket_counts: args.bucketCounts ?? null,
      },
    })
    .catch((error) => {
      captureError("reset_idea.audit_write_failed", error, {
        actorId: args.actorId,
        contentItemId: args.contentItemId,
        outcome: args.outcome,
      });
    });
}

export async function resetIdeaAction(
  workspaceSlug: string,
  _previous: ResetIdeaActionState | undefined,
  formData: FormData,
): Promise<ResetIdeaActionState> {
  const actor = await currentActor();
  if (!actor) {
    return { ok: false, error: "Sign in again to perform this action." };
  }

  // Parse the command first. Field errors map back to specific UI
  // inputs (the typed-phrase input, the reason textarea) so the
  // dialog can highlight the offender without a generic "failed".
  const parsed = resetIdeaCommandSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    typedPhrase: formData.get("typedPhrase"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ResetIdeaCommand, string>> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string" && !fieldErrors[path as keyof ResetIdeaCommand]) {
        fieldErrors[path as keyof ResetIdeaCommand] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  // Permission gate. We capture the deny separately from other
  // failures so the audit log distinguishes "wrong permission" from
  // "DB blew up."
  try {
    await requirePlatformPermission(actor, "platform.destructive.execute");
  } catch (error) {
    recordAudit({
      actorId: actor.id,
      contentItemId: parsed.data.contentItemId,
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

  // Reload the idea to compare the typed phrase against the live
  // title. We don't trust the title the page shipped in the form
  // because it could be stale, the user could have the wrong tab
  // open, or a colluding request could forge a typed-phrase value.
  const [idea] = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      workspaceId: contentItems.workspaceId,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!idea) {
    recordAudit({
      actorId: actor.id,
      contentItemId: parsed.data.contentItemId,
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: false,
      errorMessage: "Idea not found",
    });
    return { ok: false, error: "The idea no longer exists. Reload the page." };
  }

  // Cross-tenant guard: the destructive action must operate on an
  // idea inside the workspace the operator just navigated from. A
  // tampered formData could try to reset an idea in another
  // workspace; this check refuses.
  if (idea.workspaceId !== (await getWorkspaceIdForSlug(workspaceSlug, actor.id))) {
    logWarn("reset_idea.cross_tenant_attempt", {
      actorId: actor.id,
      contentItemId: parsed.data.contentItemId,
      workspaceSlug,
    });
    return { ok: false, error: "The idea is not in the current workspace." };
  }

  // Typed-phrase validation. Case-sensitive exact match — "Reset"
  // is a verb we want them to type deliberately, not autofill.
  if (parsed.data.typedPhrase !== idea.title) {
    recordAudit({
      actorId: actor.id,
      contentItemId: parsed.data.contentItemId,
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: false,
      errorMessage: "Typed phrase did not match idea title",
    });
    return {
      ok: false,
      fieldErrors: {
        typedPhrase: `Type the idea's title exactly: "${idea.title}".`,
      },
    };
  }

  // Run the delete. The DB's CASCADEs handle the 8 child tables;
  // the SET-NULL rows keep their content_item_id = NULL.
  try {
    await db.transaction(async (tx) => {
      // Pre-flight count for the audit log metadata. The UI already
      // showed the operator these counts when they opened the
      // dialog; we capture them again here so the audit log is
      // self-describing even if the UI changes shape later.
      const countsRaw = await tx.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM content_item_channel WHERE content_item_id = ${idea.id}) AS cic,
          (SELECT COUNT(*)::int FROM content_assignment WHERE content_item_id = ${idea.id}) AS ca,
          (SELECT COUNT(*)::int FROM comment WHERE content_item_id = ${idea.id}) AS c,
          (SELECT COUNT(*)::int FROM delivery_version WHERE content_item_id = ${idea.id}) AS dv
      `);
      const countsArr = Array.isArray(countsRaw)
        ? countsRaw
        : ((countsRaw as { rows?: unknown[] }).rows ?? []);
      const row = countsArr[0] as Record<string, string> | undefined;

      await tx.delete(contentItems).where(eq(contentItems.id, idea.id));

      // `exactOptionalPropertyTypes` is enabled in tsconfig, so
      // we conditionally spread rather than passing `undefined`.
      const bucketCounts = row
        ? {
            contentItemChannels: Number(row.cic),
            contentAssignments: Number(row.ca),
            comments: Number(row.c),
            deliveryVersions: Number(row.dv),
          }
        : null;
      const successMetadata = bucketCounts ? { bucketCounts } : {};
      recordAudit({
        actorId: actor.id,
        contentItemId: idea.id,
        outcome: "success",
        reason: parsed.data.reason,
        typedPhraseMatch: true,
        ...successMetadata,
      });

      // Activity log (plan §1). The row is written inside the
      // same transaction as the DELETE so the activity timeline
      // only records the delete when the delete commits. The
      // `summary` carries the human-readable string the
      // `ActivityTimeline` component renders by default; the
      // `metadata` mirrors the audit row's bucket counts so a
      // "why did the operator delete this idea?" review needs
      // only one join. `content_item_id` becomes `NULL` after
      // the cascade delete (the FK is `ON DELETE SET NULL`),
      // which the timeline renders as a "deleted" badge.
      await tx.insert(activityEvents).values({
        workspaceId: idea.workspaceId,
        contentItemId: idea.id,
        actorId: actor.id,
        kind: "delete",
        summary: `Deleted idea: ${idea.title}`,
        beforeData: { title: idea.title },
        metadata: {
          reason: parsed.data.reason,
          crossTenantGuard: "passed",
          ...(bucketCounts ? { bucketCounts } : {}),
        },
      });
    });
  } catch (error) {
    captureError("reset_idea.delete_failed", error, {
      actorId: actor.id,
      contentItemId: idea.id,
    });
    recordAudit({
      actorId: actor.id,
      contentItemId: idea.id,
      outcome: "failed",
      reason: parsed.data.reason,
      typedPhraseMatch: true,
      errorMessage: error instanceof Error ? error.message : "Unknown DB error",
    });
    return {
      ok: false,
      error: "The idea could not be deleted. Try again or contact platform support.",
    };
  }

  // Refresh the planning list and bounce the operator back. The
  // `redirect` throws so the rest of the action never runs; that's
  // fine — there's nothing to return.
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  revalidatePath(`/app/w/${workspaceSlug}`);
  redirect(`/app/w/${workspaceSlug}/planning?reset=1`);
}

/**
 * Cross-tenant guard helper: resolve the workspace id from the
 * route slug, scoped to the operator's agency membership. The
 * destructive action uses this to refuse tampered formData.
 */
async function getWorkspaceIdForSlug(slug: string, actorId: string): Promise<string | null> {
  const ws = await getAccessibleWorkspace({ id: actorId }, slug);
  return ws?.id ?? null;
}
