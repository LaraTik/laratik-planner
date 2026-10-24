import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { hasWorkspaceRole, isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  workspaceAssistantSkillRevisions,
  workspaceAssistantSkills,
  workspaces,
} from "@/lib/db/schema";
import type { WorkspaceAssistantSkill } from "./skills";

const words = (max: number, length: number) =>
  z.array(z.string().trim().min(1).max(length)).max(max);

export const WorkspaceAssistantSkillDraftSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(80),
    category: z.enum(["strategy", "planning", "creation", "quality"]),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(500),
    tags: words(12, 40),
    triggers: words(20, 100),
    examples: words(10, 300),
    requiredInputs: words(20, 160),
    optionalInputs: words(20, 160),
    supportedFormats: words(20, 120),
    requiredKnowledgeSources: words(20, 200),
    instructions: z.string().trim().min(1).max(12_000),
    workflow: words(20, 500),
    outputContract: words(20, 200),
    qualityChecklist: words(24, 300),
    relatedSkills: words(20, 80),
  })
  .strict();

export type WorkspaceAssistantSkillDraft = z.infer<typeof WorkspaceAssistantSkillDraftSchema>;

function snapshot(draft: WorkspaceAssistantSkillDraft) {
  return WorkspaceAssistantSkillDraftSchema.parse(draft);
}

async function requireAgencyAdmin(actor: Actor, agencyId: string) {
  if (!(await isAgencyAdmin(actor, agencyId)))
    throw new Error("workspace_assistant_skill_forbidden");
}

export async function listAgencyWorkspaceAssistantSkills(actor: Actor, agencyId: string) {
  await requireAgencyAdmin(actor, agencyId);
  const skills = await db
    .select()
    .from(workspaceAssistantSkills)
    .where(eq(workspaceAssistantSkills.agencyId, agencyId))
    .orderBy(desc(workspaceAssistantSkills.updatedAt))
    .limit(200);
  if (skills.length === 0) return [];
  const revisions = await db
    .select()
    .from(workspaceAssistantSkillRevisions)
    .where(
      and(
        eq(workspaceAssistantSkillRevisions.state, "pending_review"),
        inArray(
          workspaceAssistantSkillRevisions.skillId,
          skills.map((skill) => skill.id),
        ),
      ),
    )
    .orderBy(desc(workspaceAssistantSkillRevisions.createdAt))
    .limit(200);
  const pendingBySkill = new Map(revisions.map((revision) => [revision.skillId, revision]));
  const currentRevisions = await db
    .select()
    .from(workspaceAssistantSkillRevisions)
    .where(
      inArray(
        workspaceAssistantSkillRevisions.skillId,
        skills.map((skill) => skill.id),
      ),
    )
    .orderBy(desc(workspaceAssistantSkillRevisions.revision))
    .limit(400);
  return skills.map((skill) => ({
    skill,
    pendingReview: pendingBySkill.get(skill.id) ?? null,
    revisions: currentRevisions.filter((revision) => revision.skillId === skill.id),
  }));
}

export async function listActiveWorkspaceAssistantSkills(
  actor: Actor,
  workspaceId: string,
): Promise<WorkspaceAssistantSkill[]> {
  if (!(await hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]))) {
    return [];
  }
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return [];
  const rows = await db
    .select({ skill: workspaceAssistantSkills, revision: workspaceAssistantSkillRevisions })
    .from(workspaceAssistantSkills)
    .innerJoin(
      workspaceAssistantSkillRevisions,
      and(
        eq(workspaceAssistantSkillRevisions.skillId, workspaceAssistantSkills.id),
        eq(workspaceAssistantSkillRevisions.revision, workspaceAssistantSkills.activeRevision),
        eq(workspaceAssistantSkillRevisions.state, "approved"),
      ),
    )
    .where(
      and(
        eq(workspaceAssistantSkills.agencyId, workspace.agencyId),
        isNotNull(workspaceAssistantSkills.activeRevision),
        isNull(workspaceAssistantSkills.archivedAt),
      ),
    )
    .limit(100);
  return rows.flatMap(({ skill, revision }) => {
    const parsed = WorkspaceAssistantSkillDraftSchema.safeParse(revision.snapshot);
    if (!parsed.success) return [];
    return [
      {
        ...parsed.data,
        id: `agency-${skill.id}`,
        version: String(revision.revision),
        authorizedTools: [],
        evaluationCases: [],
        provenance: "agency-admin" as const,
        reviewedAt: revision.reviewedAt?.toISOString().slice(0, 10) ?? "",
      },
    ];
  });
}

