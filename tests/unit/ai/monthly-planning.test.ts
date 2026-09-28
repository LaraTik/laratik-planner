import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Monthly planning copilot — session lifecycle, prompt assembly, and the
 * AI proposal round-trip.
 *
 * Three contracts carry real risk here and are the reason this file exists:
 *
 *   1. **Session creation is idempotent per (workspace, month).** A second
 *      call must return the existing session rather than opening a second
 *      planning thread for the same month.
 *   2. **Proposal revisions are monotonic and keyed.** `revision` is derived
 *      from the newest stored proposal and stamped into `idempotencyKey`, so
 *      a retried generate/save cannot produce two identical revisions.
 *   3. **The provider response is fenced and validated.** Models routinely wrap
 *      JSON in ```json fences; the parser strips them, and anything that still
 *      fails `MonthlyPlanProposalSchema` must be rejected rather than stored
 *      as a partially-shaped plan.
 */

const dbMock = vi.hoisted(() => {
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  return { db: { select, insert, update } };
});
const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(),
  requirePolicy: vi.fn(),
}));
const contextMock = vi.hoisted(() => ({ loadAiContext: vi.fn() }));
const brandMock = vi.hoisted(() => ({ getBrandProfile: vi.fn() }));
const chatMock = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock("@/lib/db", () => dbMock);
vi.mock("@/lib/auth/policy", () => policyMock);
vi.mock("@/lib/ai/context", () => contextMock);
vi.mock("@/lib/brand/profile", () => brandMock);
vi.mock("@/lib/ai", () => chatMock);

import {
  approveMonthlyProposal,
  appendMonthlyMessage,
  askMonthlyPlanningCopilot,
  buildMonthlyPlanningPrompt,
  createMonthlyPlanningSession,
  generateMonthlyProposal,
  getMonthlyPlanningSession,
  MonthlyContentProposalSchema,
  MonthlyPlanProposalSchema,
  MonthlyPlanningStageSchema,
  saveMonthlyProposal,
} from "@/lib/ai/monthly-planning";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";
const AGENCY_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR = { id: "55555555-5555-4555-8555-555555555555" };

/** Fluent, awaitable Drizzle stand-in. */
function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

/** Serve `db.select` calls from a fixed queue, recording every call. */
function queueSelects(...results: unknown[]) {
  let i = 0;
  dbMock.db.select.mockImplementation(() => {
    const result = results[Math.min(i, results.length - 1)];
    i += 1;
    return makeChain(result);
  });
}

const SESSION_ROW = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  month: "2026-03",
  status: "discovery",
  sourceRevision: "1700000000000",
  createdBy: ACTOR.id,
};

const VALID_PROPOSAL = {
  version: 1 as const,
  summary: "A month of launches",
  objective: "Grow awareness",
  rows: [
    {
      title: "Launch teaser",
      format: "static_post" as const,
      plannedPublishAt: "2026-03-02T09:00:00.000Z",
      brief: "Tease the launch",
    },
  ],
  qualitySummary: { status: "strong" as const, notes: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` does not drain a pending `mockReturnValueOnce` queue; a
  // leaked entry silently shifts the next test's query dispatch.
  dbMock.db.select.mockReset();
  dbMock.db.insert.mockReset();
  dbMock.db.update.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.requirePolicy.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.requirePolicy.mockResolvedValue(undefined);
  contextMock.loadAiContext.mockResolvedValue({ channels: [] });
  brandMock.getBrandProfile.mockResolvedValue({ profile: { name: "Acme" }, revision: 3 });
  chatMock.chat.mockResolvedValue({ content: "{}" });
});

// ── Schemas ──────────────────────────────────────────────────────────────

