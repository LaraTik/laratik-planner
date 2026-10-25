import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import {
  workspaceAssistantConversations,
  workspaceAssistantKnowledge,
  workspaceAssistantKnowledgeRevisions,
  workspaceAssistantPromptRevisions,
  workspaceAssistantPrompts,
  workspaceAssistantProposals,
  workspaceAssistantRuns,
  workspaceAssistantRunEvents,
  contentItems,
  workspaces,
} from "@/lib/db/schema";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { getBuiltInAssistantPrompt } from "./prompts";
import { AssistantPromptParametersSchema } from "./parameters";
import {
  getDefaultAssistantKnowledge,
  type AssistantKnowledgeEntry,
  type AssistantKnowledgeLocale,
} from "./default-knowledge";
import { updateContentItem } from "@/features/content/update-content.server";
import { reconcileContentItemMediaFolders } from "@/lib/media/planning-folder-lifecycle";

export { analyzeWorkspacePlan, parseWorkspaceAssistantResponse } from "./analysis";
export type {
  WorkspaceAssistantEvidence,
  WorkspaceAssistantFinding,
  WorkspaceAssistantResponse,
  WorkspaceAssistantToolResult,
  WorkspacePlanItem,
} from "./analysis";
export {
  resolveWorkspaceContentReference,
  WorkspaceContentReferenceSchema,
  type WorkspaceContentCandidate,
  type WorkspaceContentReferenceResult,
  type ResolvedWorkspaceContent,
} from "./reference-resolver";

const ASSISTANT_ROLES = ["workspace_manager", "content_planner"] as const;
const ASSISTANT_RUN_STALE_AFTER_MS = 120_000;

export type AssistantRunEventType =
  | "run_started"
  | "context_resolved"
  | "skills_selected"
  | "plan_analyzed"
  | "provider_started"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "response_validated"
  | "run_completed"
  | "run_failed"
  | "run_cancelled";

const boundedCount = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Math.min(Number(value), 10_000) : 0;

function sanitizeRunEventDetail(type: AssistantRunEventType, detail: Record<string, unknown>) {
  switch (type) {
    case "skills_selected":
      return {
        skillIds: Array.isArray(detail.skillIds)
          ? detail.skillIds
              .filter((value): value is string => typeof value === "string")
              .slice(0, 8)
              .map((value) => value.slice(0, 80))
          : [],
      };
    case "plan_analyzed":
      return {
        itemCount: boundedCount(detail.itemCount),
        findingCount: boundedCount(detail.findingCount),
      };
    case "provider_started":
      return { model: typeof detail.model === "string" ? detail.model.slice(0, 100) : "unknown" };
    case "tool_started":
    case "tool_completed":
    case "tool_failed":
      return {
        toolName: typeof detail.toolName === "string" ? detail.toolName.slice(0, 100) : "unknown",
      };
    case "response_validated":
      return {
        findingCount: boundedCount(detail.findingCount),
        recommendationCount: boundedCount(detail.recommendationCount),
      };
    default:
      return {};
  }
}

const assistantPromptInputSchema = z.object({
  scope: z.enum(["private", "workspace", "agency"]),
  name: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(1).max(500),
  goal: z.string().trim().min(1).max(1000),
  instructions: z.string().trim().min(1).max(12_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  parameters: AssistantPromptParametersSchema.default([]),
});

const validatePromptParameterReferences = (
  prompt: { goal: string; instructions: string; parameters: { key: string }[] },
  context: z.RefinementCtx,
) => {
  const allowed = new Set(prompt.parameters.map((parameter) => parameter.key));
  for (const [field, value] of [
    ["goal", prompt.goal],
    ["instructions", prompt.instructions],
  ] as const) {
    for (const match of value.matchAll(/\{\{([a-z][a-z0-9_]{0,39})\}\}/g)) {
      const key = match[1];
      if (key && !allowed.has(key)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `Unknown prompt parameter: ${key}`,
        });
      }
    }
  }
};

export const AssistantPromptInputSchema = assistantPromptInputSchema.superRefine(
  validatePromptParameterReferences,
);
export type AssistantPromptInput = z.infer<typeof AssistantPromptInputSchema>;

export const AssistantProposalInputSchema = z.object({
  contentItemId: z.string().guid(),
  expectedRevision: z.number().int().nonnegative(),
  field: z.enum(["title", "brief", "plannedPublishAt"]),
  title: z.string().trim().min(1).max(180),
  beforeValue: z.string().max(2_000),
  afterValue: z.string().trim().min(1).max(2_000),
  evidenceIds: z.array(z.string().trim().min(1).max(160)).max(8),
});
export type AssistantProposalInput = z.infer<typeof AssistantProposalInputSchema>;

const assistantKnowledgeInputSchema = z.object({
  scope: z.enum(["workspace", "agency"]),
  category: z.enum(["brand", "audience", "strategy", "operations", "performance", "reference"]),
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(1).max(8_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  sourceUrl: z
    .string()
    .trim()
    .max(2_000)
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    })
    .optional()
    .or(z.literal("")),
  verificationStatus: z.enum(["unverified", "verified", "outdated"]),
});
export const AssistantKnowledgeInputSchema = assistantKnowledgeInputSchema;
export type AssistantKnowledgeInput = z.infer<typeof assistantKnowledgeInputSchema>;

const PROMPT_CONTEXT = ["selected_month_plan", "calendar_distribution", "content_mix"] as const;

async function requireAssistantAccess(actor: Actor, workspaceId: string) {
  if (!(await hasWorkspaceRole(actor, workspaceId, [...ASSISTANT_ROLES]))) {
    throw new Error("workspace_assistant_forbidden");
  }
}

async function requireAssistantKnowledgeManagement(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  scope: "workspace" | "agency",
) {
  const permitted =
    scope === "agency"
      ? await isAgencyAdmin(actor, agencyId)
      : await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]);
  if (!permitted) throw new Error("workspace_assistant_knowledge_forbidden");
}

