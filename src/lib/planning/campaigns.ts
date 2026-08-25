import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, campaigns } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";

/**
 * Planning library — campaign service (FEAT-06).
 *
 * STUDIOFLOW_MASTER_PROMPT.md §14 lists `createCampaign` and
 * `archiveCampaign` as required commands. The campaigns table
 * already existed (Goal 11 wiring in `planning.ts`) and the
 * `/library` page read rows, but no service module owned the
 * writes. This file is that service.
 *
 * Authz: `workspace_manager` or `content_planner` — the same gate
 * the brand-kit service uses for "library" mutations. Agency admins
 * pass the check via the policy helper's admin shortcut
 * (`src/lib/auth/policy.ts`).
 */

export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  objective: z.string().trim().max(2000).optional(),
  description: z.string().trim().max(2000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  ownerId: z.string().uuid().optional(),
  coverColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/, "coverColor must be a #rrggbb hex code")
    .optional(),
  status: z.enum(["draft", "active", "completed"]).optional().default("draft"),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export async function createCampaign(
  actor: Actor,
  workspaceId: string,
  input: CreateCampaignInput,
): Promise<{ id: string }> {
  const parsed = CreateCampaignSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "create_campaign",
  );
  const [created] = await db
    .insert(campaigns)
    .values({
      workspaceId,
      name: parsed.data.name,
      ...(parsed.data.objective ? { objective: parsed.data.objective } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.startDate
        ? { startDate: parsed.data.startDate.toISOString().slice(0, 10) }
        : {}),
      ...(parsed.data.endDate ? { endDate: parsed.data.endDate.toISOString().slice(0, 10) } : {}),
      ...(parsed.data.ownerId ? { ownerId: parsed.data.ownerId } : {}),
      ...(parsed.data.coverColor ? { coverColor: parsed.data.coverColor } : {}),
      status: parsed.data.status,
      createdBy: actor.id,
    })
    .returning({ id: campaigns.id });
  if (!created) throw new Error("Failed to create campaign");
  await db.insert(activityEvents).values({
    workspaceId,
    actorId: actor.id,
    kind: "create",
    summary: `Created campaign "${parsed.data.name}"`,
    afterData: { campaignId: created.id, status: parsed.data.status },
  });
  revalidatePath(`/app/w/`);
  return { id: created.id };
}

export async function archiveCampaign(
  actor: Actor,
  workspaceId: string,
  campaignId: string,
): Promise<void> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "archive_campaign",
  );
  const [existing] = await db
    .select({ id: campaigns.id, name: campaigns.name, archivedAt: campaigns.archivedAt })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  if (!existing) throw new Error("Campaign not found");
  if (existing.archivedAt) return; // idempotent
  await db
    .update(campaigns)
    .set({
      status: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));
  await db.insert(activityEvents).values({
    workspaceId,
    actorId: actor.id,
    kind: "update",
    summary: `Archived campaign "${existing.name}"`,
    afterData: { campaignId, status: "archived" },
  });
  revalidatePath(`/app/w/`);
}

/**
 * Read helpers — used by the library page and any consumer that
 * needs the active (non-archived) campaign set. Centralised here
 * so the page is no longer reaching into the schema directly.
 */
export async function listActiveCampaigns(workspaceId: string) {
  return db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.workspaceId, workspaceId), isNull(campaigns.archivedAt)));
}
