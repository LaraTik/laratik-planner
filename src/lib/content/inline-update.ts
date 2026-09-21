"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { contentItems, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { currentActor } from "@/lib/auth/current-actor";
import { INLINE_EDITABLE_STATUSES } from "./inline-update-actions";
import { auth } from "@/lib/auth/config";
import { recordMaterialityEvent } from "@/lib/publishing/materiality";

/**
 * Inline-update server actions for the planning detail page.
 *
 * The full `updateContentItemAction` (in `actions.ts`) is the
 * canonical "edit everything" form, but the inline-editing
 * UX on the planning detail page needs *single-field*
 * mutations that:
 *  - Don't redirect (the user stays on the page)
 *  - Don't require the full set of required fields
 *  - Trigger the same audit / activity events + materiality
 *    invalidation as the full edit
 *  - Re-check the broader inline-editability guard (see
 *    `INLINE_EDITABLE_STATUSES` below) so a planner can fix a
 *    last-minute title / date / brief on an item that's
 *    already in design or ready_to_publish without round-
 *    tripping through the full edit form.
 *
 * Materiality contract (master prompt §4): any change to the
 * brief, the schedule, or the title invalidates the existing
 * approval set. Each inline mutation funnels through
 * `recordMaterialityEvent` so the revision bumps, approvals
 * reset, and reviewers get notified — same guarantees as the
 * full `updateContentItem`.
 *
 * Each action returns `{ error?: string }` on failure and
 * `{ ok: true }` on success — the inline-edit component
 * keeps the user in edit mode when the action errored.
 */

const BriefUpdateSchema = z.object({
  brief: z.string().max(2000),
});

const DateUpdateSchema = z.object({
  plannedPublishAt: z.coerce.date(),
});

const TitleUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200),
});

/**
 * Run the shared inline-editability + workspace membership
 * gate. Returns either the resolved context (actor, workspace,
 * item) or a `{ error }` discriminant. Centralised so the
 * three actions below apply the same gate identically.
 *
 * Editability rule: an actor is allowed to inline-update iff
 * they hold the `workspace_manager` or `content_planner` role
 * AND the item status is in `INLINE_EDITABLE_STATUSES`. This
 * is intentionally broader than `UPDATEABLE_STATUSES` (which
 * gates the full edit form); see the module docstring for
 * the rationale and the materiality contract that follows.
 */
async function getEditableItem(workspaceSlug: string, contentItemId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" } as const;
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in" } as const;
  const ws = await getAccessibleWorkspace(actor, workspaceSlug);
  if (!ws) return { error: "Workspace not found" } as const;
  // Verify the item belongs to the workspace.
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item || item.workspaceId !== ws.id) {
    return { error: "Content item not found" } as const;
  }
  const editable = await hasWorkspaceRole(actor, ws.id, ["workspace_manager", "content_planner"]);
  if (!editable) {
    return { error: "You don't have permission to edit this item." } as const;
  }
  if (!(INLINE_EDITABLE_STATUSES as readonly string[]).includes(item.status)) {
    return {
      error: `This item is in ${item.status.replace(/_/g, " ")} — only editable items can be changed here.`,
    } as const;
  }
  return { actor, workspace: ws, item } as const;
}

/**
 * Find the resource code for the materiality event tied to an
 * inline update. `schedule` is the only material resource that
 * maps to an inline date change; brief + title don't have a
 * direct `MATERIAL_RESOURCES` member but the master prompt §4
 * lists the brief as the creative direction — so we map brief
 * to "audience_copy" (the closest documented material
 * resource) and title to "schedule" with the rationale in the
 * MATERIAL_RESOURCES comment that title is a co-equal change.
 *
 * Returning the resource lets the materiality service route
 * the right notifications.
 */
function resourceFor(
  kind: "title_updated" | "date_updated" | "brief_updated",
): "schedule" | "audience_copy" | "schedule" {
  if (kind === "date_updated") return "schedule";
  if (kind === "brief_updated") return "audience_copy";
  return "schedule";
}