export async function listAssistantKnowledge(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  search = "",
  locale: AssistantKnowledgeLocale = "en",
) {
  await requireAssistantAccess(actor, workspaceId);
  const terms = search
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3)
    .slice(0, 6);
  const searchCondition = terms.length
    ? or(
        ...terms.flatMap((term) => {
          const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
          return [
            ilike(workspaceAssistantKnowledge.title, pattern),
            ilike(workspaceAssistantKnowledge.content, pattern),
            ilike(sql`${workspaceAssistantKnowledge.tags}::text`, pattern),
          ];
        }),
      )
    : undefined;
  const rows = await db
    .select({
      id: workspaceAssistantKnowledge.id,
      scope: workspaceAssistantKnowledge.scope,
      category: workspaceAssistantKnowledge.category,
      title: workspaceAssistantKnowledge.title,
      content: workspaceAssistantKnowledge.content,
      tags: workspaceAssistantKnowledge.tags,
      sourceUrl: workspaceAssistantKnowledge.sourceUrl,
      verificationStatus: workspaceAssistantKnowledge.verificationStatus,
      verifiedAt: workspaceAssistantKnowledge.verifiedAt,
      revision: workspaceAssistantKnowledge.revision,
      updatedAt: workspaceAssistantKnowledge.updatedAt,
    })
    .from(workspaceAssistantKnowledge)
    .where(
      and(
        eq(workspaceAssistantKnowledge.agencyId, agencyId),
        isNull(workspaceAssistantKnowledge.archivedAt),
        or(
          and(
            eq(workspaceAssistantKnowledge.scope, "agency"),
            isNull(workspaceAssistantKnowledge.workspaceId),
          ),
          and(
            eq(workspaceAssistantKnowledge.scope, "workspace"),
            eq(workspaceAssistantKnowledge.workspaceId, workspaceId),
          ),
        ),
        ...(searchCondition ? [searchCondition] : []),
      ),
    )
    .orderBy(desc(workspaceAssistantKnowledge.updatedAt))
    .limit(searchCondition ? 50 : 100);
  const storedEntries: AssistantKnowledgeEntry[] = rows.map((row) => ({
    ...row,
    scope: row.scope as Exclude<AssistantKnowledgeEntry["scope"], "default">,
    category: row.category as AssistantKnowledgeEntry["category"],
    verificationStatus: row.verificationStatus as AssistantKnowledgeEntry["verificationStatus"],
    isBuiltIn: false,
  }));
  const defaultEntries = getDefaultAssistantKnowledge(locale);
  const matchingDefaults = terms.length
    ? defaultEntries.filter((entry) => {
        const text = `${entry.title} ${entry.content} ${entry.tags.join(" ")}`.toLocaleLowerCase();
        return terms.some((term) => text.includes(term));
      })
    : defaultEntries;
  return [...storedEntries, ...matchingDefaults];
}

export async function searchAssistantKnowledge(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  query: string,
  locale: AssistantKnowledgeLocale = "en",
) {
  const rows = await listAssistantKnowledge(actor, agencyId, workspaceId, query, locale);
  const queryTerms = new Set(
    query
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3),
  );
  return rows
    .map((row) => {
      const text = `${row.title} ${row.content} ${(row.tags ?? []).join(" ")}`.toLocaleLowerCase();
      const score = [...queryTerms].reduce((count, term) => count + Number(text.includes(term)), 0);
      return { row, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.row.verificationStatus === "verified") -
          Number(a.row.verificationStatus === "verified") ||
        b.row.updatedAt.getTime() - a.row.updatedAt.getTime() ||
        Number(a.row.isBuiltIn) - Number(b.row.isBuiltIn),
    )
    .slice(0, 6)
    .map(({ row }) => ({ ...row, content: row.content.slice(0, 1_800) }));
}

export async function listAssistantKnowledgeRevisions(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  knowledgeId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [entry] = await db
    .select({ id: workspaceAssistantKnowledge.id })
    .from(workspaceAssistantKnowledge)
    .where(
      and(
        eq(workspaceAssistantKnowledge.id, knowledgeId),
        eq(workspaceAssistantKnowledge.agencyId, agencyId),
        or(
          and(
            eq(workspaceAssistantKnowledge.scope, "workspace"),
            eq(workspaceAssistantKnowledge.workspaceId, workspaceId),
          ),
          and(
            eq(workspaceAssistantKnowledge.scope, "agency"),
            isNull(workspaceAssistantKnowledge.workspaceId),
          ),
        ),
      ),
    )
    .limit(1);
  if (!entry) return null;
  return db
    .select({
      revision: workspaceAssistantKnowledgeRevisions.revision,
      snapshot: workspaceAssistantKnowledgeRevisions.snapshot,
      createdBy: workspaceAssistantKnowledgeRevisions.createdBy,
      createdAt: workspaceAssistantKnowledgeRevisions.createdAt,
    })
    .from(workspaceAssistantKnowledgeRevisions)
    .where(eq(workspaceAssistantKnowledgeRevisions.knowledgeId, knowledgeId))
    .orderBy(desc(workspaceAssistantKnowledgeRevisions.revision))
    .limit(50);
}

export async function createAssistantKnowledge(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  rawInput: AssistantKnowledgeInput,
) {
  const input = assistantKnowledgeInputSchema.parse(rawInput);
  await requireAssistantAccess(actor, workspaceId);
  await requireAssistantKnowledgeManagement(actor, agencyId, workspaceId, input.scope);
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.agencyId, agencyId)))
    .limit(1);
  if (!workspace) throw new Error("workspace_assistant_knowledge_scope_invalid");
  const values = {
    agencyId,
    ...(input.scope === "workspace" ? { workspaceId } : {}),
    ownerId: actor.id,
    scope: input.scope,
    category: input.category,
    title: input.title,
    content: input.content,
    tags: input.tags,
    sourceUrl: input.sourceUrl || null,
    verificationStatus: input.verificationStatus,
    verifiedAt: input.verificationStatus === "verified" ? new Date() : null,
    revision: 1,
  };
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(workspaceAssistantKnowledge).values(values).returning();
    if (!row) throw new Error("workspace_assistant_knowledge_create_failed");
    await tx.insert(workspaceAssistantKnowledgeRevisions).values({
      knowledgeId: row.id,
      revision: row.revision,
      snapshot: knowledgeSnapshot(values),
      createdBy: actor.id,
    });
    return row;
  });
}

