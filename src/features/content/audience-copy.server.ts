import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { DomainError } from "@/lib/content/workflow";
import {
  AUDIENCE_COPY_KEYS,
  audienceCopyFromPayload,
  mergeAudienceCopy,
} from "@/lib/content/audience-copy";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import { recordMaterialityEvent } from "@/lib/publishing/materiality";

/** Canonical audience copy updates remain material edits. */
export const UpdateAudienceCopySchema = z.object({
  contentItemId: z.string().guid(),
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
export type UpdateAudienceCopyInput = z.infer<typeof UpdateAudienceCopySchema>;

export async function updateAudienceCopy(actor: Actor, input: UpdateAudienceCopyInput) {
  const parsed = UpdateAudienceCopySchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("validation_failed", "The audience copy is invalid.");
  }
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      format: contentItems.format,
      formatPayload: contentItems.formatPayload,
      revision: contentItems.revision,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new DomainError("not_found", "Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "update_audience_copy",
  );
  if (item.status === "cancelled") {
    throw new DomainError(
      "invalid_transition",
      "This idea is cancelled and can no longer be edited.",
    );
  }

  let current: Record<string, unknown>;
  let submitted: Record<string, unknown>;
  try {
    current = parseFormatPayload(item.format, item.formatPayload) as Record<string, unknown>;
    submitted = parseFormatPayload(item.format, parsed.data.formatPayload) as Record<
      string,
      unknown
    >;
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new DomainError("validation_failed", "The audience copy does not match this format.");
  }
  const currentCreative = { ...current };
  const submittedCreative = { ...submitted };
  for (const key of AUDIENCE_COPY_KEYS) {
    delete currentCreative[key];
    delete submittedCreative[key];
  }
  delete currentCreative.translations;
  delete submittedCreative.translations;
  if (JSON.stringify(currentCreative) !== JSON.stringify(submittedCreative)) {
    throw new DomainError(
      "validation_failed",
      "Only audience-facing copy can be changed from the Copy tab.",
    );
  }
  let next: Record<string, unknown>;
  try {
    next = mergeAudienceCopy(item.format, current, audienceCopyFromPayload(submitted));
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new DomainError("validation_failed", "The audience copy does not match this format.");
  }
  const changedKeys: string[] = AUDIENCE_COPY_KEYS.filter(
    (key) => JSON.stringify(current[key] ?? null) !== JSON.stringify(next[key] ?? null),
  );
  if (JSON.stringify(current.translations ?? null) !== JSON.stringify(next.translations ?? null)) {
    changedKeys.push("translations");
  }
  if (changedKeys.length === 0) return { revision: item.revision, changedKeys: [] as string[] };

  await db
    .update(contentItems)
    .set({ formatPayload: next, updatedAt: new Date() })
    .where(eq(contentItems.id, item.id));
  const materiality = await recordMaterialityEvent({
    actor,
    contentItemId: item.id,
    resource: "audience_copy",
    beforeValue: { changedKeys },
    afterValue: { changedKeys },
    reasonCode: "audience_copy.update",
  });
  return { revision: materiality.revision, changedKeys };
}

/**
 * Compatibility path for older callers; all writes flow through the canonical
 * material audience-copy update and preserve the legacy edit scope.
 */
export const PatchAudienceCopySchema = z.object({
  contentItemId: z.string().guid(),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
  firstComment: z.string().max(2200).optional(),
});
export type PatchAudienceCopyInput = z.infer<typeof PatchAudienceCopySchema>;

export async function patchAudienceCopy(actor: Actor, input: PatchAudienceCopyInput) {
  const parsed = PatchAudienceCopySchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("validation_failed", "The audience-copy patch is invalid.");
  }
  if (
    parsed.data.caption === undefined &&
    parsed.data.hashtags === undefined &&
    parsed.data.firstComment === undefined
  ) {
    throw new DomainError(
      "validation_failed",
      "At least one audience-copy field must be provided.",
    );
  }

  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      format: contentItems.format,
      formatPayload: contentItems.formatPayload,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new DomainError("not_found", "Content item not found");

  const format = item.format as ContentFormat | undefined;
  if (!format) throw new DomainError("validation_failed", "Content format is missing");
  let current: Record<string, unknown>;
  try {
    current = parseFormatPayload(format, item.formatPayload) as Record<string, unknown>;
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new DomainError("validation_failed", "The current audience copy is invalid.");
  }
  const patch: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) patch.caption = parsed.data.caption;
  if (parsed.data.hashtags !== undefined) patch.hashtags = parsed.data.hashtags;
  if (parsed.data.firstComment !== undefined) patch.firstComment = parsed.data.firstComment;
  return updateAudienceCopy(actor, {
    contentItemId: parsed.data.contentItemId,
    format,
    formatPayload: mergeAudienceCopy(format, current, patch),
  });
}
