import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for `src/lib/ai/feature-settings.ts` (the new
 * per-agency AI configuration service added in c890706).
 *
 * The module's contract is:
 *   - getAiFeatureSettings()         — read the row, key by active agency
 *   - getMonthlyUsage(days)          — aggregate ai_usage_event
 *   - updateAiFeatureSettings(...)   — policy-gated upsert
 *   - testAiConnection(...)          — policy-gated live probe
 *
 * DB calls go through `@/lib/db` (Drizzle). We mock the chainable
 * Drizzle surface so the tests can:
 *   - Queue select results (so the function can await `.limit()` /
 *     `.orderBy().limit()` / a thenable `.orderBy()` / `.groupBy()`);
 *   - Capture insert/update calls for contract assertions.
 *
 * The policy module is partially mocked: `requirePolicy`,
 * `PermissionDeniedError`, and the `Actor` type come from the real
 * module (so the SUT's actual flow is exercised). `firstAgencyForBootstrap` and
 * `isAgencyAdmin` are stubbed so we can flip the auth outcome.
 */

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
};

/**
 * Drain the next queued result (used by terminal await points).
 */
function dequeue(state: DrizzleState): unknown[] {
  return state.selectResults.shift() ?? [];
}

function makeDrizzleMock(state: DrizzleState) {
  // Each `.from(table)` returns a chain that is also thenable. The
  // terminal await points exercised by the SUT are:
  //   - .where(...).limit(n)         → resolves the next queued result
  //   - .where(...)                  → resolves the next queued result
  //                                    (getMonthlyUsage's first 3 selects
  //                                     have no .limit() / .orderBy())
  //   - .where(...).orderBy(...).limit(n)   → via orderBy thenable+chain
  //   - .where(...).groupBy(...).orderBy(...)   → via orderBy thenable
  // We make .where / .groupBy / .orderBy each be a thenable proxy so
  // `await db.select(...).from(...).where(...)` works directly.
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(dequeue(state)));
    const thenable = (next: () => Record<string, unknown>) =>
      new Proxy(next(), {
        get(target, prop, receiver) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(dequeue(state));
          }
          if (prop === "limit") {
            return target.limit;
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    chain.where = vi.fn(() => thenable(() => chain));
    chain.groupBy = vi.fn(() => thenable(() => chain));
    chain.orderBy = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    return Promise.resolve();
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  return { select, insert, update, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
  }),
);

vi.mock("@/lib/db", () => ({ db: dbMock }));

const envMock = vi.hoisted(() => ({
  MINIMAX_API_KEY: "sk-test",
  MINIMAX_BASE_URL: "https://api.example.com",
  MINIMAX_MODEL: "MiniMax-M3",
  AI_FEATURE_ENABLED: true,
  NODE_ENV: "test" as const,
  AUTH_SECRET: "x".repeat(32),
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
}));

vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy(
    {},
    {
      get: (_t, key: string) => (envMock as Record<string, unknown>)[key],
    },
  ),
}));

const policyOverrides = vi.hoisted(() => ({
  firstAgencyForBootstrapResult: "agency-1" as string | null,
  isAgencyAdminResult: true as boolean,
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    firstAgencyForBootstrap: vi.fn(async () => policyOverrides.firstAgencyForBootstrapResult),
    isAgencyAdmin: vi.fn(async () => policyOverrides.isAgencyAdminResult),
  };
});

const { PermissionDeniedError } = await import("@/lib/auth/policy");
const {
  getAiFeatureSettings,
  getMonthlyUsage,
  updateAiFeatureSettings,
  testAiConnection,
  UpdateAiSettingsSchema,
  AI_CAPABILITIES,
} = await import("@/lib/ai/feature-settings");