export async function updateAssistantKnowledge(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  knowledgeId: string,
  expectedRevision: number,
  rawInput: AssistantKnowledgeInput,
) {
  const input = assistantKnowledgeInputSchema.parse(rawInput);
  await requireAssistantAccess(actor, workspaceId);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(workspaceAssistantKnowledge)
      .where(
        and(
          eq(workspaceAssistantKnowledge.id, knowledgeId),
          eq(workspaceAssistantKnowledge.agencyId, agencyId),
          isNull(workspaceAssistantKnowledge.archivedAt),
          or(
            and(
              eq(workspaceAssistantKnowledge.scope, "workspace"),
              eq(workspaceAssistantKnowledge.workspaceId, workspaceId),
            ),
            and(
              eq(workspaceAssistantKnowledge.scope, "agency"),
              isNull(workspaceAssistantKnowledge.workspaceId),
            ),
          ),
        ),
      )
      .limit(1)
      .for("update");
    if (!existing) return { status: "not_found" as const };
    await requireAssistantKnowledgeManagement(
      actor,
      agencyId,
      workspaceId,
      existing.scope as "agency" | "workspace",
    );
    if (existing.scope !== input.scope || existing.revision !== expectedRevision) {
      return { status: "conflict" as const };
    }
    const revision = existing.revision + 1;
    const values = {
      category: input.category,
      title: input.title,
      content: input.content,
      tags: input.tags,
      sourceUrl: input.sourceUrl || null,
      verificationStatus: input.verificationStatus,
      verifiedAt: input.verificationStatus === "verified" ? new Date() : null,
      revision,
      updatedAt: new Date(),
    };
    const [row] = await tx
      .update(workspaceAssistantKnowledge)
      .set(values)
      .where(
        and(
          eq(workspaceAssistantKnowledge.id, knowledgeId),
          eq(workspaceAssistantKnowledge.revision, expectedRevision),
        ),
      )
      .returning();
    if (!row) return { status: "conflict" as const };
    await tx.insert(workspaceAssistantKnowledgeRevisions).values({
      knowledgeId,
      revision,
      snapshot: knowledgeSnapshot({ ...existing, ...input, ...values }),
      createdBy: actor.id,
    });
    return { status: "updated" as const, row };
  });
  return result;
}

const ASSISTANT_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_ASSISTANT_RUN_EVENTS = 64;

export async function createAssistantRun(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const now = new Date();
  const [conversation] = await db
    .select({ id: workspaceAssistantConversations.id })
    .from(workspaceAssistantConversations)
    .where(
      and(
        eq(workspaceAssistantConversations.id, conversationId),
        eq(workspaceAssistantConversations.workspaceId, workspaceId),
        eq(workspaceAssistantConversations.ownerId, actor.id),
      ),
    )
    .limit(1);
  if (!conversation) throw new Error("workspace_assistant_conversation_not_found");

  const [run] = await db.transaction(async (tx) => {
    // Runs and their operational events contain no user or assistant text.
    // Remove expired records as new work starts so retention is enforced even
    // when the periodic cleanup task is delayed.
    await tx.delete(workspaceAssistantRuns).where(lt(workspaceAssistantRuns.expiresAt, now));
    const [created] = await tx
      .insert(workspaceAssistantRuns)
      .values({
        workspaceId,
        conversationId,
        ownerId: actor.id,
        status: "running",
        expiresAt: new Date(now.getTime() + ASSISTANT_RUN_RETENTION_MS),
      })
      .returning({ id: workspaceAssistantRuns.id });
    if (!created) throw new Error("workspace_assistant_run_create_failed");
    await tx.insert(workspaceAssistantRunEvents).values({
      runId: created.id,
      sequence: 1,
      type: "run_started",
      detail: {},
    });
    await tx
      .update(workspaceAssistantRuns)
      .set({ lastSequence: 1, updatedAt: now })
      .where(eq(workspaceAssistantRuns.id, created.id));
    return [created];
  });
  return run;
}