describe("monthly planning schemas", () => {
  it("accepts every documented lifecycle stage and rejects anything else", () => {
    for (const stage of ["discovery", "strategy", "execution", "review", "applied", "archived"]) {
      expect(MonthlyPlanningStageSchema.parse(stage)).toBe(stage);
    }
    expect(() => MonthlyPlanningStageSchema.parse("planning")).toThrow();
    expect(() => MonthlyPlanningStageSchema.parse("")).toThrow();
  });

  it("applies the documented defaults to a sparse content proposal", () => {
    const parsed = MonthlyContentProposalSchema.parse({
      title: "Teaser",
      format: "carousel",
      plannedPublishAt: "2026-03-02T09:00:00.000Z",
    });
    // Defaults are load-bearing: the apply step reads them without null checks.
    expect(parsed.brief).toBe("");
    expect(parsed.channelIds).toEqual([]);
    expect(parsed.formatPayload).toEqual({ schemaVersion: 1 });
  });

  it("rejects a proposal row with a title that is too short", () => {
    expect(() =>
      MonthlyContentProposalSchema.parse({
        title: "x",
        format: "static_post",
        plannedPublishAt: "2026-03-02T09:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a channelId that is not a UUID", () => {
    // The apply step writes channelIds straight into a uuid column; a
    // non-UUID from the model would surface as a raw Postgres error later.
    expect(() =>
      MonthlyContentProposalSchema.parse({
        title: "Valid title",
        format: "static_post",
        plannedPublishAt: "2026-03-02T09:00:00.000Z",
        channelIds: ["not-a-uuid"],
      }),
    ).toThrow();
  });

  it("rejects an unknown format", () => {
    expect(() =>
      MonthlyContentProposalSchema.parse({
        title: "Valid title",
        format: "telepathy",
        plannedPublishAt: "2026-03-02T09:00:00.000Z",
      }),
    ).toThrow();
  });

  it("requires at least one row and a literal version on a plan proposal", () => {
    expect(() => MonthlyPlanProposalSchema.parse({ ...VALID_PROPOSAL, rows: [] })).toThrow();
    expect(() => MonthlyPlanProposalSchema.parse({ ...VALID_PROPOSAL, version: 2 })).toThrow();
  });

  it("defaults the optional plan sections to empty arrays", () => {
    const parsed = MonthlyPlanProposalSchema.parse(VALID_PROPOSAL);
    expect(parsed.strategicDirections).toEqual([]);
    expect(parsed.contentMix).toEqual([]);
    expect(parsed.brandKitChanges).toEqual([]);
    expect(parsed.assumptions).toEqual([]);
    expect(parsed.missingInformation).toEqual([]);
    expect(parsed.risks).toEqual([]);
  });
});

// ── createMonthlyPlanningSession ─────────────────────────────────────────

describe("createMonthlyPlanningSession", () => {
  it("rejects a month that is not YYYY-MM before touching the database", async () => {
    await expect(createMonthlyPlanningSession(ACTOR, WORKSPACE_ID, "2026-3")).rejects.toThrow(
      "Use a YYYY-MM month.",
    );
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("returns the existing session for the same workspace and month", async () => {
    // Idempotency: a second planning thread for the same month would split
    // the conversation history and orphan earlier proposals.
    queueSelects([{ id: SESSION_ID }]);
    const result = await createMonthlyPlanningSession(ACTOR, WORKSPACE_ID, "2026-03");
    expect(result).toEqual({ id: SESSION_ID });
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it("creates a session seeded with the month and English content language", async () => {
    queueSelects([]);
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return makeChain([{ id: SESSION_ID }]);
      },
    }));

    const result = await createMonthlyPlanningSession(ACTOR, WORKSPACE_ID, "2026-03");
    expect(result).toEqual({ id: SESSION_ID });
    expect(inserts[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      month: "2026-03",
      inputs: { month: "2026-03", contentLanguage: "en" },
      createdBy: ACTOR.id,
    });
  });

  it("throws when the insert returns no row", async () => {
    queueSelects([]);
    dbMock.db.insert.mockReturnValue({ values: () => makeChain([]) });
    await expect(createMonthlyPlanningSession(ACTOR, WORKSPACE_ID, "2026-03")).rejects.toThrow(
      "The monthly planning session could not be created.",
    );
  });

  it("allows both workspace_manager and content_planner to open a session", async () => {
    queueSelects([{ id: SESSION_ID }]);
    await createMonthlyPlanningSession(ACTOR, WORKSPACE_ID, "2026-03");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(ACTOR, WORKSPACE_ID, [
      "workspace_manager",
      "content_planner",
    ]);
  });
});

// ── getMonthlyPlanningSession ────────────────────────────────────────────

describe("getMonthlyPlanningSession", () => {
  it("returns null when the session does not belong to the workspace", async () => {
    queueSelects([]);
    expect(await getMonthlyPlanningSession(ACTOR, WORKSPACE_ID, SESSION_ID)).toBeNull();
    // The child collections must not be queried for a missing session.
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });

  it("returns the session with its messages and proposals", async () => {
    queueSelects(
      [SESSION_ROW],
      [{ role: "user", content: "hi" }],
      [{ id: PROPOSAL_ID, revision: 2 }],
    );
    const result = await getMonthlyPlanningSession(ACTOR, WORKSPACE_ID, SESSION_ID);
    expect(result!.session.month).toBe("2026-03");
    expect(result!.messages).toHaveLength(1);
    expect(result!.proposals[0]!.revision).toBe(2);
  });
});

// ── appendMonthlyMessage ─────────────────────────────────────────────────

describe("appendMonthlyMessage", () => {
  it("throws when the session is not visible to the workspace", async () => {
    queueSelects([]);
    await expect(
      appendMonthlyMessage(ACTOR, WORKSPACE_ID, SESSION_ID, "user", "hi"),
    ).rejects.toThrow("Monthly planning session not found.");
  });

  it("stores the message and stamps a fresh source revision on the session", async () => {
    queueSelects([SESSION_ROW], [], []);
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return makeChain([{ id: "m-1", role: "user", content: "hi" }]);
      },
    }));
    const sets: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        sets.push(payload);
        return makeChain(undefined);
      },
    }));

    const message = await appendMonthlyMessage(ACTOR, WORKSPACE_ID, SESSION_ID, "user", "hi");
    expect(message).toMatchObject({ role: "user", content: "hi" });
    expect(inserts[0]).toMatchObject({ sessionId: SESSION_ID, createdBy: ACTOR.id });
    // The source revision is what makes a cached prompt stale, so it must move.
    expect(sets[0]!.sourceRevision).toMatch(/^\d+$/);
    expect(sets[0]!.updatedAt).toBeInstanceOf(Date);
  });
});

