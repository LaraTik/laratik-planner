import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, contentFormatEnum, contentTemplates } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";

/**
 * Planning library — content template service (FEAT-06).
 *
 * §14 `createTemplate` is the third library-mutation command. A
 * template bundles a format + a brief skeleton + a default channel
 * set; planners use them as seeds when batch-creating ideas.
 *
 * The `content_templates` schema has
 * `relative_schedule_rule jsonb` (FEAT-13, P1 backlog) and
 * `format_payload jsonb`. The shape of both is intentionally
 * unopinionated at the DB layer; v1 only round-trips whatever
 * the form posts, leaving future recurrence / payload-versioning
 * work to land incrementally.
 */

const FORMAT_VALUES = contentFormatEnum.enumValues;

export const CreateTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  format: z.enum(FORMAT_VALUES),
  briefTemplate: z.string().trim().max(8000).optional(),
  contentPillarId: z.string().uuid().optional(),
  defaultChannelIds: z.array(z.string().uuid()).optional().default([]),
  defaultDesignerId: z.string().uuid().optional(),
  defaultReviewerId: z.string().uuid().optional(),
  formatPayload: z.record(z.unknown()).optional(),
  relativeScheduleRule: z.record(z.unknown()).optional(),
});
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export async function createTemplate(
  actor: Actor,
  workspaceId: string,
  input: CreateTemplateInput,
): Promise<{ id: string }> {
  const parsed = CreateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "create_template",
  );
  try {
    const [created] = await db
      .insert(contentTemplates)
      .values({
        workspaceId,
        name: parsed.data.name,
        format: parsed.data.format,
        ...(parsed.data.briefTemplate ? { briefTemplate: parsed.data.briefTemplate } : {}),
        ...(parsed.data.contentPillarId ? { contentPillarId: parsed.data.contentPillarId } : {}),
        defaultChannelIds: parsed.data.defaultChannelIds,
        ...(parsed.data.defaultDesignerId
          ? { defaultDesignerId: parsed.data.defaultDesignerId }
          : {}),
        ...(parsed.data.defaultReviewerId
          ? { defaultReviewerId: parsed.data.defaultReviewerId }
          : {}),
        ...(parsed.data.formatPayload ? { formatPayload: parsed.data.formatPayload } : {}),
        ...(parsed.data.relativeScheduleRule
          ? { relativeScheduleRule: parsed.data.relativeScheduleRule }
          : {}),
        createdBy: actor.id,
      })
      .returning({ id: contentTemplates.id });
    if (!created) throw new Error("Failed to create template");
    await db.insert(activityEvents).values({
      workspaceId,
      actorId: actor.id,
      kind: "create",
      summary: `Created template "${parsed.data.name}"`,
      afterData: { templateId: created.id, format: parsed.data.format },
    });
    revalidatePath(`/app/w/`);
    return { id: created.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error("A template with that name already exists in this workspace");
    }
    throw err;
  }
}

export async function archiveTemplate(
  actor: Actor,
  workspaceId: string,
  templateId: string,
): Promise<void> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "archive_template",
  );
  const [existing] = await db
    .select({
      id: contentTemplates.id,
      name: contentTemplates.name,
      archivedAt: contentTemplates.archivedAt,
    })
    .from(contentTemplates)
    .where(and(eq(contentTemplates.id, templateId), eq(contentTemplates.workspaceId, workspaceId)))
    .limit(1);
  if (!existing) throw new Error("Template not found");
  if (existing.archivedAt) return; // idempotent
  await db
    .update(contentTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(contentTemplates.id, templateId));
  await db.insert(activityEvents).values({
    workspaceId,
    actorId: actor.id,
    kind: "update",
    summary: `Archived template "${existing.name}"`,
    afterData: { templateId, archived: true },
  });
  revalidatePath(`/app/w/`);
}

export async function listActiveTemplates(workspaceId: string) {
  return db
    .select()
    .from(contentTemplates)
    .where(and(eq(contentTemplates.workspaceId, workspaceId), isNull(contentTemplates.archivedAt)));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
