import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * FEAT-09 — `src/lib/ai/context.ts` direct coverage.
 *
 * The downstream consumer is exercised by
 * `tests/unit/ai-improve-brief-feats.test.ts` (it confirms the
 * `improveBrief` / `draftCaption` prompts respect the `context`
 * argument), but the loader itself — `loadAiContext` and
 * `isContextMeaningful` — had 0% coverage after FEAT-09 landed,
 * dragging the `src/lib/ai/**` per-glob threshold from 85% to
 * 83.8% and failing the CI `Coverage` step on 2026-08-26.
 *
 * Each test below pins one branch of the loader's selection
 * bitmask so a future change that drops a `selection.X` guard,
 * forgets to slice `brief` to 240 chars, or mis-buckets a
 * `brandVoiceRules.ruleType` is caught in unit tests instead of
 * at the audit-log level.
 *
 * The DB is mocked via a hand-rolled Drizzle chainable — the
 * same pattern used in `tests/unit/notifications-dispatch.test.ts`.
 */

type DrizzleState = {
  selectResults: unknown[][];
  selectCalls: number;
};

let state: DrizzleState;

function makeSelectChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  // After `orderBy` the chain forks:
  //   - non-limited branches: `.then((rows) => ...)` directly
  //   - limited branches:     `.limit(N).then((rows) => ...)`
  // Both consume exactly one result from `state.selectResults`.
  chain.orderBy = vi.fn(() => {
    const thenable = {
      then: (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []),
      limit: vi.fn(() => Promise.resolve(state.selectResults.shift() ?? [])),
    };
    return thenable;
  });
  return chain;
}

const dbMock = {
  select: vi.fn(() => {
    state.selectCalls += 1;
    return makeSelectChain();
  }),
  get state() {
    return state;
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

const { loadAiContext, isContextMeaningful, EMPTY_CONTEXT } = await import("@/lib/ai/context");

beforeEach(() => {
  state = { selectResults: [], selectCalls: 0 };
});

describe("EMPTY_CONTEXT", () => {
  it("is a well-formed empty AiContext", () => {
    expect(EMPTY_CONTEXT).toEqual({
      brandVoice: { tone: [], do: [], dont: [] },
      campaign: null,
      pillars: [],
      channels: [],
      approvedContentSamples: [],
    });
  });

  it("is the value loadAiContext returns for an empty selection", async () => {
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: {},
    });
    expect(out).toEqual(EMPTY_CONTEXT);
    expect(state.selectCalls).toBe(0);
  });
});

describe("isContextMeaningful", () => {
  it("returns false when every branch is empty", () => {
    expect(isContextMeaningful(EMPTY_CONTEXT)).toBe(false);
  });

  it("returns true when brandVoice.tone is non-empty", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        brandVoice: { tone: ["warm"], do: [], dont: [] },
      }),
    ).toBe(true);
  });

  it("returns true when brandVoice.do is non-empty", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        brandVoice: { tone: [], do: ["lead with the customer"], dont: [] },
      }),
    ).toBe(true);
  });

  it("returns true when brandVoice.dont is non-empty", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        brandVoice: { tone: [], do: [], dont: ["jargon"] },
      }),
    ).toBe(true);
  });

  it("returns true when campaign is set (even with null objective/description)", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        campaign: { name: "Spring 2026", objective: null, description: null },
      }),
    ).toBe(true);
  });

  it("returns true when pillars is non-empty", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        pillars: [{ name: "Education", description: null }],
      }),
    ).toBe(true);
  });

  it("returns true when channels is non-empty", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        channels: [{ platform: "instagram", accountName: "@main" }],
      }),
    ).toBe(true);
  });

  it("returns true when approvedContentSamples is non-empty", () => {
    expect(
      isContextMeaningful({
        ...EMPTY_CONTEXT,
        approvedContentSamples: [{ title: "Past win", brief: null }],
      }),
    ).toBe(true);
  });
});

