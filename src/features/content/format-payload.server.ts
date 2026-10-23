import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  activityEvents,
  contentItems,
  contentResearchTeardownLinks,
  researchTeardowns,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { designerEditableFieldsFor } from "@/lib/content/production-fields";
import { DomainError } from "@/lib/content/workflow";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import { applyResearchTeardownToPayload, ResearchTeardownSchema } from "@/lib/research/teardown";

/** Structured creative writes share one validation, permission, and audit path. */
export const UpdateFormatPayloadSchema = z.object({
  contentItemId: z.string().uuid(),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]) satisfies z.ZodType<ContentFormat>,
  formatPayload: z.record(z.string(), z.unknown()),
});
export type UpdateFormatPayloadInput = z.infer<typeof UpdateFormatPayloadSchema>;

export async function updateFormatPayload(actor: Actor, input: UpdateFormatPayloadInput) {
  const parsed = UpdateFormatPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("validation_failed", "The creative details are invalid.");
  }
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      format: contentItems.format,
      designerId: contentItems.designerId,
      formatPayload: contentItems.formatPayload,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new DomainError("not_found", "Content item not found");

  const isManagerOrPlanner = await hasWorkspaceRole(actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
  ]);
  const isAssignedDesigner =
    item.designerId === actor.id && (await hasWorkspaceRole(actor, item.workspaceId, ["designer"]));
  await requirePolicy(Promise.resolve(isManagerOrPlanner || isAssignedDesigner), "update_content");

  if (item.status === "cancelled") {
    throw new DomainError(
      "invalid_transition",
      `This idea is in ${item.status.replaceAll("_", " ")} and can no longer be edited.`,
    );
  }

  // The persisted format is authoritative, even when the form posts a stale format.
  let submitted: Record<string, unknown>;
  let current: Record<string, unknown>;
  try {
    submitted = parseFormatPayload(item.format, parsed.data.formatPayload) as Record<
      string,
      unknown
    >;
    current = parseFormatPayload(item.format, item.formatPayload) as Record<string, unknown>;
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new DomainError("validation_failed", "The creative details do not match this format.");
  }
  const next = isAssignedDesigner ? { ...current } : submitted;
  if (isAssignedDesigner) {
    for (const key of designerEditableFieldsFor(item.format)) {
      if (Object.prototype.hasOwnProperty.call(submitted, key)) next[key] = submitted[key];
      else delete next[key];
    }
  }
  let stored: Record<string, unknown>;
  try {
    stored = parseFormatPayload(item.format, next) as Record<string, unknown>;
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new DomainError("validation_failed", "The creative details do not match this format.");
  }
  const beforeKeys = Object.keys(current).sort();

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ formatPayload: stored, updatedAt: new Date() })
      .where(eq(contentItems.id, parsed.data.contentItemId));

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      actorId: actor.id,
      kind: "content_updated",
      summary: `Updated creative details: ${item.format}`,
      beforeData: { formatPayloadKeys: beforeKeys },
      afterData: { formatPayloadKeys: Object.keys(stored as object).sort() },
    });
  });
}

export const ApplyResearchTeardownSchema = z.object({
  workspaceId: z.string().uuid(),
  contentItemId: z.string().uuid(),
  researchTeardownId: z.string().uuid(),
});
export type ApplyResearchTeardownInput = z.infer<typeof ApplyResearchTeardownSchema>;

/** Apply only blank, schema-supported creative fields from a linked teardown. */
export async function applyResearchTeardownToFormatPayload(
  actor: Actor,
  input: ApplyResearchTeardownInput,
) {
  const parsed = ApplyResearchTeardownSchema.parse(input);
  const [source] = await db
    .select({
      contentItemId: contentItems.id,
      format: contentItems.format,
      formatPayload: contentItems.formatPayload,
      result: researchTeardowns.result,
    })
    .from(contentResearchTeardownLinks)
    .innerJoin(contentItems, eq(contentItems.id, contentResearchTeardownLinks.contentItemId))
    .innerJoin(
      researchTeardowns,
      eq(researchTeardowns.id, contentResearchTeardownLinks.researchTeardownId),
    )
    .where(
      and(
        eq(contentResearchTeardownLinks.workspaceId, parsed.workspaceId),
        eq(contentResearchTeardownLinks.contentItemId, parsed.contentItemId),
        eq(contentResearchTeardownLinks.researchTeardownId, parsed.researchTeardownId),
      ),
    )
    .limit(1);
  if (!source) {
    throw new DomainError("not_found", "Research teardown is not linked to this content item");
  }

  const teardown = ResearchTeardownSchema.safeParse(source.result);
  if (!teardown.success) {
    throw new DomainError("validation_failed", "The saved research teardown is invalid.");
  }
  let applied: ReturnType<typeof applyResearchTeardownToPayload>;
  try {
    applied = applyResearchTeardownToPayload({
      format: source.format as ContentFormat,
      current: source.formatPayload,
      teardown: teardown.data,
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new DomainError("validation_failed", "The research fields do not match this format.");
  }
  if (applied.fields.length === 0) return applied.fields;

  await updateFormatPayload(actor, {
    contentItemId: source.contentItemId,
    format: source.format as ContentFormat,
    formatPayload: applied.payload,
  });
  return applied.fields;
}
