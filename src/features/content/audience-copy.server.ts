import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import {
  AUDIENCE_COPY_KEYS,
  audienceCopyFromPayload,
  mergeAudienceCopy,
} from "@/lib/content/audience-copy";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import { recordMaterialityEvent } from "@/lib/publishing/materiality";

/** Canonical audience copy updates remain material edits. */
export const UpdateAudienceCopySchema = z.object({
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
export type UpdateAudienceCopyInput = z.infer<typeof UpdateAudienceCopySchema>;

export async function updateAudienceCopy(actor: Actor, input: UpdateAudienceCopyInput) {
  const parsed = UpdateAudienceCopySchema.parse(input);
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
    .where(eq(contentItems.id, parsed.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "update_audience_copy",
  );
  if (item.status === "cancelled")
    throw new Error("This idea is cancelled and can no longer be edited.");

  const current = parseFormatPayload(item.format, item.formatPayload) as Record<string, unknown>;
  const submitted = parseFormatPayload(item.format, parsed.formatPayload) as Record<
    string,
    unknown
  >;
  const currentCreative = { ...current };
  const submittedCreative = { ...submitted };
  for (const key of AUDIENCE_COPY_KEYS) {
    delete currentCreative[key];
    delete submittedCreative[key];
  }
  delete currentCreative.translations;
  delete submittedCreative.translations;
  if (JSON.stringify(currentCreative) !== JSON.stringify(submittedCreative)) {
    throw new Error("Only audience-facing copy can be changed from the Copy tab.");
  }
  const next = mergeAudienceCopy(item.format, current, audienceCopyFromPayload(submitted));
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
  contentItemId: z.string().uuid(),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
  firstComment: z.string().max(2200).optional(),
});
export type PatchAudienceCopyInput = z.infer<typeof PatchAudienceCopySchema>;

export async function patchAudienceCopy(actor: Actor, input: PatchAudienceCopyInput) {
  const parsed = PatchAudienceCopySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  if (
    parsed.data.caption === undefined &&
    parsed.data.hashtags === undefined &&
    parsed.data.firstComment === undefined
  ) {
    throw new Error("At least one of caption, hashtags, or firstComment must be provided.");
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
  if (!item) throw new Error("Content item not found");

  const format = item.format as ContentFormat | undefined;
  if (!format) throw new Error("Content format is missing");
  const current = parseFormatPayload(format, item.formatPayload) as Record<string, unknown>;
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