describe("loadAiContext — brandKit branch", () => {
  it("buckets brandVoiceRules rows into tone / do / dont", async () => {
    state.selectResults.push([
      { ruleType: "tone", content: "warm, never corporate" },
      { ruleType: "do", content: "lead with the customer" },
      { ruleType: "dont", content: "use jargon" },
    ]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { brandKit: true },
    });
    expect(out.brandVoice).toEqual({
      tone: ["warm, never corporate"],
      do: ["lead with the customer"],
      dont: ["use jargon"],
    });
  });

  it("drops rows whose ruleType is not tone / do / dont", async () => {
    state.selectResults.push([
      { ruleType: "tone", content: "warm" },
      { ruleType: "weird", content: "should be ignored" },
    ]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { brandKit: true },
    });
    expect(out.brandVoice).toEqual({ tone: ["warm"], do: [], dont: [] });
  });

  it("makes no DB call when brandKit is false in the selection", async () => {
    await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { campaign: true },
    });
    expect(state.selectCalls).toBe(1);
  });
});

describe("loadAiContext — campaign branch", () => {
  it("uses the first row from the limited query", async () => {
    state.selectResults.push([
      { name: "Spring 2026", objective: "drive trial signups", description: "trial push" },
    ]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { campaign: true },
    });
    expect(out.campaign).toEqual({
      name: "Spring 2026",
      objective: "drive trial signups",
      description: "trial push",
    });
  });

  it("leaves campaign as null when the query returns no rows", async () => {
    state.selectResults.push([]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { campaign: true },
    });
    expect(out.campaign).toBeNull();
  });
});

describe("loadAiContext — pillars branch", () => {
  it("maps the rows to { name, description } pairs", async () => {
    state.selectResults.push([
      { name: "Education", description: "teach the user" },
      { name: "Promotion", description: null },
    ]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { pillars: true },
    });
    expect(out.pillars).toEqual([
      { name: "Education", description: "teach the user" },
      { name: "Promotion", description: null },
    ]);
  });
});

describe("loadAiContext — channels branch", () => {
  it("maps the rows to { platform, accountName } pairs", async () => {
    state.selectResults.push([
      { platform: "instagram", accountName: "@main" },
      { platform: "tiktok", accountName: "@main" },
    ]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { channels: true },
    });
    expect(out.channels).toEqual([
      { platform: "instagram", accountName: "@main" },
      { platform: "tiktok", accountName: "@main" },
    ]);
  });
});

describe("loadAiContext — approvedContent branch", () => {
  it("slices briefs to 240 chars and preserves null briefs", async () => {
    const longBrief = "x".repeat(300);
    state.selectResults.push([
      { title: "First", brief: "short brief" },
      { title: "Second", brief: longBrief },
      { title: "Third", brief: null },
    ]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { approvedContent: true },
    });
    expect(out.approvedContentSamples).toEqual([
      { title: "First", brief: "short brief" },
      { title: "Second", brief: "x".repeat(240) },
      { title: "Third", brief: null },
    ]);
  });

  it("does not slice briefs that are exactly 240 chars", async () => {
    const exact = "y".repeat(240);
    state.selectResults.push([{ title: "X", brief: exact }]);
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: { approvedContent: true },
    });
    expect(out.approvedContentSamples[0]?.brief).toBe(exact);
    expect(out.approvedContentSamples[0]?.brief).toHaveLength(240);
  });
});

describe("loadAiContext — fully checked selection", () => {
  it("runs every branch in parallel and merges the results", async () => {
    state.selectResults.push(
      [{ ruleType: "tone", content: "warm" }], // brandKit
      [{ name: "Spring", objective: "trials", description: null }], // campaign
      [{ name: "Education", description: null }], // pillars
      [{ platform: "instagram", accountName: "@main" }], // channels
      [{ title: "Past win", brief: "did well" }], // approvedContent
    );
    const out = await loadAiContext({
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      selection: {
        brandKit: true,
        campaign: true,
        pillars: true,
        channels: true,
        approvedContent: true,
      },
    });
    expect(state.selectCalls).toBe(5);
    expect(out.brandVoice.tone).toEqual(["warm"]);
    expect(out.campaign?.name).toBe("Spring");
    expect(out.pillars).toEqual([{ name: "Education", description: null }]);
    expect(out.channels).toEqual([{ platform: "instagram", accountName: "@main" }]);
    expect(out.approvedContentSamples).toEqual([{ title: "Past win", brief: "did well" }]);
  });
});