// ── buildMonthlyPlanningPrompt ───────────────────────────────────────────

describe("buildMonthlyPlanningPrompt", () => {
  /** Session + messages + proposals + workspace row + published packs. */
  function primePrompt(messages: unknown[] = [], packs: unknown[] = []) {
    queueSelects([SESSION_ROW], messages, [], [{ agencyId: AGENCY_ID }], packs);
  }

  it("throws when the session is missing", async () => {
    queueSelects([]);
    await expect(buildMonthlyPlanningPrompt(ACTOR, WORKSPACE_ID, SESSION_ID)).rejects.toThrow(
      "Monthly planning session not found.",
    );
  });

  it("includes the month, brand profile, and the canonical planning pack", async () => {
    primePrompt();
    const prompt = await buildMonthlyPlanningPrompt(ACTOR, WORKSPACE_ID, SESSION_ID);
    expect(prompt).toContain("Month: 2026-03");
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("Canonical planning pack");
    expect(prompt).toContain("Continue by asking the next highest-value question");
  });

  it("appends the new user message when one is supplied", async () => {
    primePrompt();
    const prompt = await buildMonthlyPlanningPrompt(
      ACTOR,
      WORKSPACE_ID,
      SESSION_ID,
      "What should we post in week 1?",
    );
    expect(prompt).toContain("New user message: What should we post in week 1?");
    expect(prompt).not.toContain("Continue by asking the next highest-value question");
  });

  it("labels published packs by scope so the precedence order is readable", async () => {
    primePrompt(
      [],
      [
        { name: "Agency rules", workspaceId: null, sourceMarkdown: "agency md", manifest: {} },
        { name: "WS rules", workspaceId: WORKSPACE_ID, sourceMarkdown: "ws md", manifest: {} },
      ],
    );
    const prompt = await buildMonthlyPlanningPrompt(ACTOR, WORKSPACE_ID, SESSION_ID);
    expect(prompt).toContain("agency/Agency rules: agency md");
    expect(prompt).toContain("workspace/WS rules: ws md");
  });

  it("keeps only the most recent 20 messages in the conversation window", async () => {
    // The provider has a bounded context; an unbounded transcript silently
    // blows the token budget once a month-long thread accumulates.
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: "user",
      content: `msg-${i}`,
    }));
    primePrompt(messages);
    const prompt = await buildMonthlyPlanningPrompt(ACTOR, WORKSPACE_ID, SESSION_ID);
    expect(prompt).toContain("msg-29");
    expect(prompt).not.toContain("msg-9:");
  });

  it("skips the pack query when the workspace row cannot be resolved", async () => {
    queueSelects([SESSION_ROW], [], [], []);
    const prompt = await buildMonthlyPlanningPrompt(ACTOR, WORKSPACE_ID, SESSION_ID);
    expect(prompt).toContain("Published instruction packs");
    // 4 selects: session, messages, proposals, workspace. No pack query.
    expect(dbMock.db.select).toHaveBeenCalledTimes(4);
  });
});

// ── askMonthlyPlanningCopilot ────────────────────────────────────────────

