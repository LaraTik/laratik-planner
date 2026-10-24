"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import {
  archiveAgencyWorkspaceAssistantSkill,
  createAgencyWorkspaceAssistantSkill,
  requestAgencyWorkspaceAssistantSkillRollback,
  reviewAgencyWorkspaceAssistantSkill,
  saveAgencyWorkspaceAssistantSkillDraft,
  submitAgencyWorkspaceAssistantSkillForReview,
  WorkspaceAssistantSkillDraftSchema,
} from "@/features/workspace-assistant/skill-governance.server";

export type SkillActionState = { errorCode?: string; savedRevision?: number; done?: boolean };

async function requireSkillAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const actor = await currentActor();
  if (!actor) throw new Error("unauthorized");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context || !(await isAgencyAdmin(actor, context.agencyId))) throw new Error("unauthorized");
  return { actor, agencyId: context.agencyId };
}

function readSkillDraft(formData: FormData) {
  const list = (key: string) =>
    String(formData.get(key) ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  return WorkspaceAssistantSkillDraftSchema.safeParse({
    slug: formData.get("slug"),
    category: formData.get("category"),
    name: formData.get("name"),
    description: formData.get("description"),
    tags: list("tags"),
    triggers: list("triggers"),
    examples: list("examples"),
    requiredInputs: list("requiredInputs"),
    optionalInputs: list("optionalInputs"),
    supportedFormats: list("supportedFormats"),
    requiredKnowledgeSources: list("requiredKnowledgeSources"),
    instructions: formData.get("instructions"),
    workflow: list("workflow"),
    outputContract: list("outputContract"),
    qualityChecklist: list("qualityChecklist"),
    relatedSkills: list("relatedSkills"),
  });
}

export async function saveWorkspaceAssistantSkillAction(
  _previous: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  try {
    const { actor, agencyId } = await requireSkillAdmin();
    const parsed = readSkillDraft(formData);
    if (!parsed.success) return { errorCode: "invalid_input" };
    const skillId = String(formData.get("skillId") ?? "").trim();
    const result = skillId
      ? await saveAgencyWorkspaceAssistantSkillDraft(actor, agencyId, skillId, parsed.data)
      : await createAgencyWorkspaceAssistantSkill(actor, agencyId, parsed.data);
    revalidatePath("/app/agency-settings/ai/skills");
    return { savedRevision: "revision" in result ? result.revision : 1 };
  } catch (error) {
    const code = error instanceof Error ? error.message : "save_failed";
    return {
      errorCode:
        code === "workspace_assistant_skill_slug_conflict"
          ? "slug_conflict"
          : code === "workspace_assistant_skill_review_pending"
            ? "review_pending"
            : code === "workspace_assistant_skill_forbidden"
              ? "unauthorized"
              : "save_failed",
    };
  }
}

export async function submitWorkspaceAssistantSkillAction(
  _previous: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  try {
    const { actor, agencyId } = await requireSkillAdmin();
    const skillId = String(formData.get("skillId") ?? "");
    const revision = Number(formData.get("revision"));
    await submitAgencyWorkspaceAssistantSkillForReview(actor, agencyId, skillId, revision);
    revalidatePath("/app/agency-settings/ai/skills");
    return { done: true };
  } catch {
    return { errorCode: "submit_failed" };
  }
}

export async function reviewWorkspaceAssistantSkillAction(
  _previous: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  try {
    const { actor, agencyId } = await requireSkillAdmin();
    const skillId = String(formData.get("skillId") ?? "");
    const revision = Number(formData.get("revision"));
    const decision = formData.get("decision");
    if (decision !== "approve" && decision !== "reject") return { errorCode: "invalid_input" };
    await reviewAgencyWorkspaceAssistantSkill(
      actor,
      agencyId,
      skillId,
      revision,
      decision,
      String(formData.get("reviewNote") ?? "").slice(0, 500),
    );
    revalidatePath("/app/agency-settings/ai/skills");
    return { done: true };
  } catch (error) {
    return {
      errorCode:
        error instanceof Error && error.message === "workspace_assistant_skill_self_review_denied"
          ? "self_review_denied"
          : "review_failed",
    };
  }
}

export async function rollbackWorkspaceAssistantSkillAction(
  _previous: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  try {
    const { actor, agencyId } = await requireSkillAdmin();
    const result = await requestAgencyWorkspaceAssistantSkillRollback(
      actor,
      agencyId,
      String(formData.get("skillId") ?? ""),
      Number(formData.get("targetRevision")),
    );
    revalidatePath("/app/agency-settings/ai/skills");
    return { savedRevision: result.revision };
  } catch {
    return { errorCode: "rollback_failed" };
  }
}

export async function archiveWorkspaceAssistantSkillAction(
  _previous: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  try {
    const { actor, agencyId } = await requireSkillAdmin();
    await archiveAgencyWorkspaceAssistantSkill(
      actor,
      agencyId,
      String(formData.get("skillId") ?? ""),
    );
    revalidatePath("/app/agency-settings/ai/skills");
    return { done: true };
  } catch {
    return { errorCode: "archive_failed" };
  }
}