export async function createAgencyWorkspaceAssistantSkill(
  actor: Actor,
  agencyId: string,
  draft: WorkspaceAssistantSkillDraft,
) {
  const parsed = snapshot(draft);
  await requireAgencyAdmin(actor, agencyId);
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .insert(workspaceAssistantSkills)
      .values({ agencyId, slug: parsed.slug, createdBy: actor.id })
      .returning({ id: workspaceAssistantSkills.id, slug: workspaceAssistantSkills.slug });
    if (!skill) throw new Error("workspace_assistant_skill_create_failed");
    await tx.insert(workspaceAssistantSkillRevisions).values({
      skillId: skill.id,
      revision: 1,
      snapshot: parsed,
      createdBy: actor.id,
    });
    return skill;
  });
}

export async function saveAgencyWorkspaceAssistantSkillDraft(
  actor: Actor,
  agencyId: string,
  skillId: string,
  draft: WorkspaceAssistantSkillDraft,
) {
  const parsed = snapshot(draft);
  await requireAgencyAdmin(actor, agencyId);
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .select()
      .from(workspaceAssistantSkills)
      .where(
        and(
          eq(workspaceAssistantSkills.id, skillId),
          eq(workspaceAssistantSkills.agencyId, agencyId),
        ),
      )
      .for("update")
      .limit(1);
    if (!skill || skill.status === "archived")
      throw new Error("workspace_assistant_skill_not_found");
    if (skill.slug !== parsed.slug) {
      const [slugConflict] = await tx
        .select({ id: workspaceAssistantSkills.id })
        .from(workspaceAssistantSkills)
        .where(
          and(
            eq(workspaceAssistantSkills.agencyId, agencyId),
            eq(workspaceAssistantSkills.slug, parsed.slug),
          ),
        )
        .limit(1);
      if (slugConflict) throw new Error("workspace_assistant_skill_slug_conflict");
    }
    if (skill.status === "pending_review")
      throw new Error("workspace_assistant_skill_review_pending");
    const revision = skill.latestRevision + 1;
    await tx.insert(workspaceAssistantSkillRevisions).values({
      skillId: skill.id,
      revision,
      snapshot: parsed,
      createdBy: actor.id,
    });
    await tx
      .update(workspaceAssistantSkills)
      .set({
        slug: parsed.slug,
        latestRevision: revision,
        status: skill.activeRevision ? "active" : "draft",
        updatedAt: new Date(),
      })
      .where(eq(workspaceAssistantSkills.id, skill.id));
    return { id: skill.id, revision };
  });
}

export async function submitAgencyWorkspaceAssistantSkillForReview(
  actor: Actor,
  agencyId: string,
  skillId: string,
  revision: number,
) {
  await requireAgencyAdmin(actor, agencyId);
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .select()
      .from(workspaceAssistantSkills)
      .where(
        and(
          eq(workspaceAssistantSkills.id, skillId),
          eq(workspaceAssistantSkills.agencyId, agencyId),
        ),
      )
      .for("update")
      .limit(1);
    if (!skill || skill.latestRevision !== revision || skill.status === "archived") {
      throw new Error("workspace_assistant_skill_revision_not_found");
    }
    const [result] = await tx
      .update(workspaceAssistantSkillRevisions)
      .set({ state: "pending_review", updatedAt: new Date() })
      .where(
        and(
          eq(workspaceAssistantSkillRevisions.skillId, skillId),
          eq(workspaceAssistantSkillRevisions.revision, revision),
          eq(workspaceAssistantSkillRevisions.state, "draft"),
        ),
      )
      .returning({ revision: workspaceAssistantSkillRevisions.revision });
    if (!result) throw new Error("workspace_assistant_skill_revision_not_draft");
    await tx
      .update(workspaceAssistantSkills)
      .set({ status: "pending_review", updatedAt: new Date() })
      .where(eq(workspaceAssistantSkills.id, skillId));
    return { id: skillId, revision, status: "pending_review" as const };
  });
}