const actor = { id: "user-1" };
const agencyId = "agency-1";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  policyOverrides.firstAgencyForBootstrapResult = agencyId;
  policyOverrides.isAgencyAdminResult = true;
  envMock.AI_FEATURE_ENABLED = true;
  envMock.MINIMAX_API_KEY = "sk-test";
  envMock.MINIMAX_BASE_URL = "https://api.example.com";
  envMock.MINIMAX_MODEL = "MiniMax-M3";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAiFeatureSettings", () => {
  it("returns null when no active agency is configured", async () => {
    policyOverrides.firstAgencyForBootstrapResult = null;
    const result = await getAiFeatureSettings();
    expect(result).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("returns null when the agency has no row yet", async () => {
    dbMock.state.selectResults.push([]);
    const result = await getAiFeatureSettings();
    expect(result).toBeNull();
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("returns the existing row when one is present", async () => {
    const row = {
      agencyId,
      enabled: true,
      model: "MiniMax-M3",
      enabledCapabilities: ["campaign_ideas"],
      keySource: "environment",
    };
    dbMock.state.selectResults.push([row]);
    const result = await getAiFeatureSettings();
    expect(result).toEqual(row);
  });
});

describe("getMonthlyUsage", () => {
  it("returns zeroed totals when no active agency is configured", async () => {
    policyOverrides.firstAgencyForBootstrapResult = null;
    const result = await getMonthlyUsage();
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, byCapability: [] });
  });

  it("aggregates total / succeeded / failed and groups by capability", async () => {
    // Queue 4 select results for: totals, succeeded, failed, byCap
    dbMock.state.selectResults.push(
      [{ total: 10 }],
      [{ value: 7 }],
      [{ value: 3 }],
      [
        { capability: "campaign_ideas", count: 6 },
        { capability: "caption_drafts", count: 4 },
      ],
    );
    const result = await getMonthlyUsage(30);
    expect(result).toEqual({
      total: 10,
      succeeded: 7,
      failed: 3,
      byCapability: [
        { capability: "campaign_ideas", count: 6 },
        { capability: "caption_drafts", count: 4 },
      ],
    });
  });

  it("falls back to 0 when the totals/succeeded/failed rows are undefined", async () => {
    dbMock.state.selectResults.push([], [], [], []);
    const result = await getMonthlyUsage(7);
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, byCapability: [] });
  });

  it("accepts a custom day window and defaults to 30", async () => {
    dbMock.state.selectResults.push([], [], [], []);
    await getMonthlyUsage();
    expect(dbMock.select).toHaveBeenCalledTimes(4);
  });
});

describe("updateAiFeatureSettings", () => {
  const validInput = {
    enabled: true,
    model: "MiniMax-M3",
    enabledCapabilities: ["campaign_ideas" as const, "caption_drafts" as const],
  };

  it("throws PermissionDeniedError when the actor is not an agency admin", async () => {
    policyOverrides.isAgencyAdminResult = false;
    await expect(updateAiFeatureSettings(actor, validInput)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });

  it("throws when the active agency is not configured", async () => {
    policyOverrides.firstAgencyForBootstrapResult = null;
    await expect(updateAiFeatureSettings(actor, validInput)).rejects.toThrow(
      /Agency not configured/,
    );
  });

  it("rejects models that are not in the server allowlist", async () => {
    // No row exists yet, so insert path is exercised.
    dbMock.state.selectResults.push([]);
    // After upsert the module re-selects, so queue the "after" row.
    dbMock.state.selectResults.push([
      { agencyId, enabled: true, model: "gpt-99", enabledCapabilities: [] },
    ]);
    await expect(
      updateAiFeatureSettings(actor, { ...validInput, model: "gpt-99" }),
    ).rejects.toThrow(/not in the server allowlist/);
  });

  it("inserts a new row when none exists, and re-selects to return the persisted row", async () => {
    // Initial select (none) + post-upsert select (with the inserted row).
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([
      {
        agencyId,
        enabled: true,
        model: "MiniMax-M3",
        enabledCapabilities: ["campaign_ideas"],
        keySource: "environment",
      },
    ]);
    const result = await updateAiFeatureSettings(actor, validInput);
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      agencyId,
      enabled: true,
      model: "MiniMax-M3",
      enabledCapabilities: ["campaign_ideas", "caption_drafts"],
      keySource: "environment",
      updatedBy: actor.id,
    });
    expect(result).toMatchObject({ agencyId, model: "MiniMax-M3" });
  });

  it("updates the existing row in place when one is already present", async () => {
    const existing = {
      agencyId,
      enabled: false,
      model: "MiniMax-M3",
      enabledCapabilities: [],
      keySource: "environment",
      maskedKeySuffix: "1234",
    };
    // Initial select returns the existing row + post-update select returns it again.
    dbMock.state.selectResults.push([existing]);
    dbMock.state.selectResults.push([{ ...existing, enabled: true }]);
    const result = await updateAiFeatureSettings(actor, validInput);
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({
      agencyId,
      enabled: true,
      model: "MiniMax-M3",
      enabledCapabilities: ["campaign_ideas", "caption_drafts"],
      maskedKeySuffix: "1234",
      updatedBy: actor.id,
    });
    expect(dbMock.state.insertCalls).toHaveLength(0);
    expect(result).toMatchObject({ agencyId, enabled: true });
  });

  it("rejects inputs that fail the UpdateAiSettingsSchema", () => {
    const parse = UpdateAiSettingsSchema.safeParse({
      enabled: "yes",
      model: "",
      enabledCapabilities: ["not_a_real_capability"],
    });
    expect(parse.success).toBe(false);
  });

  it("accepts the full capability list as a valid input", () => {
    const parse = UpdateAiSettingsSchema.safeParse({
      enabled: false,
      model: "MiniMax-M3",
      enabledCapabilities: [...AI_CAPABILITIES],
    });
    expect(parse.success).toBe(true);
  });
});