export async function inlineUpdateBriefAction(
  workspaceSlug: string,
  contentItemId: string,
  brief: string,
): Promise<{ error?: string; ok?: true }> {
  const parsed = BriefUpdateSchema.safeParse({ brief });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const ctx = await getEditableItem(workspaceSlug, contentItemId);
  if ("error" in ctx) return { error: ctx.error };
  let beforeBrief: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ brief: contentItems.brief })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
      beforeBrief = before?.brief ?? null;
      await tx
        .update(contentItems)
        .set({ brief: parsed.data.brief, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        contentItemId,
        actorId: ctx.actor.id,
        kind: "brief_updated",
        summary: "Updated the brief inline",
        metadata: { before: beforeBrief, after: parsed.data.brief },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the brief." };
  }
  // Materiality: any change to the creative direction invalidates
  // the existing approval set (master prompt §4). Errors are
  // surfaced but the brief row already saved — the planner sees
  // the warning and can re-try by re-saving or accept the
  // divergent state.
  try {
    await recordMaterialityEvent({
      actor: ctx.actor,
      contentItemId,
      resource: resourceFor("brief_updated"),
      beforeValue: beforeBrief,
      afterValue: parsed.data.brief,
      reasonCode: "audience_copy.update",
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `${e.message} Brief was saved but approvals were not reset.`
          : "Brief saved but approvals were not reset.",
    };
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  return { ok: true };
}

export async function inlineUpdateTitleAction(
  workspaceSlug: string,
  contentItemId: string,
  title: string,
): Promise<{ error?: string; ok?: true }> {
  const parsed = TitleUpdateSchema.safeParse({ title });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const ctx = await getEditableItem(workspaceSlug, contentItemId);
  if ("error" in ctx) return { error: ctx.error };
  let beforeTitle: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ title: contentItems.title })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
      beforeTitle = before?.title ?? null;
      await tx
        .update(contentItems)
        .set({ title: parsed.data.title, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        contentItemId,
        actorId: ctx.actor.id,
        kind: "title_updated",
        summary: "Renamed the item",
        metadata: { before: beforeTitle, after: parsed.data.title },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the title." };
  }
  // Title is a co-equal creative-direction change (master prompt
  // §4: "any material change to the brief or creative direction
  // forces a fresh review"). Funnel through the materiality
  // service so the same invalidation + notification contract
  // runs as for a brief change.
  try {
    await recordMaterialityEvent({
      actor: ctx.actor,
      contentItemId,
      resource: resourceFor("title_updated"),
      beforeValue: beforeTitle,
      afterValue: parsed.data.title,
      reasonCode: "audience_copy.update",
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `${e.message} Title was saved but approvals were not reset.`
          : "Title saved but approvals were not reset.",
    };
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  return { ok: true };
}

export async function inlineUpdateDateAction(
  workspaceSlug: string,
  contentItemId: string,
  plannedPublishAt: Date,
): Promise<{ error?: string; ok?: true }> {
  const parsed = DateUpdateSchema.safeParse({ plannedPublishAt });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const ctx = await getEditableItem(workspaceSlug, contentItemId);
  if ("error" in ctx) return { error: ctx.error };
  // Hold the before-snapshot in a box so the closure mutation
  // inside the transaction is visible to the outer scope.
  // (A bare `let` is narrowed to `null` by TS's control-flow
  // analysis because the assignment happens inside an async
  // callback the type-checker can't reach.)
  const beforeBox: { value: Date | null } = { value: null };
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ plannedPublishAt: contentItems.plannedPublishAt })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
      beforeBox.value = before?.plannedPublishAt ?? null;
      await tx
        .update(contentItems)
        .set({ plannedPublishAt: parsed.data.plannedPublishAt, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));
      const beforeIso = beforeBox.value ? beforeBox.value.toISOString() : null;
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        contentItemId,
        actorId: ctx.actor.id,
        kind: "date_updated",
        summary: "Changed the planned publish date",
        metadata: {
          before: beforeIso,
          after: parsed.data.plannedPublishAt.toISOString(),
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the date." };
  }
  // Schedule is the canonical `MATERIAL_RESOURCES` member that
  // maps to a date change. Funnel through the materiality service
  // so the revision increments, the open approval_requests
  // cancel, and the reviewers get notified.
  try {
    await recordMaterialityEvent({
      actor: ctx.actor,
      contentItemId,
      resource: resourceFor("date_updated"),
      beforeValue: beforeBox.value ? beforeBox.value.toISOString() : null,
      afterValue: parsed.data.plannedPublishAt.toISOString(),
      reasonCode: "schedule.update",
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `${e.message} Date was saved but approvals were not reset.`
          : "Date saved but approvals were not reset.",
    };
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  return { ok: true };
}
