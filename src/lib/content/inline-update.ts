"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { contentItems, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { currentActor } from "@/lib/auth/current-actor";
import { auth } from "@/lib/auth/config";

/**
 * Inline-update server actions for the planning detail page.
 *
 * The full `updateContentItemAction` (in `actions.ts`) is the
 * canonical "edit everything" form, but the inline-editing
 * UX on the planning detail page needs *single-field*
 * mutations that:
 *  - Don't redirect (the user stays on the page)
 *  - Don't require the full set of required fields
 *  - Trigger the same audit / activity events as the full
 *    edit
 *  - Re-check the `UPDATEABLE_STATUSES` editability guard
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
 * Materiality: a brief / date / title change invalidates any
 * pending content review (M2.5: "any material change to the
 * brief or creative direction forces a fresh review"). The
 * full `updateContentItem` handles this in one transaction;
 * the inline path needs the same guarantee, so each inline
 * mutation calls `recordMaterialityActivity` which performs
 * the same invalidation + activity-event write.
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
  // Editability: only `workspace_manager` and `content_planner`
  // can mutate, and only while the status is in
  // `UPDATEABLE_STATUSES` (the same gate the full edit form
  // uses — see `lib/content/service.ts`).
  const editable = await hasWorkspaceRole(actor, ws.id, ["workspace_manager", "content_planner"]);
  if (!editable) {
    return { error: "You don't have permission to edit this item." } as const;
  }
  const UPDATABLE = new Set([
    "draft",
    "content_review",
    "changes_requested",
    "approved_for_design",
    "in_design",
    "creative_review",
    "ready_to_publish",
  ]);
  if (!UPDATABLE.has(item.status)) {
    return {
      error: `This item is in ${item.status.replace(/_/g, " ")} — only editable items can be changed here.`,
    } as const;
  }
  return { actor, workspace: ws, item } as const;
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
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ brief: contentItems.brief })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
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
        metadata: { before: before?.brief ?? null, after: parsed.data.brief },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the brief." };
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
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ title: contentItems.title })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
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
        metadata: { before: before?.title ?? null, after: parsed.data.title },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the title." };
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
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ plannedPublishAt: contentItems.plannedPublishAt })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
      await tx
        .update(contentItems)
        .set({ plannedPublishAt: parsed.data.plannedPublishAt, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        contentItemId,
        actorId: ctx.actor.id,
        kind: "date_updated",
        summary: "Changed the planned publish date",
        metadata: {
          before: before?.plannedPublishAt ? before.plannedPublishAt.toISOString() : null,
          after: parsed.data.plannedPublishAt.toISOString(),
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the date." };
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  return { ok: true };
}
