import "server-only";

import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  monthlyPlanningMessages,
  monthlyPlanningSessions,
  planningInstructionPacks,
  planningProposals,
  workspaces,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { loadAiContext } from "@/lib/ai/context";
import { getBrandProfile } from "@/lib/brand/profile";
import { chat, type ChatResult } from "@/lib/ai";
import { CANONICAL_PLANNING_PACK } from "./default-planning-pack";

export const MonthlyPlanningStageSchema = z.enum([
  "discovery",
  "strategy",
  "execution",
  "review",
  "applied",
  "archived",
]);
export type MonthlyPlanningStage = z.infer<typeof MonthlyPlanningStageSchema>;

export const MonthlyContentProposalSchema = z.object({
  title: z.string().trim().min(2).max(200),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]),
  plannedPublishAt: z.string().min(1),
  brief: z.string().max(2000).default(""),
  channelIds: z.array(z.string().uuid()).default([]),
  formatPayload: z.record(z.unknown()).default({ schemaVersion: 1 }),
  objective: z.string().max(500).optional(),
  paidRecommendation: z.string().max(1000).optional(),
  productionMethod: z.string().max(1000).optional(),
  approvalNotes: z.string().max(1000).optional(),
});
export type MonthlyContentProposal = z.infer<typeof MonthlyContentProposalSchema>;

export const MonthlyPlanProposalSchema = z.object({
  version: z.literal(1),
  summary: z.string().max(4000),
  objective: z.string().max(1000),
  strategicDirections: z
    .array(
      z.object({
        name: z.string().max(200),
        explanation: z.string().max(1000),
        recommendation: z.boolean().default(false),
      }),
    )
    .max(3)
    .default([]),
  contentMix: z
    .array(
      z.object({
        type: z.string().max(120),
        count: z.number().int().min(0).max(50),
        reason: z.string().max(500),
      }),
    )
    .max(20)
    .default([]),
  rows: z.array(MonthlyContentProposalSchema).min(1).max(50),
  brandKitChanges: z
    .array(
      z.object({
        kind: z.enum(["voice", "publishing", "profile"]),
        title: z.string().max(200),
        content: z.string().max(2000),
      }),
    )
    .max(20)
    .default([]),
  assumptions: z.array(z.string().max(500)).max(20).default([]),
  missingInformation: z.array(z.string().max(500)).max(20).default([]),
  risks: z.array(z.string().max(500)).max(20).default([]),
  qualitySummary: z.object({
    status: z.enum(["strong", "revise"]),
    notes: z.array(z.string().max(500)).max(20).default([]),
  }),
});
export type MonthlyPlanProposal = z.infer<typeof MonthlyPlanProposalSchema>;

