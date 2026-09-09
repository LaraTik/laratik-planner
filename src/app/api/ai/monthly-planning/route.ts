import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  aiFeatureSettings,
  monthlyPlanningSessions,
  planningProposals,
  workspaces,
} from "@/lib/db/schema";
import { getActiveApiKey } from "@/lib/ai";
import { loadEnabledCapabilities, enforceAiBudget, reconcileAiBudget } from "@/lib/ai/governance";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { getBrandProfile } from "@/lib/brand/profile";
import {
  MonthlyPlanProposalSchema,
  appendMonthlyMessage,
  askMonthlyPlanningCopilot,
  approveMonthlyProposal,
  generateMonthlyProposal,
  getMonthlyPlanningSession,
  saveMonthlyProposal,
} from "@/lib/ai/monthly-planning";
import { batchCreateContentItems } from "@/lib/content/service";
import { BatchCreateSchema } from "@/lib/content/batch";
import { parseBatchDateTime } from "@/lib/content/batch";
import { randomUUID } from "node:crypto";

const Body = z.object({
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  action: z.enum(["message", "generateProposal", "approve", "apply"]),
  message: z.string().trim().max(8000).optional(),
  proposalId: z.string().uuid().optional(),
});

function streamText(text: string, payload: Record<string, unknown> = {}) {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,80}/gs) ?? [text];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, ...payload })}\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      ...mutatingApiHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor)
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid planning request" },
      { status: 400, headers: mutatingApiHeaders() },
    );

  const workspace = await db
    .select({ id: workspaces.id, timezone: workspaces.timezone, agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data.workspaceId))
    .limit(1)
    .then((rows) => rows[0]);
  if (
    !workspace ||
    !(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const current = await getMonthlyPlanningSession(actor, workspace.id, parsed.data.sessionId);
  if (!current)
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404, headers: mutatingApiHeaders() },
    );

  if (parsed.data.action === "approve") {
    if (!parsed.data.proposalId)
      return NextResponse.json(
        { error: "proposalId is required" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    await approveMonthlyProposal(actor, workspace.id, parsed.data.proposalId);
    return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
  }

  if (parsed.data.action === "apply") {
    if (!parsed.data.proposalId)
      return NextResponse.json(
        { error: "proposalId is required" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    const proposalRow = current.proposals.find(
      (proposal) => proposal.id === parsed.data.proposalId,
    );
    if (proposalRow?.status === "applied") {
      return NextResponse.json(
        { ok: true, created: proposalRow.appliedContentIds.length, idempotent: true },
        { headers: mutatingApiHeaders() },
      );
    }
    if (!proposalRow || proposalRow.status !== "approved")
      return NextResponse.json(
        { error: "Approve the proposal before applying it." },
        { status: 409, headers: mutatingApiHeaders() },
      );
    const profile = await getBrandProfile(workspace.id);
    const expectedSource = `${current.session.sourceRevision}:profile-${profile?.revision ?? 0}`;
    if (proposalRow.sourceRevision !== expectedSource) {
      await db
        .update(planningProposals)
        .set({ status: "stale", updatedAt: new Date() })
        .where(eq(planningProposals.id, proposalRow.id));
      return NextResponse.json(
        { error: "This proposal is stale. Refresh it after the planning context changes." },
        { status: 409, headers: mutatingApiHeaders() },
      );
    }
    const proposal = MonthlyPlanProposalSchema.parse(proposalRow.proposal);
    const items = proposal.rows.map((row) => ({
      title: row.title,
      format: row.format,
      brief: row.brief,
      channelIds: row.channelIds,
      formatPayload: row.formatPayload,
      plannedPublishAt:
        parseBatchDateTime(row.plannedPublishAt, workspace.timezone) ?? new Date(NaN),
    }));
    const validated = BatchCreateSchema.safeParse({ workspaceId: workspace.id, items });
    if (!validated.success || items.some((item) => Number.isNaN(item.plannedPublishAt.getTime())))
      return NextResponse.json(
        { error: "The proposal contains invalid dates or content." },
        { status: 422, headers: mutatingApiHeaders() },
      );
    const [claimed] = await db
      .update(planningProposals)
      .set({ status: "applying", updatedAt: new Date() })
      .where(
        and(eq(planningProposals.id, proposalRow.id), eq(planningProposals.status, "approved")),
      )
      .returning({ id: planningProposals.id });
    if (!claimed) {
      const [latest] = await db
        .select({
          status: planningProposals.status,
          appliedContentIds: planningProposals.appliedContentIds,
        })
        .from(planningProposals)
        .where(eq(planningProposals.id, proposalRow.id))
        .limit(1);
      if (latest?.status === "applied")
        return NextResponse.json(
          { ok: true, created: latest.appliedContentIds.length, idempotent: true },
          { headers: mutatingApiHeaders() },
        );
      return NextResponse.json(
        { error: "This proposal is already being applied. Try again shortly." },
        { status: 409, headers: mutatingApiHeaders() },
      );
    }
    let createdIds: string[];
    try {
      createdIds = await batchCreateContentItems(actor, validated.data);
    } catch (error) {
      await db
        .update(planningProposals)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(planningProposals.id, proposalRow.id));
      throw error;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(planningProposals)
        .set({
          status: "applied",
          appliedContentIds: createdIds,
          appliedAt: new Date(),
          appliedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(planningProposals.id, proposalRow.id));
      await tx
        .update(monthlyPlanningSessions)
        .set({ status: "applied", updatedAt: new Date() })
        .where(eq(monthlyPlanningSessions.id, current.session.id));
    });
    return NextResponse.json(
      { ok: true, created: items.length },
      { headers: mutatingApiHeaders() },
    );
  }

  const ctx = await resolveActiveAgencyContext({ actor });
  if (!ctx || ctx.agencyId !== workspace.agencyId)
    return NextResponse.json(
      { error: "Agency context unavailable" },
      { status: 409, headers: mutatingApiHeaders() },
    );
  const [feature, capabilities] = await Promise.all([
    db
      .select()
      .from(aiFeatureSettings)
      .where(eq(aiFeatureSettings.agencyId, workspace.agencyId))
      .limit(1)
      .then((rows) => rows[0]),
    loadEnabledCapabilities(workspace.agencyId),
  ]);
  if (!feature?.enabled)
    return NextResponse.json(
      { error: "AI planning is not configured for this agency." },
      { status: 503, headers: mutatingApiHeaders() },
    );
  if (
    !capabilities.has("monthly_planning_copilot") ||
    !feature.enabledCapabilities.includes("monthly_planning_copilot")
  )
    return NextResponse.json(
      { error: "Monthly planning copilot is disabled in agency settings." },
      { status: 403, headers: mutatingApiHeaders() },
    );
  const requestHeaderId = req.headers.get("x-request-id");
  const limit = await enforceRateLimit({
    scope: "ai_generation",
    subject: actor.id,
    actorId: actor.id,
    ...(requestHeaderId ? { requestId: requestHeaderId } : {}),
  });
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Too many AI requests. Try again shortly." },
      {
        status: 429,
        headers: { ...mutatingApiHeaders(), "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  const apiKey = await getActiveApiKey(workspace.agencyId);
  if (!apiKey)
    return NextResponse.json(
      { error: "AI provider key is not configured." },
      { status: 503, headers: mutatingApiHeaders() },
    );

  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const estimatedInput = parsed.data.action === "generateProposal" ? 5000 : 1800;
  const estimatedOutput = parsed.data.action === "generateProposal" ? 6000 : 1600;
  const reservation = await db.transaction((tx) =>
    enforceAiBudget({
      tx,
      agencyId: workspace.agencyId,
      userId: actor.id,
      capability: "monthly_planning_copilot",
      estimatedInputTokens: estimatedInput,
      estimatedOutputTokens: estimatedOutput,
      requestId,
    }),
  );

  try {
    if (parsed.data.action === "message") {
      const message = parsed.data.message?.trim();
      if (!message)
        return NextResponse.json(
          { error: "Message is required" },
          { status: 400, headers: mutatingApiHeaders() },
        );
      await appendMonthlyMessage(actor, workspace.id, current.session.id, "user", message);
      const result = await askMonthlyPlanningCopilot({
        apiKey,
        actor,
        workspaceId: workspace.id,
        sessionId: current.session.id,
        userMessage: message,
        signal: req.signal,
      });
      if (!result) throw new Error("AI returned no response");
      await appendMonthlyMessage(
        actor,
        workspace.id,
        current.session.id,
        "assistant",
        result.content,
      );
      await reconcileAiBudget({
        agencyId: workspace.agencyId,
        userId: actor.id,
        estimatedInputTokens: reservation.estimatedInputTokens,
        estimatedOutputTokens: reservation.estimatedOutputTokens,
        actualInputTokens: result.inputTokens ?? estimatedInput,
        actualOutputTokens: result.outputTokens ?? estimatedOutput,
      });
      return streamText(result.content);
    }
    const generated = await generateMonthlyProposal({
      apiKey,
      actor,
      workspaceId: workspace.id,
      sessionId: current.session.id,
      signal: req.signal,
    });
    const saved = await saveMonthlyProposal(
      actor,
      workspace.id,
      current.session.id,
      generated.proposal,
    );
    await reconcileAiBudget({
      agencyId: workspace.agencyId,
      userId: actor.id,
      estimatedInputTokens: reservation.estimatedInputTokens,
      estimatedOutputTokens: reservation.estimatedOutputTokens,
      actualInputTokens: generated.result?.inputTokens ?? estimatedInput,
      actualOutputTokens: generated.result?.outputTokens ?? estimatedOutput,
    });
    return NextResponse.json(
      { ok: true, proposal: generated.proposal, proposalId: saved.id, revision: saved.revision },
      { headers: mutatingApiHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The AI planning request failed." },
      { status: 502, headers: mutatingApiHeaders() },
    );
  }
}