describe("askMonthlyPlanningCopilot", () => {
  it("sends a system guard plus the assembled prompt and returns the result", async () => {
    queueSelects([SESSION_ROW], [], [], [{ agencyId: AGENCY_ID }], []);
    chatMock.chat.mockResolvedValue({ content: "What is your production reality?" });

    const result = await askMonthlyPlanningCopilot({
      apiKey: "k",
      actor: ACTOR,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      userMessage: "hello",
    });

    expect(result).toEqual({ content: "What is your production reality?" });
    const call = chatMock.chat.mock.calls[0]![0] as {
      maxTokens: number;
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.maxTokens).toBe(1600);
    // A copilot turn is exploratory, so it runs hotter than the proposal call.
    expect(call.temperature).toBeGreaterThan(0.5);
    expect(call.messages[0]!.role).toBe("system");
    expect(call.messages[0]!.content).toContain("Do not claim that database changes were made");
    expect(call.messages[1]!.content).toContain("New user message: hello");
  });

  it("forwards an abort signal when the caller supplies one", async () => {
    queueSelects([SESSION_ROW], [], [], [{ agencyId: AGENCY_ID }], []);
    const controller = new AbortController();
    await askMonthlyPlanningCopilot({
      apiKey: "k",
      actor: ACTOR,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      userMessage: "hello",
      signal: controller.signal,
    });
    const call = chatMock.chat.mock.calls[0]![0] as { signal?: AbortSignal };
    expect(call.signal).toBe(controller.signal);
  });

  it("omits the signal key entirely when none is supplied", async () => {
    // `exactOptionalPropertyTypes` means an explicit `signal: undefined` is
    // not the same as an absent key; the spread must not add it.
    queueSelects([SESSION_ROW], [], [], [{ agencyId: AGENCY_ID }], []);
    await askMonthlyPlanningCopilot({
      apiKey: "k",
      actor: ACTOR,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      userMessage: "hello",
    });
    expect(chatMock.chat.mock.calls[0]![0]).not.toHaveProperty("signal");
  });
});

// ── generateMonthlyProposal ──────────────────────────────────────────────

describe("generateMonthlyProposal", () => {
  function prime() {
    queueSelects([SESSION_ROW], [], [], [{ agencyId: AGENCY_ID }], []);
  }

  it("strips a fenced json block before parsing", async () => {
    prime();
    chatMock.chat.mockResolvedValue({
      content: "```json\n" + JSON.stringify(VALID_PROPOSAL) + "\n```",
    });

    const { proposal } = await generateMonthlyProposal({
      apiKey: "k",
      actor: ACTOR,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
    });
    expect(proposal.rows).toHaveLength(1);
    expect(proposal.summary).toBe("A month of launches");
  });

  it("parses an unfenced payload too", async () => {
    prime();
    chatMock.chat.mockResolvedValue({ content: JSON.stringify(VALID_PROPOSAL) });
    const { proposal } = await generateMonthlyProposal({
      apiKey: "k",
      actor: ACTOR,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
    });
    expect(proposal.version).toBe(1);
  });

  it("throws when the provider returns nothing", async () => {
    prime();
    chatMock.chat.mockResolvedValue(null);
    await expect(
      generateMonthlyProposal({
        apiKey: "k",
        actor: ACTOR,
        workspaceId: WORKSPACE_ID,
        sessionId: SESSION_ID,
      }),
    ).rejects.toThrow("The AI provider returned no proposal.");
  });

  it("throws a typed error when the response is not JSON at all", async () => {
    prime();
    chatMock.chat.mockResolvedValue({ content: "I am afraid I cannot do that." });
    await expect(
      generateMonthlyProposal({
        apiKey: "k",
        actor: ACTOR,
        workspaceId: WORKSPACE_ID,
        sessionId: SESSION_ID,
      }),
    ).rejects.toThrow("The AI response was not valid proposal JSON.");
  });

  it("rejects a well-formed JSON proposal that violates the contract", async () => {
    // Well-formed JSON is not the same as a valid plan: a missing `rows`
    // array must be rejected here, not half-applied downstream.
    prime();
    chatMock.chat.mockResolvedValue({ content: JSON.stringify({ version: 1, summary: "x" }) });
    await expect(
      generateMonthlyProposal({
        apiKey: "k",
        actor: ACTOR,
        workspaceId: WORKSPACE_ID,
        sessionId: SESSION_ID,
      }),
    ).rejects.toThrow();
  });

  it("asks for a colder, larger completion than the copilot turn", async () => {
    prime();
    chatMock.chat.mockResolvedValue({ content: JSON.stringify(VALID_PROPOSAL) });
    await generateMonthlyProposal({
      apiKey: "k",
      actor: ACTOR,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
    });
    const call = chatMock.chat.mock.calls[0]![0] as {
      maxTokens: number;
      temperature: number;
      messages: Array<{ content: string }>;
    };
    expect(call.maxTokens).toBe(6000);
    expect(call.temperature).toBeLessThan(0.5);
    expect(call.messages[0]!.content).toContain("Do not write to any system");
  });
});