export async function createMonthlyPlanningSession(
  actor: Actor,
  workspaceId: string,
  month: string,
): Promise<{ id: string }> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Use a YYYY-MM month.");
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "create_monthly_planning_session",
  );
  const [existing] = await db
    .select({ id: monthlyPlanningSessions.id })
    .from(monthlyPlanningSessions)
    .where(
      and(
        eq(monthlyPlanningSessions.workspaceId, workspaceId),
        eq(monthlyPlanningSessions.month, month),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(monthlyPlanningSessions)
    .values({
      workspaceId,
      month,
      inputs: { month, contentLanguage: "en" },
      createdBy: actor.id,
    })
    .returning({ id: monthlyPlanningSessions.id });
  if (!created) throw new Error("The monthly planning session could not be created.");
  return created;
}

export async function getMonthlyPlanningSession(actor: Actor, workspaceId: string, id: string) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "view_monthly_planning_session",
  );
  const [session] = await db
    .select()
    .from(monthlyPlanningSessions)
    .where(
      and(eq(monthlyPlanningSessions.id, id), eq(monthlyPlanningSessions.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!session) return null;
  const [messages, proposals] = await Promise.all([
    db
      .select()
      .from(monthlyPlanningMessages)
      .where(eq(monthlyPlanningMessages.sessionId, id))
      .orderBy(asc(monthlyPlanningMessages.createdAt)),
    db
      .select()
      .from(planningProposals)
      .where(eq(planningProposals.sessionId, id))
      .orderBy(desc(planningProposals.revision)),
  ]);
  return { session, messages, proposals };
}

export async function appendMonthlyMessage(
  actor: Actor,
  workspaceId: string,
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
) {
  const current = await getMonthlyPlanningSession(actor, workspaceId, sessionId);
  if (!current) throw new Error("Monthly planning session not found.");
  const [message] = await db
    .insert(monthlyPlanningMessages)
    .values({ sessionId, role, content, createdBy: actor.id })
    .returning();
  await db
    .update(monthlyPlanningSessions)
    .set({ sourceRevision: `${Date.now()}`, updatedAt: new Date() })
    .where(eq(monthlyPlanningSessions.id, sessionId));
  return message;
}

export async function buildMonthlyPlanningPrompt(
  actor: Actor,
  workspaceId: string,
  sessionId: string,
  userMessage?: string,
) {
  const current = await getMonthlyPlanningSession(actor, workspaceId, sessionId);
  if (!current) throw new Error("Monthly planning session not found.");
  const profile = await getBrandProfile(workspaceId);
  const context = await loadAiContext({
    workspaceId,
    contentItemId: "00000000-0000-0000-0000-000000000000",
    selection: {
      brandKit: true,
      brandVisuals: true,
      campaign: true,
      pillars: true,
      channels: true,
      approvedContent: true,
    },
  });
  const [workspaceRow] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const packs = workspaceRow
    ? await db
        .select({
          name: planningInstructionPacks.name,
          workspaceId: planningInstructionPacks.workspaceId,
          sourceMarkdown: planningInstructionPacks.sourceMarkdown,
          manifest: planningInstructionPacks.manifest,
        })
        .from(planningInstructionPacks)
        .where(
          and(
            eq(planningInstructionPacks.status, "published"),
            eq(planningInstructionPacks.agencyId, workspaceRow.agencyId),
            or(
              isNull(planningInstructionPacks.workspaceId),
              eq(planningInstructionPacks.workspaceId, workspaceId),
            ),
          ),
        )
        .orderBy(
          asc(planningInstructionPacks.workspaceId),
          desc(planningInstructionPacks.updatedAt),
        )
        .limit(10)
    : [];
  const history = current.messages
    .slice(-20)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  return [
    "You are a senior social-media planning copilot. Work in stages: Discovery, Strategy, Execution, Review. Ask prioritized questions when blocking information is missing. Never invent facts. Return practical, specific work in the user's interface/content language.",
    `Month: ${current.session.month}`,
    `Brand profile: ${JSON.stringify(profile?.profile ?? {})}`,
    `Context: ${JSON.stringify(context)}`,
    `Canonical planning pack (${CANONICAL_PLANNING_PACK.precedence}): ${JSON.stringify(CANONICAL_PLANNING_PACK.manifest)}`,
    `Canonical editorial summary: ${CANONICAL_PLANNING_PACK.sourceSummary}`,
    `Published instruction packs (canonical first, workspace overrides after): ${packs.map((pack) => `${pack.workspaceId ? "workspace" : "agency"}/${pack.name}: ${pack.sourceMarkdown.slice(0, 4000)}`).join("\n")}`,
    `Conversation:\n${history}`,
    userMessage
      ? `New user message: ${userMessage}`
      : "Continue by asking the next highest-value question or summarize the current decision.",
  ].join("\n\n");
}

export async function askMonthlyPlanningCopilot(input: {
  apiKey: string;
  actor: Actor;
  workspaceId: string;
  sessionId: string;
  userMessage: string;
  signal?: AbortSignal;
}): Promise<ChatResult | null> {
  const prompt = await buildMonthlyPlanningPrompt(
    input.actor,
    input.workspaceId,
    input.sessionId,
    input.userMessage,
  );
  return chat({
    apiKey: input.apiKey,
    maxTokens: 1600,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: "Return only the assistant message. Do not claim that database changes were made.",
      },
      { role: "user", content: prompt },
    ],
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

export async function generateMonthlyProposal(input: {
  apiKey: string;
  actor: Actor;
  workspaceId: string;
  sessionId: string;
  signal?: AbortSignal;
}): Promise<{ proposal: MonthlyPlanProposal; result: ChatResult | null }> {
  const prompt = await buildMonthlyPlanningPrompt(input.actor, input.workspaceId, input.sessionId);
  const result = await chat({
    apiKey: input.apiKey,
    maxTokens: 6000,
    temperature: 0.45,
    messages: [
      {
        role: "system",
        content:
          "Return ONLY valid JSON matching this shape: {version:1,summary,objective,strategicDirections:[{name,explanation,recommendation}],contentMix:[{type,count,reason}],rows:[{title,format,plannedPublishAt,brief,channelIds,formatPayload,objective,paidRecommendation,productionMethod,approvalNotes}],brandKitChanges:[{kind,title,content}],assumptions,missingInformation,risks,qualitySummary:{status,notes}}. Use UUID channelIds only when provided in context. Do not invent UUIDs. Do not write to any system.",
      },
      { role: "user", content: prompt },
    ],
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!result) throw new Error("The AI provider returned no proposal.");
  const jsonText = result.content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText);
  } catch {
    throw new Error("The AI response was not valid proposal JSON.");
  }
  return { proposal: MonthlyPlanProposalSchema.parse(decoded), result };
}

export async function saveMonthlyProposal(
  actor: Actor,
  workspaceId: string,
  sessionId: string,
  proposal: MonthlyPlanProposal,
) {
  const current = await getMonthlyPlanningSession(actor, workspaceId, sessionId);
  if (!current) throw new Error("Monthly planning session not found.");
  const nextRevision = (current.proposals[0]?.revision ?? 0) + 1;
  const sourceRevision = `${current.session.sourceRevision}:profile-${(await getBrandProfile(workspaceId))?.revision ?? 0}`;
  const [saved] = await db
    .insert(planningProposals)
    .values({
      sessionId,
      revision: nextRevision,
      proposal,
      sourceRevision,
      idempotencyKey: `${sessionId}:${nextRevision}`,
      createdBy: actor.id,
    })
    .returning({ id: planningProposals.id, revision: planningProposals.revision });
  if (!saved) throw new Error("The proposal could not be saved.");
  await db
    .update(monthlyPlanningSessions)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(monthlyPlanningSessions.id, sessionId));
  return saved;
}

export async function approveMonthlyProposal(
  actor: Actor,
  workspaceId: string,
  proposalId: string,
) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "approve_monthly_planning_proposal",
  );
  const [proposal] = await db
    .select({ id: planningProposals.id, sessionId: planningProposals.sessionId })
    .from(planningProposals)
    .innerJoin(monthlyPlanningSessions, eq(monthlyPlanningSessions.id, planningProposals.sessionId))
    .where(
      and(
        eq(planningProposals.id, proposalId),
        eq(monthlyPlanningSessions.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!proposal) throw new Error("Proposal not found.");
  await db
    .update(planningProposals)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(planningProposals.id, proposalId));
}