export async function recordAssistantRunEvent(
  runId: string,
  type: AssistantRunEventType,
  rawDetail: Record<string, unknown> = {},
) {
  const detail = sanitizeRunEventDetail(type, rawDetail);
  return db.transaction(async (tx) => {
    const [run] = await tx
      .update(workspaceAssistantRuns)
      .set({
        lastSequence: sql`${workspaceAssistantRuns.lastSequence} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceAssistantRuns.id, runId),
          eq(workspaceAssistantRuns.status, "running"),
          lt(workspaceAssistantRuns.lastSequence, MAX_ASSISTANT_RUN_EVENTS - 1),
        ),
      )
      .returning({ sequence: workspaceAssistantRuns.lastSequence });
    if (!run) return false;
    await tx.insert(workspaceAssistantRunEvents).values({
      runId,
      sequence: run.sequence,
      type,
      detail,
    });
    return true;
  });
}

export async function finishAssistantRun(
  runId: string,
  status: "completed" | "failed" | "cancelled",
) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .update(workspaceAssistantRuns)
      .set({ status, terminalAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(workspaceAssistantRuns.id, runId),
          eq(workspaceAssistantRuns.status, "running"),
          lt(workspaceAssistantRuns.lastSequence, MAX_ASSISTANT_RUN_EVENTS),
        ),
      )
      .returning({ sequence: workspaceAssistantRuns.lastSequence });
    if (!run) return false;
    const type = status === "completed" ? "run_completed" : `run_${status}`;
    await tx.insert(workspaceAssistantRunEvents).values({
      runId,
      sequence: run.sequence + 1,
      type,
      detail: {},
    });
    await tx
      .update(workspaceAssistantRuns)
      .set({ lastSequence: run.sequence + 1 })
      .where(eq(workspaceAssistantRuns.id, runId));
    return true;
  });
}

export async function isAssistantRunCancellationRequested(runId: string) {
  const [run] = await db
    .select({
      status: workspaceAssistantRuns.status,
      cancelRequestedAt: workspaceAssistantRuns.cancelRequestedAt,
    })
    .from(workspaceAssistantRuns)
    .where(eq(workspaceAssistantRuns.id, runId))
    .limit(1);
  return !run || run.status !== "running" || Boolean(run.cancelRequestedAt);
}

export async function requestAssistantRunCancellation(
  actor: Actor,
  workspaceId: string,
  runId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [updated] = await db
    .update(workspaceAssistantRuns)
    .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workspaceAssistantRuns.id, runId),
        eq(workspaceAssistantRuns.workspaceId, workspaceId),
        eq(workspaceAssistantRuns.ownerId, actor.id),
        eq(workspaceAssistantRuns.status, "running"),
        isNull(workspaceAssistantRuns.cancelRequestedAt),
      ),
    )
    .returning({ id: workspaceAssistantRuns.id });
  if (updated) return { status: "cancelling" as const };
  const [existing] = await db
    .select({ status: workspaceAssistantRuns.status })
    .from(workspaceAssistantRuns)
    .where(
      and(
        eq(workspaceAssistantRuns.id, runId),
        eq(workspaceAssistantRuns.workspaceId, workspaceId),
        eq(workspaceAssistantRuns.ownerId, actor.id),
      ),
    )
    .limit(1);
  return existing ? { status: existing.status } : null;
}

export async function getAssistantRunEvents(
  actor: Actor,
  workspaceId: string,
  runId: string,
  afterSequence: number,
  limit: number,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [run] = await db
    .select({
      id: workspaceAssistantRuns.id,
      status: workspaceAssistantRuns.status,
      lastSequence: workspaceAssistantRuns.lastSequence,
      cancelRequestedAt: workspaceAssistantRuns.cancelRequestedAt,
      createdAt: workspaceAssistantRuns.createdAt,
      updatedAt: workspaceAssistantRuns.updatedAt,
      terminalAt: workspaceAssistantRuns.terminalAt,
    })
    .from(workspaceAssistantRuns)
    .where(
      and(
        eq(workspaceAssistantRuns.id, runId),
        eq(workspaceAssistantRuns.workspaceId, workspaceId),
        eq(workspaceAssistantRuns.ownerId, actor.id),
        gt(workspaceAssistantRuns.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!run) return null;
  if (
    run.status === "running" &&
    run.updatedAt.getTime() < Date.now() - ASSISTANT_RUN_STALE_AFTER_MS
  ) {
    await db.transaction(async (tx) => {
      const [stale] = await tx
        .update(workspaceAssistantRuns)
        .set({
          status: "failed",
          terminalAt: new Date(),
          updatedAt: new Date(),
          lastSequence: sql`${workspaceAssistantRuns.lastSequence} + 1`,
        })
        .where(
          and(
            eq(workspaceAssistantRuns.id, runId),
            eq(workspaceAssistantRuns.workspaceId, workspaceId),
            eq(workspaceAssistantRuns.ownerId, actor.id),
            eq(workspaceAssistantRuns.status, "running"),
            eq(workspaceAssistantRuns.lastSequence, run.lastSequence),
            eq(workspaceAssistantRuns.updatedAt, run.updatedAt),
            lt(workspaceAssistantRuns.lastSequence, MAX_ASSISTANT_RUN_EVENTS),
          ),
        )
        .returning({ sequence: workspaceAssistantRuns.lastSequence });
      if (stale) {
        await tx.insert(workspaceAssistantRunEvents).values({
          runId,
          sequence: stale.sequence,
          type: "run_failed",
          detail: {},
        });
      }
    });
  }
  const [currentRun] = await db
    .select({
      status: workspaceAssistantRuns.status,
      lastSequence: workspaceAssistantRuns.lastSequence,
      cancelRequestedAt: workspaceAssistantRuns.cancelRequestedAt,
      createdAt: workspaceAssistantRuns.createdAt,
      terminalAt: workspaceAssistantRuns.terminalAt,
    })
    .from(workspaceAssistantRuns)
    .where(eq(workspaceAssistantRuns.id, runId))
    .limit(1);
  if (!currentRun) return null;
  const events = await db
    .select({
      sequence: workspaceAssistantRunEvents.sequence,
      type: workspaceAssistantRunEvents.type,
      detail: workspaceAssistantRunEvents.detail,
      createdAt: workspaceAssistantRunEvents.createdAt,
    })
    .from(workspaceAssistantRunEvents)
    .where(
      and(
        eq(workspaceAssistantRunEvents.runId, runId),
        gt(workspaceAssistantRunEvents.sequence, afterSequence),
      ),
    )
    .orderBy(asc(workspaceAssistantRunEvents.sequence))
    .limit(limit);
  return {
    ...run,
    ...currentRun,
    events,
    nextSequence: events.at(-1)?.sequence ?? afterSequence,
  };
}

export async function archiveAssistantKnowledge(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  knowledgeId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [row] = await db
    .select({ id: workspaceAssistantKnowledge.id, scope: workspaceAssistantKnowledge.scope })
    .from(workspaceAssistantKnowledge)
    .where(
      and(
        eq(workspaceAssistantKnowledge.id, knowledgeId),
        eq(workspaceAssistantKnowledge.agencyId, agencyId),
        isNull(workspaceAssistantKnowledge.archivedAt),
        or(
          and(
            eq(workspaceAssistantKnowledge.scope, "workspace"),
            eq(workspaceAssistantKnowledge.workspaceId, workspaceId),
          ),
          and(
            eq(workspaceAssistantKnowledge.scope, "agency"),
            isNull(workspaceAssistantKnowledge.workspaceId),
          ),
        ),
      ),
    )
    .limit(1);
  if (!row) return false;
  await requireAssistantKnowledgeManagement(
    actor,
    agencyId,
    workspaceId,
    row.scope as "agency" | "workspace",
  );
  await db
    .update(workspaceAssistantKnowledge)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaceAssistantKnowledge.id, knowledgeId));
  return true;
}

function knowledgeSnapshot(input: Record<string, unknown>) {
  return {
    scope: input.scope,
    category: input.category,
    title: input.title,
    content: input.content,
    tags: input.tags,
    sourceUrl: input.sourceUrl,
    verificationStatus: input.verificationStatus,
  };
}

export async function listAssistantConversations(
  actor: Actor,
  workspaceId: string,
  includeArchived = false,
) {
  await requireAssistantAccess(actor, workspaceId);
  const rows = await db
    .select({
      id: workspaceAssistantConversations.id,
      title: workspaceAssistantConversations.title,
      mode: workspaceAssistantConversations.mode,
      responseLocale: workspaceAssistantConversations.responseLocale,
      pinnedAt: workspaceAssistantConversations.pinnedAt,
      updatedAt: workspaceAssistantConversations.updatedAt,
    })
    .from(workspaceAssistantConversations)
    .where(
      and(
        eq(workspaceAssistantConversations.workspaceId, workspaceId),
        eq(workspaceAssistantConversations.ownerId, actor.id),
        includeArchived
          ? isNotNull(workspaceAssistantConversations.archivedAt)
          : isNull(workspaceAssistantConversations.archivedAt),
      ),
    )
    .orderBy(
      sql`${workspaceAssistantConversations.pinnedAt} DESC NULLS LAST`,
      desc(workspaceAssistantConversations.updatedAt),
    )
    .limit(50);
  return rows;
}

export async function createAssistantConversation(
  actor: Actor,
  workspaceId: string,
  title = "New conversation",
  mode: "ask" | "plan" | "apply" = "ask",
  responseLocale: "ar" | "en" = "ar",
) {
  await requireAssistantAccess(actor, workspaceId);
  const [row] = await db
    .insert(workspaceAssistantConversations)
    .values({
      workspaceId,
      ownerId: actor.id,
      title: normalizeConversationTitle(title),
      mode,
      responseLocale,
    })
    .returning({
      id: workspaceAssistantConversations.id,
      title: workspaceAssistantConversations.title,
      mode: workspaceAssistantConversations.mode,
      responseLocale: workspaceAssistantConversations.responseLocale,
      pinnedAt: workspaceAssistantConversations.pinnedAt,
    });
  if (!row) throw new Error("workspace_assistant_conversation_create_failed");
  return row;
}

export async function getAssistantConversation(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
  includeArchived = false,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [conversation] = await db
    .select({
      id: workspaceAssistantConversations.id,
      title: workspaceAssistantConversations.title,
      mode: workspaceAssistantConversations.mode,
      responseLocale: workspaceAssistantConversations.responseLocale,
    })
    .from(workspaceAssistantConversations)
    .where(
      and(
        eq(workspaceAssistantConversations.id, conversationId),
        eq(workspaceAssistantConversations.workspaceId, workspaceId),
        eq(workspaceAssistantConversations.ownerId, actor.id),
        includeArchived
          ? isNotNull(workspaceAssistantConversations.archivedAt)
          : isNull(workspaceAssistantConversations.archivedAt),
      ),
    )
    .limit(1);
  if (!conversation) return null;
  const proposals = await listAssistantProposals(actor, workspaceId, conversationId);
  // Transcript text remains in browser memory. Keep the legacy table for
  // migration compatibility, but never read it from runtime session APIs.
  return { ...conversation, messages: [], proposals };
}

export async function createAssistantProposal(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
  rawInput: AssistantProposalInput,
) {
  const input = AssistantProposalInputSchema.parse(rawInput);
  await requireAssistantAccess(actor, workspaceId);
  const [item] = await db
    .select({
      title: contentItems.title,
      brief: contentItems.brief,
      plannedPublishAt: contentItems.plannedPublishAt,
      revision: contentItems.revision,
      status: contentItems.status,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        eq(contentItems.workspaceId, workspaceId),
        isNull(contentItems.archivedAt),
      ),
    )
    .limit(1);
  if (!item) return null;
  const beforeValue =
    input.field === "title"
      ? item.title
      : input.field === "brief"
        ? item.brief
        : item.plannedPublishAt.toISOString();
  const fieldLimit = input.field === "title" ? 200 : 2_000;
  const validScheduleDate =
    input.field !== "plannedPublishAt" ||
    (isIsoDate(input.afterValue) && input.afterValue !== beforeValue.slice(0, 10));
  const requiredEvidenceId = `content-item-${input.contentItemId}-revision-${input.expectedRevision}`;
  if (
    !["draft", "changes_requested"].includes(item.status) ||
    item.revision !== input.expectedRevision ||
    input.beforeValue !== beforeValue ||
    (input.field === "title" && input.afterValue.length < 2) ||
    !validScheduleDate ||
    input.afterValue.length > fieldLimit ||
    input.afterValue === beforeValue ||
    input.evidenceIds.length === 0 ||
    input.evidenceIds.some((id) => id !== requiredEvidenceId)
  ) {
    return null;
  }
  const [conversation] = await db
    .select({ id: workspaceAssistantConversations.id })
    .from(workspaceAssistantConversations)
    .where(
      and(
        eq(workspaceAssistantConversations.id, conversationId),
        eq(workspaceAssistantConversations.workspaceId, workspaceId),
        eq(workspaceAssistantConversations.ownerId, actor.id),
        isNull(workspaceAssistantConversations.archivedAt),
      ),
    )
    .limit(1);
  if (!conversation) return null;
  const [proposal] = await db
    .insert(workspaceAssistantProposals)
    .values({
      workspaceId,
      conversationId,
      ownerId: actor.id,
      contentItemId: input.contentItemId,
      expectedRevision: input.expectedRevision,
      field: input.field,
      title: input.title,
      beforeValue,
      afterValue: input.afterValue,
      evidenceIds: input.evidenceIds,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    .returning({
      id: workspaceAssistantProposals.id,
      contentItemId: workspaceAssistantProposals.contentItemId,
      field: workspaceAssistantProposals.field,
      title: workspaceAssistantProposals.title,
      beforeValue: workspaceAssistantProposals.beforeValue,
      afterValue: workspaceAssistantProposals.afterValue,
      evidenceIds: workspaceAssistantProposals.evidenceIds,
      status: workspaceAssistantProposals.status,
      expiresAt: workspaceAssistantProposals.expiresAt,
    });
  return proposal ?? null;
}

export async function listAssistantProposals(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  return db
    .select({
      id: workspaceAssistantProposals.id,
      contentItemId: workspaceAssistantProposals.contentItemId,
      field: workspaceAssistantProposals.field,
      title: workspaceAssistantProposals.title,
      beforeValue: workspaceAssistantProposals.beforeValue,
      afterValue: workspaceAssistantProposals.afterValue,
      evidenceIds: workspaceAssistantProposals.evidenceIds,
      status: workspaceAssistantProposals.status,
      expiresAt: workspaceAssistantProposals.expiresAt,
    })
    .from(workspaceAssistantProposals)
    .where(
      and(
        eq(workspaceAssistantProposals.conversationId, conversationId),
        eq(workspaceAssistantProposals.workspaceId, workspaceId),
        eq(workspaceAssistantProposals.ownerId, actor.id),
      ),
    )
    .orderBy(desc(workspaceAssistantProposals.createdAt))
    .limit(20);
}

export async function decideAssistantProposal(
  actor: Actor,
  workspaceId: string,
  proposalId: string,
  decision: "apply" | "reject",
) {
  await requireAssistantAccess(actor, workspaceId);
  const result = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(workspaceAssistantProposals)
      .where(
        and(
          eq(workspaceAssistantProposals.id, proposalId),
          eq(workspaceAssistantProposals.workspaceId, workspaceId),
          eq(workspaceAssistantProposals.ownerId, actor.id),
        ),
      )
      .limit(1)
      .for("update");
    if (!proposal) return { status: "not_found" as const };
    if (proposal.status === "applied") return { status: "already_applied" as const };
    if (proposal.status !== "proposed")
      return { status: proposal.status as "stale" | "expired" | "rejected" };
    if (proposal.expiresAt.getTime() <= Date.now()) {
      await tx
        .update(workspaceAssistantProposals)
        .set({ status: "expired", decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaceAssistantProposals.id, proposal.id));
      return { status: "expired" as const };
    }
    if (decision === "reject") {
      await tx
        .update(workspaceAssistantProposals)
        .set({ status: "rejected", decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaceAssistantProposals.id, proposal.id));
      return { status: "rejected" as const };
    }

    const [item] = await tx
      .select({
        title: contentItems.title,
        brief: contentItems.brief,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
        status: contentItems.status,
        revision: contentItems.revision,
        agencyId: workspaces.agencyId,
      })
      .from(contentItems)
      .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
      .where(
        and(
          eq(contentItems.id, proposal.contentItemId),
          eq(contentItems.workspaceId, workspaceId),
          isNull(contentItems.archivedAt),
        ),
      )
      .limit(1)
      .for("update");
    const currentValue = item
      ? proposal.field === "title"
        ? item.title
        : proposal.field === "brief"
          ? item.brief
          : item.plannedPublishAt.toISOString()
      : null;
    if (
      !item ||
      !["draft", "changes_requested"].includes(item.status) ||
      item.revision !== proposal.expectedRevision ||
      currentValue !== proposal.beforeValue
    ) {
      await tx
        .update(workspaceAssistantProposals)
        .set({ status: "stale", decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaceAssistantProposals.id, proposal.id));
      return { status: "stale" as const };
    }

    const plannedPublishAt =
      proposal.field === "plannedPublishAt"
        ? datePreservingUtcTime(proposal.afterValue, item.plannedPublishAt)
        : item.plannedPublishAt;
    await updateContentItem(actor, {
      contentItemId: proposal.contentItemId,
      title: proposal.field === "title" ? proposal.afterValue : item.title,
      format: item.format,
      brief: proposal.field === "brief" ? proposal.afterValue : item.brief,
      plannedPublishAt,
      channelIds: undefined,
      expectedRevision: proposal.expectedRevision,
      transaction: tx,
    });
    await tx
      .update(workspaceAssistantProposals)
      .set({
        status: "applied",
        decidedAt: new Date(),
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workspaceAssistantProposals.id, proposal.id));
    return {
      status: "applied" as const,
      contentItemId: proposal.contentItemId,
      ...(proposal.field === "plannedPublishAt"
        ? {
            mediaReconcile: {
              agencyId: item.agencyId,
              prevPlannedPublishAt: item.plannedPublishAt,
              nextPlannedPublishAt: plannedPublishAt,
              format: item.format,
            },
          }
        : {}),
    };
  });
  if (result.status === "applied" && "mediaReconcile" in result) {
    try {
      await reconcileContentItemMediaFolders({
        actor,
        agencyId: result.mediaReconcile.agencyId,
        workspaceId,
        contentItemId: result.contentItemId,
        prevPlannedPublishAt: result.mediaReconcile.prevPlannedPublishAt,
        nextPlannedPublishAt: result.mediaReconcile.nextPlannedPublishAt,
        prevFormat: result.mediaReconcile.format,
        nextFormat: result.mediaReconcile.format,
      });
    } catch {
      // Keep the proposal commit successful; the planner reconciles folders best-effort.
    }
    return { status: result.status, contentItemId: result.contentItemId };
  }
  return result;
}

/** Apply a user's explicitly selected edits across reviewed items atomically. */
export async function decideAssistantProposalBatch(
  actor: Actor,
  workspaceId: string,
  proposalIds: string[],
) {
  const uniqueIds = [...new Set(proposalIds)];
  if (uniqueIds.length < 2 || uniqueIds.length > 10 || uniqueIds.length !== proposalIds.length) {
    return { status: "invalid_batch" as const };
  }
  await requireAssistantAccess(actor, workspaceId);
  const result = await db.transaction(async (tx) => {
    const selected = await tx
      .select()
      .from(workspaceAssistantProposals)
      .where(
        and(
          inArray(workspaceAssistantProposals.id, uniqueIds),
          eq(workspaceAssistantProposals.workspaceId, workspaceId),
          eq(workspaceAssistantProposals.ownerId, actor.id),
        ),
      )
      .orderBy(asc(workspaceAssistantProposals.id))
      .for("update");
    if (selected.length !== uniqueIds.length) return { status: "not_found" as const };
    if (selected.every((proposal) => proposal.status === "applied")) {
      return {
        status: "already_applied" as const,
        contentItemId: selected[0]?.contentItemId,
        contentItemIds: [...new Set(selected.map((proposal) => proposal.contentItemId))],
        proposalIds: uniqueIds,
      };
    }
    if (selected.some((proposal) => proposal.status !== "proposed")) {
      return {
        status: "conflict" as const,
        proposalStatuses: selected.map(({ id, status }) => ({ id, status })),
      };
    }
    const groups = new Map<string, typeof selected>();
    for (const proposal of selected) {
      const group = groups.get(proposal.contentItemId) ?? [];
      group.push(proposal);
      groups.set(proposal.contentItemId, group);
    }
    if (
      groups.size > 5 ||
      [...groups.values()].some(
        (group) =>
          new Set(group.map((proposal) => proposal.field)).size !== group.length ||
          new Set(group.map((proposal) => proposal.expectedRevision)).size !== 1,
      )
    ) {
      return { status: "invalid_batch" as const };
    }
    const now = new Date();
    if (selected.some((proposal) => proposal.expiresAt.getTime() <= now.getTime())) {
      await tx
        .update(workspaceAssistantProposals)
        .set({ status: "expired", decidedAt: now, updatedAt: now })
        .where(inArray(workspaceAssistantProposals.id, uniqueIds));
      return { status: "expired" as const };
    }

    const contentItemIds = [...groups.keys()].sort();
    const items = await tx
      .select({
        id: contentItems.id,
        title: contentItems.title,
        brief: contentItems.brief,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
        status: contentItems.status,
        revision: contentItems.revision,
        agencyId: workspaces.agencyId,
      })
      .from(contentItems)
      .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
      .where(
        and(
          inArray(contentItems.id, contentItemIds),
          eq(contentItems.workspaceId, workspaceId),
          isNull(contentItems.archivedAt),
        ),
      )
      .orderBy(asc(contentItems.id))
      .for("update");
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const stale =
      contentItemIds.length !== items.length ||
      selected.some((proposal) => {
        const item = itemsById.get(proposal.contentItemId);
        if (!item || !["draft", "changes_requested"].includes(item.status)) return true;
        const expectedRevision = groups.get(proposal.contentItemId)?.[0]?.expectedRevision;
        if (item.revision !== expectedRevision) return true;
        const currentValue =
          proposal.field === "title"
            ? item.title
            : proposal.field === "brief"
              ? item.brief
              : item.plannedPublishAt.toISOString();
        return currentValue !== proposal.beforeValue;
      });
    if (stale) {
      await tx
        .update(workspaceAssistantProposals)
        .set({ status: "stale", decidedAt: now, updatedAt: now })
        .where(inArray(workspaceAssistantProposals.id, uniqueIds));
      return { status: "stale" as const };
    }

    const mediaReconcile: Array<{
      contentItemId: string;
      agencyId: string;
      prevPlannedPublishAt: Date;
      nextPlannedPublishAt: Date;
      format: string;
    }> = [];
    for (const contentItemId of contentItemIds) {
      const item = itemsById.get(contentItemId);
      const group = groups.get(contentItemId);
      if (!item || !group?.[0]) return { status: "stale" as const };
      const byField = new Map(group.map((proposal) => [proposal.field, proposal]));
      const schedule = byField.get("plannedPublishAt");
      const plannedPublishAt = schedule
        ? datePreservingUtcTime(schedule.afterValue, item.plannedPublishAt)
        : item.plannedPublishAt;
      await updateContentItem(actor, {
        contentItemId,
        title: byField.get("title")?.afterValue ?? item.title,
        format: item.format,
        brief: byField.get("brief")?.afterValue ?? item.brief,
        plannedPublishAt,
        channelIds: undefined,
        expectedRevision: group[0].expectedRevision,
        transaction: tx,
      });
      if (schedule) {
        mediaReconcile.push({
          agencyId: item.agencyId,
          contentItemId,
          prevPlannedPublishAt: item.plannedPublishAt,
          nextPlannedPublishAt: plannedPublishAt,
          format: item.format,
        });
      }
    }
    await tx
      .update(workspaceAssistantProposals)
      .set({ status: "applied", decidedAt: now, appliedAt: now, updatedAt: now })
      .where(inArray(workspaceAssistantProposals.id, uniqueIds));
    return {
      status: "applied" as const,
      contentItemId: contentItemIds[0],
      contentItemIds,
      proposalIds: uniqueIds,
      mediaReconcile,
    };
  });
  if (result.status === "applied" && "mediaReconcile" in result) {
    for (const item of result.mediaReconcile) {
      try {
        await reconcileContentItemMediaFolders({
          actor,
          agencyId: item.agencyId,
          workspaceId,
          contentItemId: item.contentItemId,
          prevPlannedPublishAt: item.prevPlannedPublishAt,
          nextPlannedPublishAt: item.nextPlannedPublishAt,
          prevFormat: item.format,
          nextFormat: item.format,
        });
      } catch {
        // Preserve the committed edits; folder reconciliation is best effort.
      }
    }
    return {
      status: result.status,
      contentItemId: result.contentItemId,
      contentItemIds: result.contentItemIds,
      proposalIds: result.proposalIds,
    };
  }
  return result;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function datePreservingUtcTime(value: string, current: Date) {
  if (!isIsoDate(value)) throw new Error("workspace_assistant_invalid_schedule_date");
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(current);
  result.setUTCFullYear(year!, month! - 1, day!);
  return result;
}

export async function updateAssistantConversation(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
  input: {
    title?: string;
    archived?: boolean;
    mode?: "ask" | "plan" | "apply";
    responseLocale?: "ar" | "en";
    pinned?: boolean;
  },
) {
  await requireAssistantAccess(actor, workspaceId);
  const [row] = await db
    .update(workspaceAssistantConversations)
    .set({
      ...(input.title !== undefined ? { title: normalizeConversationTitle(input.title) } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.responseLocale !== undefined ? { responseLocale: input.responseLocale } : {}),
      ...(input.pinned !== undefined ? { pinnedAt: input.pinned ? new Date() : null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceAssistantConversations.id, conversationId),
        eq(workspaceAssistantConversations.workspaceId, workspaceId),
        eq(workspaceAssistantConversations.ownerId, actor.id),
      ),
    )
    .returning({ id: workspaceAssistantConversations.id });
  return Boolean(row);
}

export async function deleteAssistantConversation(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [row] = await db
    .delete(workspaceAssistantConversations)
    .where(
      and(
        eq(workspaceAssistantConversations.id, conversationId),
        eq(workspaceAssistantConversations.workspaceId, workspaceId),
        eq(workspaceAssistantConversations.ownerId, actor.id),
      ),
    )
    .returning({ id: workspaceAssistantConversations.id });
  return Boolean(row);
}

export async function listAssistantPrompts(actor: Actor, agencyId: string, workspaceId: string) {
  await requireAssistantAccess(actor, workspaceId);
  const agencyAdmin = await isAgencyAdmin(actor, agencyId);
  const rows = await db
    .select({
      id: workspaceAssistantPrompts.id,
      scope: workspaceAssistantPrompts.scope,
      status: workspaceAssistantPrompts.status,
      name: workspaceAssistantPrompts.name,
      purpose: workspaceAssistantPrompts.purpose,
      goal: workspaceAssistantPrompts.goal,
      instructions: workspaceAssistantPrompts.instructions,
      tags: workspaceAssistantPrompts.tags,
      parameters: workspaceAssistantPrompts.parameters,
      revision: workspaceAssistantPrompts.revision,
      ownerId: workspaceAssistantPrompts.ownerId,
      updatedAt: workspaceAssistantPrompts.updatedAt,
    })
    .from(workspaceAssistantPrompts)
    .where(
      and(
        eq(workspaceAssistantPrompts.agencyId, agencyId),
        isNull(workspaceAssistantPrompts.archivedAt),
        or(
          and(
            eq(workspaceAssistantPrompts.scope, "private"),
            eq(workspaceAssistantPrompts.workspaceId, workspaceId),
            eq(workspaceAssistantPrompts.ownerId, actor.id),
          ),
          and(
            eq(workspaceAssistantPrompts.scope, "workspace"),
            eq(workspaceAssistantPrompts.workspaceId, workspaceId),
            or(
              eq(workspaceAssistantPrompts.status, "published"),
              eq(workspaceAssistantPrompts.ownerId, actor.id),
            ),
          ),
          and(
            eq(workspaceAssistantPrompts.scope, "agency"),
            isNull(workspaceAssistantPrompts.workspaceId),
            eq(workspaceAssistantPrompts.status, "published"),
          ),
          and(
            eq(workspaceAssistantPrompts.scope, "agency"),
            eq(workspaceAssistantPrompts.ownerId, actor.id),
          ),
          ...(agencyAdmin
            ? [
                and(
                  eq(workspaceAssistantPrompts.scope, "agency"),
                  eq(workspaceAssistantPrompts.status, "pending_approval"),
                ),
              ]
            : []),
        ),
      ),
    )
    .orderBy(desc(workspaceAssistantPrompts.updatedAt))
    .limit(100);
  const workspaceManager = await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]);
  return rows.map((row) => ({
    ...row,
    parameters: Array.isArray(row.parameters) ? row.parameters : [],
    canEdit:
      (row.scope === "private" && row.ownerId === actor.id) ||
      (row.scope === "workspace" && workspaceManager) ||
      (row.scope === "agency" &&
        (agencyAdmin || (row.ownerId === actor.id && row.status === "pending_approval"))),
    canPublish:
      (row.scope === "workspace" && workspaceManager) || (row.scope === "agency" && agencyAdmin),
  }));
}

export async function createAssistantPrompt(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  rawInput: AssistantPromptInput,
) {
  const input = AssistantPromptInputSchema.parse(rawInput);
  await requireAssistantAccess(actor, workspaceId);
  if (input.scope === "workspace") {
    if (!(await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]))) {
      throw new Error("workspace_assistant_prompt_forbidden");
    }
  }
  const isAdmin = await isAgencyAdmin(actor, agencyId);
  const status = input.scope === "agency" ? (isAdmin ? "published" : "pending_approval") : "draft";
  const [prompt] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(workspaceAssistantPrompts)
      .values({
        agencyId,
        ...(input.scope === "agency" ? {} : { workspaceId }),
        ownerId: actor.id,
        scope: input.scope,
        status,
        name: input.name,
        purpose: input.purpose,
        goal: input.goal,
        instructions: input.instructions,
        tags: input.tags,
        parameters: input.parameters,
        allowedContext: { values: PROMPT_CONTEXT },
        outputContract: { type: "workspace_assistant_response", version: 1 },
        ...(input.scope === "agency" && isAdmin
          ? { approvedBy: actor.id, approvedAt: new Date() }
          : {}),
      })
      .returning();
    if (!created) throw new Error("workspace_assistant_prompt_create_failed");
    await tx.insert(workspaceAssistantPromptRevisions).values({
      promptId: created.id,
      revision: 1,
      snapshot: promptSnapshot(input),
      createdBy: actor.id,
    });
    return [created];
  });
  return prompt;
}

export async function resolveAssistantPrompt(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  promptId: string,
  locale = "en",
) {
  const builtIn = getBuiltInAssistantPrompt(promptId, locale);
  if (builtIn) {
    return {
      ...builtIn,
      parameters: [],
      scope: "builtin" as const,
      status: "published" as const,
      ownerId: null,
    };
  }
  const rows = await listAssistantPrompts(actor, agencyId, workspaceId);
  const prompt = rows.find((row) => row.id === promptId);
  return prompt &&
    (prompt.status === "published" || prompt.scope === "private" || prompt.ownerId === actor.id)
    ? prompt
    : null;
}

export async function updateAssistantPrompt(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  promptId: string,
  rawInput: Omit<AssistantPromptInput, "scope">,
) {
  await requireAssistantAccess(actor, workspaceId);
  const input = assistantPromptInputSchema
    .omit({ scope: true })
    .superRefine(validatePromptParameterReferences)
    .parse(rawInput);
  const [existing] = await db
    .select()
    .from(workspaceAssistantPrompts)
    .where(
      and(
        eq(workspaceAssistantPrompts.id, promptId),
        eq(workspaceAssistantPrompts.agencyId, agencyId),
        or(
          and(
            eq(workspaceAssistantPrompts.scope, "private"),
            eq(workspaceAssistantPrompts.ownerId, actor.id),
            eq(workspaceAssistantPrompts.workspaceId, workspaceId),
          ),
          and(
            eq(workspaceAssistantPrompts.scope, "workspace"),
            eq(workspaceAssistantPrompts.workspaceId, workspaceId),
          ),
          eq(workspaceAssistantPrompts.scope, "agency"),
        ),
      ),
    )
    .limit(1);
  if (!existing) return false;
  const canEdit =
    (existing.scope === "private" && existing.ownerId === actor.id) ||
    (existing.scope === "workspace" &&
      (await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]))) ||
    (existing.scope === "agency" &&
      ((await isAgencyAdmin(actor, agencyId)) ||
        (existing.ownerId === actor.id && existing.status === "pending_approval")));
  if (!canEdit) throw new Error("workspace_assistant_prompt_forbidden");
  const revision = existing.revision + 1;
  const nextStatus = existing.scope === "agency" ? "pending_approval" : "draft";
  await db.transaction(async (tx) => {
    await tx
      .update(workspaceAssistantPrompts)
      .set({
        ...input,
        tags: input.tags,
        parameters: input.parameters,
        revision,
        status: nextStatus,
        approvedBy: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaceAssistantPrompts.id, promptId));
    await tx.insert(workspaceAssistantPromptRevisions).values({
      promptId,
      revision,
      snapshot: promptSnapshot(input),
      createdBy: actor.id,
    });
  });
  return true;
}

export async function publishAssistantPrompt(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  promptId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [prompt] = await db
    .select()
    .from(workspaceAssistantPrompts)
    .where(
      and(
        eq(workspaceAssistantPrompts.id, promptId),
        eq(workspaceAssistantPrompts.agencyId, agencyId),
      ),
    )
    .limit(1);
  if (!prompt) return false;
  if (prompt.scope === "workspace") {
    if (
      prompt.workspaceId !== workspaceId ||
      !(await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]))
    ) {
      throw new Error("workspace_assistant_prompt_forbidden");
    }
  } else if (prompt.scope === "agency") {
    if (!(await isAgencyAdmin(actor, agencyId)))
      throw new Error("workspace_assistant_prompt_forbidden");
  } else {
    throw new Error("workspace_assistant_prompt_not_shareable");
  }
  await db
    .update(workspaceAssistantPrompts)
    .set({
      status: "published",
      ...(prompt.scope === "agency" ? { approvedBy: actor.id, approvedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workspaceAssistantPrompts.id, promptId));
  return true;
}

export async function archiveAssistantPrompt(
  actor: Actor,
  agencyId: string,
  workspaceId: string,
  promptId: string,
) {
  await requireAssistantAccess(actor, workspaceId);
  const [prompt] = await db
    .select()
    .from(workspaceAssistantPrompts)
    .where(
      and(
        eq(workspaceAssistantPrompts.id, promptId),
        eq(workspaceAssistantPrompts.agencyId, agencyId),
        or(
          and(
            eq(workspaceAssistantPrompts.scope, "private"),
            eq(workspaceAssistantPrompts.ownerId, actor.id),
            eq(workspaceAssistantPrompts.workspaceId, workspaceId),
          ),
          and(
            eq(workspaceAssistantPrompts.scope, "workspace"),
            eq(workspaceAssistantPrompts.workspaceId, workspaceId),
          ),
          eq(workspaceAssistantPrompts.scope, "agency"),
        ),
      ),
    )
    .limit(1);
  if (!prompt) return false;
  const canArchive =
    (prompt.scope === "private" && prompt.ownerId === actor.id) ||
    (prompt.scope === "workspace" &&
      (await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]))) ||
    (prompt.scope === "agency" &&
      ((await isAgencyAdmin(actor, agencyId)) ||
        (prompt.ownerId === actor.id && prompt.status === "pending_approval")));
  if (!canArchive) throw new Error("workspace_assistant_prompt_forbidden");
  await db
    .update(workspaceAssistantPrompts)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaceAssistantPrompts.id, promptId));
  return true;
}

function promptSnapshot(input: Omit<AssistantPromptInput, "scope"> | AssistantPromptInput) {
  return {
    name: input.name,
    purpose: input.purpose,
    goal: input.goal,
    instructions: input.instructions,
    tags: input.tags,
    parameters: input.parameters,
  };
}

function normalizeConversationTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 160);
  return normalized || "New conversation";
}