describe("testAiConnection", () => {
  it("throws PermissionDeniedError when the actor is not an agency admin", async () => {
    policyOverrides.isAgencyAdminResult = false;
    await expect(testAiConnection(actor)).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("throws when the active agency is not configured", async () => {
    policyOverrides.firstAgencyForBootstrapResult = null;
    await expect(testAiConnection(actor)).rejects.toThrow(/Agency not configured/);
  });

  it("records a failure and returns {ok:false, latencyMs:null} when AI is disabled", async () => {
    envMock.AI_FEATURE_ENABLED = false;
    envMock.MINIMAX_API_KEY = "sk-test";
    // recordConnectionTest: initial select (no row) → insert path
    dbMock.state.selectResults.push([]);
    const result = await testAiConnection(actor);
    expect(result).toEqual({ ok: false, latencyMs: null });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      agencyId,
      enabled: false,
      model: "MiniMax-M3",
      lastConnectionTestOk: false,
    });
  });

  it("records a failure and returns {ok:false, latencyMs:null} when the API key is missing", async () => {
    envMock.AI_FEATURE_ENABLED = true;
    envMock.MINIMAX_API_KEY = "";
    dbMock.state.selectResults.push([]);
    const result = await testAiConnection(actor);
    expect(result).toEqual({ ok: false, latencyMs: null });
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it("returns ok:true and updates the existing row when the upstream call succeeds", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);
    // recordConnectionTest: existing row → update path
    dbMock.state.selectResults.push([
      { agencyId, enabled: true, model: "MiniMax-M3", enabledCapabilities: [] },
    ]);
    const result = await testAiConnection(actor);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/messages");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "MiniMax-M3", max_tokens: 1 });
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({
      lastConnectionTestOk: true,
      updatedBy: actor.id,
    });
  });

  it("returns ok:false when the upstream responds non-2xx but still records the test", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
    }));
    vi.stubGlobal("fetch", fetchMock);
    dbMock.state.selectResults.push([
      { agencyId, enabled: true, model: "MiniMax-M3", enabledCapabilities: [] },
    ]);
    const result = await testAiConnection(actor);
    expect(result.ok).toBe(false);
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({
      lastConnectionTestOk: false,
    });
  });

  it("returns ok:false and records the failure when fetch throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);
    dbMock.state.selectResults.push([
      { agencyId, enabled: true, model: "MiniMax-M3", enabledCapabilities: [] },
    ]);
    const result = await testAiConnection(actor);
    expect(result.ok).toBe(false);
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({
      lastConnectionTestOk: false,
    });
  });

  it("strips a trailing slash from the base URL before building the endpoint", async () => {
    envMock.MINIMAX_BASE_URL = "https://api.example.com/";
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    dbMock.state.selectResults.push([
      { agencyId, enabled: true, model: "MiniMax-M3", enabledCapabilities: [] },
    ]);
    await testAiConnection(actor);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/messages");
  });
});