export async function reviewAgencyWorkspaceAssistantSkill(
  actor: Actor,
  agencyId: string,
  skillId: string,
  revision: number,
  decision: "approve" | "reject",
  reviewNote: string,
) {
  await requireAgencyAdmin(actor, agencyId);
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .select()
      .from(workspaceAssistantSkills)
      .where(
        and(
          eq(workspaceAssistantSkills.id, skillId),
          eq(workspaceAssistantSkills.agencyId, agencyId),
        ),
      )
      .for("update")
      .limit(1);
    const [pending] = await tx
      .select()
      .from(workspaceAssistantSkillRevisions)
      .where(
        and(
          eq(workspaceAssistantSkillRevisions.skillId, skillId),
          eq(workspaceAssistantSkillRevisions.revision, revision),
          eq(workspaceAssistantSkillRevisions.state, "pending_review"),
        ),
      )
      .for("update")
      .limit(1);
    if (!skill || !pending) throw new Error("workspace_assistant_skill_review_not_found");
    if (pending.createdBy === actor.id)
      throw new Error("workspace_assistant_skill_self_review_denied");
    const reviewedAt = new Date();
    await tx
      .update(workspaceAssistantSkillRevisions)
      .set({
        state: decision === "approve" ? "approved" : "rejected",
        reviewedBy: actor.id,
        reviewedAt,
        reviewNote: reviewNote.trim() || null,
        updatedAt: reviewedAt,
      })
      .where(eq(workspaceAssistantSkillRevisions.id, pending.id));
    const approvedSnapshot =
      decision === "approve" ? WorkspaceAssistantSkillDraftSchema.parse(pending.snapshot) : null;
    await tx
      .update(workspaceAssistantSkills)
      .set({
        ...(decision === "approve"
          ? { slug: approvedSnapshot!.slug, activeRevision: revision, status: "active" }
          : { status: skill.activeRevision ? "active" : "draft" }),
        updatedAt: reviewedAt,
      })
      .where(eq(workspaceAssistantSkills.id, skillId));
    return { id: skillId, revision, status: decision === "approve" ? "active" : "rejected" };
  });
}

export async function requestAgencyWorkspaceAssistantSkillRollback(
  actor: Actor,
  agencyId: string,
  skillId: string,
  targetRevision: number,
) {
  await requireAgencyAdmin(actor, agencyId);
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .select()
      .from(workspaceAssistantSkills)
      .where(
        and(
          eq(workspaceAssistantSkills.id, skillId),
          eq(workspaceAssistantSkills.agencyId, agencyId),
        ),
      )
      .for("update")
      .limit(1);
    const [target] = await tx
      .select()
      .from(workspaceAssistantSkillRevisions)
      .where(
        and(
          eq(workspaceAssistantSkillRevisions.skillId, skillId),
          eq(workspaceAssistantSkillRevisions.revision, targetRevision),
          eq(workspaceAssistantSkillRevisions.state, "approved"),
        ),
      )
      .limit(1);
    if (!skill || skill.status === "archived" || !target) {
      throw new Error("workspace_assistant_skill_rollback_target_invalid");
    }
    const revision = skill.latestRevision + 1;
    await tx.insert(workspaceAssistantSkillRevisions).values({
      skillId,
      revision,
      snapshot: WorkspaceAssistantSkillDraftSchema.parse(target.snapshot),
      createdBy: actor.id,
      rollbackOfRevision: targetRevision,
      reviewNote: `Rollback requested to approved revision ${targetRevision}`,
    });
    await tx
      .update(workspaceAssistantSkills)
      .set({
        latestRevision: revision,
        status: skill.activeRevision ? "active" : "draft",
        updatedAt: new Date(),
      })
      .where(eq(workspaceAssistantSkills.id, skillId));
    return { id: skillId, revision, targetRevision, status: "draft" as const };
  });
}

export async function archiveAgencyWorkspaceAssistantSkill(
  actor: Actor,
  agencyId: string,
  skillId: string,
) {
  await requireAgencyAdmin(actor, agencyId);
  const archivedAt = new Date();
  const [skill] = await db
    .update(workspaceAssistantSkills)
    .set({ status: "archived", archivedAt, updatedAt: archivedAt })
    .where(
      and(
        eq(workspaceAssistantSkills.id, skillId),
        eq(workspaceAssistantSkills.agencyId, agencyId),
      ),
    )
    .returning({ id: workspaceAssistantSkills.id });
  if (!skill) throw new Error("workspace_assistant_skill_not_found");
  return { id: skill.id, status: "archived" as const };
}