// ── saveMonthlyProposal ──────────────────────────────────────────────────

describe("saveMonthlyProposal", () => {
  const proposal = MonthlyPlanProposalSchema.parse(VALID_PROPOSAL);

  it("increments the revision from the newest stored proposal", async () => {
    queueSelects([SESSION_ROW], [], [{ id: PROPOSAL_ID, revision: 4 }]);
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return makeChain([{ id: PROPOSAL_ID, revision: 5 }]);
      },
    }));
    const sets: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        sets.push(payload);
        return makeChain(undefined);
      },
    }));

    const saved = await saveMonthlyProposal(ACTOR, WORKSPACE_ID, SESSION_ID, proposal);
    expect(saved).toEqual({ id: PROPOSAL_ID, revision: 5 });
    expect(inserts[0]!.revision).toBe(5);
    // The idempotency key must pin the exact revision so a retried save of
    // the same generation cannot create a duplicate.
    expect(inserts[0]!.idempotencyKey).toBe(`${SESSION_ID}:5`);
    expect(inserts[0]!.sourceRevision).toContain("profile-3");
    // A newly saved proposal parks the session in review.
    expect(sets[0]!.status).toBe("review");
  });

  it("starts at revision 1 when no proposal exists yet", async () => {
    queueSelects([SESSION_ROW], [], []);
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return makeChain([{ id: PROPOSAL_ID, revision: 1 }]);
      },
    }));
    dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));

    await saveMonthlyProposal(ACTOR, WORKSPACE_ID, SESSION_ID, proposal);
    expect(inserts[0]!.revision).toBe(1);
    expect(inserts[0]!.idempotencyKey).toBe(`${SESSION_ID}:1`);
  });

  it("falls back to profile revision 0 when the brand profile is missing", async () => {
    brandMock.getBrandProfile.mockResolvedValue(null);
    queueSelects([SESSION_ROW], [], []);
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return makeChain([{ id: PROPOSAL_ID, revision: 1 }]);
      },
    }));
    dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));

    await saveMonthlyProposal(ACTOR, WORKSPACE_ID, SESSION_ID, proposal);
    expect(inserts[0]!.sourceRevision).toContain("profile-0");
  });

  it("throws when the session is missing", async () => {
    queueSelects([]);
    await expect(saveMonthlyProposal(ACTOR, WORKSPACE_ID, SESSION_ID, proposal)).rejects.toThrow(
      "Monthly planning session not found.",
    );
  });

  it("throws when the insert returns no row", async () => {
    queueSelects([SESSION_ROW], [], []);
    dbMock.db.insert.mockReturnValue({ values: () => makeChain([]) });
    await expect(saveMonthlyProposal(ACTOR, WORKSPACE_ID, SESSION_ID, proposal)).rejects.toThrow(
      "The proposal could not be saved.",
    );
  });
});

// ── approveMonthlyProposal ───────────────────────────────────────────────

describe("approveMonthlyProposal", () => {
  it("marks the proposal approved", async () => {
    queueSelects([{ id: PROPOSAL_ID, sessionId: SESSION_ID }]);
    const sets: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        sets.push(payload);
        return makeChain(undefined);
      },
    }));

    await approveMonthlyProposal(ACTOR, WORKSPACE_ID, PROPOSAL_ID);
    expect(sets[0]!.status).toBe("approved");
    expect(sets[0]!.updatedAt).toBeInstanceOf(Date);
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(ACTOR, WORKSPACE_ID, [
      "workspace_manager",
      "content_planner",
    ]);
  });

  it("throws when the proposal is not in this workspace", async () => {
    // The join is the tenant boundary: a proposal from another workspace must
    // not be approvable by id alone.
    queueSelects([]);
    await expect(approveMonthlyProposal(ACTOR, WORKSPACE_ID, PROPOSAL_ID)).rejects.toThrow(
      "Proposal not found.",
    );
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });
});
