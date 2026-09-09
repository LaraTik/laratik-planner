import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { planningInstructionPackRevisions, planningInstructionPacks } from "@/lib/db/schema";
import { hasWorkspaceRole, isAgencyAdmin, requirePolicy, type Actor } from "@/lib/auth/policy";
import {
  PlanningInstructionPackManifestSchema,
  PlanningInstructionPackStatusSchema,
  type PlanningInstructionPackManifest,
} from "./planning-contract";

const InstructionPackInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  sourceMarkdown: z.string().trim().min(1).max(100_000),
  manifest: PlanningInstructionPackManifestSchema,
});

export type InstructionPackInput = z.infer<typeof InstructionPackInputSchema>;

async function canEditPack(actor: Actor, agencyId: string, workspaceId: string | null) {
  return workspaceId
    ? hasWorkspaceRole(actor, workspaceId, ["workspace_manager"])
    : isAgencyAdmin(actor, agencyId);
}

export async function listInstructionPacks(agencyId: string, workspaceId?: string) {
  return db
    .select()
    .from(planningInstructionPacks)
    .where(
      and(
        eq(planningInstructionPacks.agencyId, agencyId),
        workspaceId
          ? eq(planningInstructionPacks.workspaceId, workspaceId)
          : isNull(planningInstructionPacks.workspaceId),
      ),
    )
    .orderBy(desc(planningInstructionPacks.updatedAt));
}

export async function saveInstructionPackDraft(
  actor: Actor,
  agencyId: string,
  workspaceId: string | null,
  input: InstructionPackInput,
) {
  const parsed = InstructionPackInputSchema.parse(input);
  await requirePolicy(canEditPack(actor, agencyId, workspaceId), "save_planning_instruction_pack");
  if (parsed.id) {
    const [existing] = await db
      .select({
        id: planningInstructionPacks.id,
        agencyId: planningInstructionPacks.agencyId,
        workspaceId: planningInstructionPacks.workspaceId,
        revision: planningInstructionPacks.revision,
      })
      .from(planningInstructionPacks)
      .where(
        and(
          eq(planningInstructionPacks.id, parsed.id),
          eq(planningInstructionPacks.agencyId, agencyId),
        ),
      )
      .limit(1);
    if (!existing || existing.workspaceId !== workspaceId)
      throw new Error("Instruction pack not found.");
    const revision = existing.revision + 1;
    await db.transaction(async (tx) => {
      await tx
        .update(planningInstructionPacks)
        .set({
          name: parsed.name,
          sourceMarkdown: parsed.sourceMarkdown,
          manifest: parsed.manifest,
          status: "draft",
          revision,
          publishedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(planningInstructionPacks.id, parsed.id!));
      await tx.insert(planningInstructionPackRevisions).values({
        packId: parsed.id!,
        revision,
        sourceMarkdown: parsed.sourceMarkdown,
        manifest: parsed.manifest,
        createdBy: actor.id,
      });
    });
    return { id: parsed.id, revision };
  }
  const [pack] = await db
    .insert(planningInstructionPacks)
    .values({
      agencyId,
      ...(workspaceId ? { workspaceId } : {}),
      name: parsed.name,
      sourceMarkdown: parsed.sourceMarkdown,
      manifest: parsed.manifest,
      createdBy: actor.id,
    })
    .returning({ id: planningInstructionPacks.id, revision: planningInstructionPacks.revision });
  if (!pack) throw new Error("The instruction pack could not be saved.");
  await db.insert(planningInstructionPackRevisions).values({
    packId: pack.id,
    revision: pack.revision,
    sourceMarkdown: parsed.sourceMarkdown,
    manifest: parsed.manifest,
    createdBy: actor.id,
  });
  return pack;
}

export async function publishInstructionPack(actor: Actor, packId: string) {
  const [pack] = await db
    .select({
      id: planningInstructionPacks.id,
      agencyId: planningInstructionPacks.agencyId,
      workspaceId: planningInstructionPacks.workspaceId,
      manifest: planningInstructionPacks.manifest,
    })
    .from(planningInstructionPacks)
    .where(eq(planningInstructionPacks.id, packId))
    .limit(1);
  if (!pack) throw new Error("Instruction pack not found.");
  await requirePolicy(
    canEditPack(actor, pack.agencyId, pack.workspaceId),
    "publish_planning_instruction_pack",
  );
  PlanningInstructionPackManifestSchema.parse(pack.manifest);
  await db
    .update(planningInstructionPacks)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(planningInstructionPacks.id, packId));
  return { id: packId, status: PlanningInstructionPackStatusSchema.parse("published") };
}

export function exportInstructionPack(input: {
  name: string;
  sourceMarkdown: string;
  manifest: PlanningInstructionPackManifest;
}) {
  const parsed = InstructionPackInputSchema.parse(input);
  return `${parsed.sourceMarkdown}\n\n<!-- structured-manifest -->\n${JSON.stringify(parsed.manifest, null, 2)}\n`;
}
