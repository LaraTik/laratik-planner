import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, contentPillars } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";

/**
 * Planning library — content pillar service (FEAT-06).
 *
 * `createPillar` and `archivePillar` are the §14 contract names. The
 * `content_pillars` table is the workspace-scoped taxonomy a planner
 * uses to group ideas (e.g. "Product", "Behind the scenes"). The
 * schema already enforces case-insensitive uniqueness on the active
 * name per workspace.
 */

export const CreatePillarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/, "color must be a #rrggbb hex code")
    .optional(),
  description: z.string().trim().max(2000).optional(),
});
export type CreatePillarInput = z.infer<typeof CreatePillarSchema>;

export async function createPillar(
  actor: Actor,
  workspaceId: string,
  input: CreatePillarInput,
): Promise<{ id: string }> {
  const parsed = CreatePillarSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "create_pillar",
  );
  try {
    const [created] = await db
      .insert(contentPillars)
      .values({
        workspaceId,
        name: parsed.data.name,
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        createdBy: actor.id,
      })
      .returning({ id: contentPillars.id });
    if (!created) throw new Error("Failed to create pillar");
    await db.insert(activityEvents).values({
      workspaceId,
      actorId: actor.id,
      kind: "create",
      summary: `Created pillar "${parsed.data.name}"`,
      afterData: { pillarId: created.id },
    });
    revalidatePath(`/app/w/`);
    return { id: created.id };
  } catch (err) {
    // The partial-unique index on lower(name) WHERE archived_at IS NULL
    // surfaces a 23505 to the caller; translate to a friendlier message.
    if (isUniqueViolation(err)) {
      throw new Error("A pillar with that name already exists in this workspace");
    }
    throw err;
  }
}

export async function archivePillar(
  actor: Actor,
  workspaceId: string,
  pillarId: string,
): Promise<void> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "archive_pillar",
  );
  const [existing] = await db
    .select({
      id: contentPillars.id,
      name: contentPillars.name,
      archivedAt: contentPillars.archivedAt,
    })
    .from(contentPillars)
    .where(and(eq(contentPillars.id, pillarId), eq(contentPillars.workspaceId, workspaceId)))
    .limit(1);
  if (!existing) throw new Error("Pillar not found");
  if (existing.archivedAt) return; // idempotent
  await db
    .update(contentPillars)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(contentPillars.id, pillarId));
  await db.insert(activityEvents).values({
    workspaceId,
    actorId: actor.id,
    kind: "update",
    summary: `Archived pillar "${existing.name}"`,
    afterData: { pillarId, archived: true },
  });
  revalidatePath(`/app/w/`);
}

export async function listActivePillars(workspaceId: string) {
  return db
    .select()
    .from(contentPillars)
    .where(and(eq(contentPillars.workspaceId, workspaceId), isNull(contentPillars.archivedAt)));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
