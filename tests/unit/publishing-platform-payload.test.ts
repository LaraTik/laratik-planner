import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M4.2 — Platform payload service unit tests.
 *
 * The module under test (`src/lib/publishing/platform-payload-service.ts`)
 * owns the `content_item_channel.platform_payload` JSONB column: it
 * validates the Zod discriminated union, persists the payload, and
 * routes every write through the materiality service (M4.3).
 *
 * The tests cover the public surface:
 *
 *   - `savePlatformPayload`      — role gate, channel-in-workspace
 *                                  check, Zod parse, upsert, materiality
 *   - `readPlatformPayload`       — read + parse; returns null when the
 *                                  stored row has no payload OR a row
 *                                  pre-dates the discriminated union
 *   - `readAllChannelPayloads`    — multi-row read, indexed by channel
 *   - `clearChannelPayload`       — set NULL + materiality
 *
 * The DB mock follows the same conventions as
 * `publishing-materiality.test.ts`. The `recordMaterialityEvent`
 * dependency is mocked so this file does not pull the
 * `entitlements` / `usage` / transactional machinery from
 * `materiality.ts` into the test's mock surface.
 */

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
  lastSelectRowCount: number;
};

function dequeue(state: DrizzleState): unknown[] {
  const rows = state.selectResults.shift() ?? [];
  state.lastSelectRowCount = rows.length;
  return rows;
}

function makeDrizzleMock(state: DrizzleState) {
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
    chain.innerJoin = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const select = vi.fn(() => makeChain());

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

  return { select, insert: vi.fn(), update, state };
}

const dbState: DrizzleState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertCalls: [] as { values: unknown }[],
  updateCalls: [] as { set: unknown; where: unknown }[],
  lastSelectRowCount: 0,
}));
const dbMock = vi.hoisted(() => makeDrizzleMock(dbState));

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, hasWorkspaceRole: policyMock.hasWorkspaceRole };
});

// Typed as a generic `(...args: unknown[]) => Promise<unknown>` so
// vi.fn's mock.calls inference can resolve the tuple type at the
// call sites. The unused-vars rule is satisfied because the
// function has no named parameters to flag.
const materialityMock = vi.hoisted(() => ({
  recordMaterialityEvent: vi.fn(
    async (): Promise<{
      revision: number;
      cancelledApprovalCount: number;
      notifiedReviewerCount: number;
    }> => ({
      revision: 1,
      cancelledApprovalCount: 0,
      notifiedReviewerCount: 0,
    }),
  ),
}));

vi.mock("@/lib/publishing/materiality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publishing/materiality")>();
  return {
    ...actual,
    recordMaterialityEvent: materialityMock.recordMaterialityEvent,
  };
});

const {
  savePlatformPayload,
  readPlatformPayload,
  readAllChannelPayloads,
  clearChannelPayload,
  PlatformPayloadError,
  SavePlatformPayloadInputSchema,
} = await import("@/lib/publishing/platform-payload-service");

const actor = { id: "99999999-9999-9999-9999-999999999999" };
const workspaceId = "ws-1";
const contentItemId = "11111111-1111-1111-1111-111111111111";
const socialChannelId = "22222222-2222-2222-2222-222222222222";

function resetState() {
  dbState.selectResults = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.lastSelectRowCount = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  materialityMock.recordMaterialityEvent.mockReset();
  materialityMock.recordMaterialityEvent.mockResolvedValue({
    revision: 1,
    cancelledApprovalCount: 0,
    notifiedReviewerCount: 0,
  });
}

beforeEach(resetState);

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    platform: "instagram" as const,
    feedCrop: "1:1" as const,
    carouselOrder: [],
    captions: undefined,
    altText: "A photo of a planner's desk",
    disclosures: {
      paidPartnership: false,
      aiGenerated: false,
      syntheticMedia: false,
      rightsConfirmed: true,
    },
    publicationMethod: "api" as const,
    approval: {
      finalCopyApproved: true,
      approvedByUserId: actor.id,
      approvedAt: "2026-08-24T10:00:00.000Z",
    },
    hashtags: ["#studioflow"],
    mentions: [],
    collaborators: [],
    deliveryReferences: [],
    selectedDestinationProfile: { socialChannelId },
    ...overrides,
  };
}

describe("SavePlatformPayloadInputSchema", () => {
  it("accepts a complete instagram payload", () => {
    const ok = SavePlatformPayloadInputSchema.safeParse({
      contentItemId,
      socialChannelId,
      payload: makePayload(),
    });
    expect(ok.success).toBe(true);
  });
  it("rejects a payload with an unknown platform discriminator", () => {
    const ok = SavePlatformPayloadInputSchema.safeParse({
      contentItemId,
      socialChannelId,
      payload: { schemaVersion: 1, platform: "myspace" },
    });
    expect(ok.success).toBe(false);
  });
  it("rejects a non-UUID contentItemId", () => {
    const ok = SavePlatformPayloadInputSchema.safeParse({
      contentItemId: "not-a-uuid",
      socialChannelId,
      payload: makePayload(),
    });
    expect(ok.success).toBe(false);
  });
});

describe("PlatformPayloadError", () => {
  it("captures code, message, and details", () => {
    const err = new PlatformPayloadError("INVALID", "bad", { x: 1 });
    expect(err.name).toBe("PlatformPayloadError");
    expect(err.code).toBe("INVALID");
    expect(err.details).toEqual({ x: 1 });
  });
});

describe("savePlatformPayload", () => {
  it("refuses non-workspace-manager / non-content-planner actors", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      savePlatformPayload(actor, workspaceId, {
        contentItemId,
        socialChannelId,
        payload: makePayload(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when the content item is not linked to the channel", async () => {
    dbState.selectResults.push([]); // ensureContentItemChannelInWorkspace finds nothing
    await expect(
      savePlatformPayload(actor, workspaceId, {
        contentItemId,
        socialChannelId,
        payload: makePayload(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("persists the payload and routes through the materiality service", async () => {
    dbState.selectResults.push([{ id: "channel-link" }]); // ensureContentItemChannelInWorkspace OK
    const payload = makePayload();
    const result = await savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      payload,
    });
    expect(result.platform).toBe("instagram");
    expect(result.altText).toBe(payload.altText);
    // The upsert was called with the parsed payload.
    const upsert = dbState.updateCalls[0];
    expect(upsert).toBeDefined();
    expect((upsert?.set as Record<string, unknown>).platformPayload).toEqual(payload);
    // The materiality service was invoked with the platform_payload
    // resource + the platform_payload.save reason code.
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledTimes(1);
    const call = (
      materialityMock.recordMaterialityEvent.mock.calls[0] as unknown as [
        { resource: string; reasonCode: string; contentItemId: string },
      ]
    )?.[0];
    expect(call?.resource).toBe("platform_payload");
    expect(call?.reasonCode).toBe("platform_payload.save");
    expect(call?.contentItemId).toBe(contentItemId);
  });

  it("rethrows the ZodError when the payload fails the discriminated-union parse", async () => {
    dbState.selectResults.push([{ id: "channel-link" }]);
    // The SUT calls `PlatformPayloadSchema.parse(input.payload)`
    // directly — a Zod validation failure surfaces as a raw
    // ZodError. This is a documented behaviour: callers should
    // hand the service a payload that has already been through
    // the same Zod schema on the read side.
    await expect(
      savePlatformPayload(actor, workspaceId, {
        contentItemId,
        socialChannelId,
        payload: {
          schemaVersion: 1,
          platform: "instagram",
          // `altText` is required by the instagram schema. Force
          // the parse to fail by setting it to the wrong type.
          altText: 42 as unknown as string,
        } as unknown as Parameters<typeof savePlatformPayload>[2]["payload"],
      }),
    ).rejects.toThrow();
  });
});

describe("readPlatformPayload", () => {
  it("refuses actors who are not workspace members", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      readPlatformPayload({
        actor,
        workspaceId,
        contentItemId,
        socialChannelId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null when the channel row has no payload yet", async () => {
    dbState.selectResults.push([{ id: "channel-link" }]); // workspace check
    dbState.selectResults.push([{ platformPayload: null }]); // row read
    const out = await readPlatformPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId,
    });
    expect(out).toBeNull();
  });

  it("returns null when the stored row pre-dates the discriminated union (no platform tag)", async () => {
    dbState.selectResults.push([{ id: "channel-link" }]);
    dbState.selectResults.push([{ platformPayload: { schemaVersion: 1 /* no platform key */ } }]);
    const out = await readPlatformPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId,
    });
    expect(out).toBeNull();
  });

  it("parses and returns the stored payload", async () => {
    const stored = makePayload({ altText: "stored alt text" });
    dbState.selectResults.push([{ id: "channel-link" }]);
    dbState.selectResults.push([{ platformPayload: stored }]);
    const out = await readPlatformPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId,
    });
    expect(out).toEqual(stored);
  });
});

describe("readAllChannelPayloads", () => {
  it("refuses actors who are not workspace members", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      readAllChannelPayloads({ actor, workspaceId, contentItemId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null for channels with no payload and parsed payloads for the rest", async () => {
    const channelA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const channelB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const channelC = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    dbState.selectResults.push([
      { socialChannelId: channelA, platformPayload: makePayload() },
      { socialChannelId: channelB, platformPayload: null },
      {
        socialChannelId: channelC,
        platformPayload: { schemaVersion: 1 /* legacy row, no platform */ },
      },
    ]);
    const out = await readAllChannelPayloads({ actor, workspaceId, contentItemId });
    expect(Object.keys(out).sort()).toEqual([channelA, channelB, channelC].sort());
    expect(out[channelA]?.platform).toBe("instagram");
    expect(out[channelB]).toBeNull();
    expect(out[channelC]).toBeNull();
  });
});

describe("clearChannelPayload", () => {
  it("refuses actors who are not workspace members or content_planner", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      clearChannelPayload({ actor, workspaceId, contentItemId, socialChannelId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sets the payload to a SQL NULL and records a platform_payload.clear material event", async () => {
    await clearChannelPayload({
      actor,
      workspaceId,
      contentItemId,
      socialChannelId,
    });
    // The SUT uses `sql\`NULL\`` (a Drizzle SQL fragment) so the
    // column is set to a real SQL NULL rather than the JS `null`
    // literal. We assert the call happened and the column key is
    // present in the set object.
    const clearCall = dbState.updateCalls[0];
    expect(clearCall).toBeDefined();
    expect(clearCall?.set).toHaveProperty("platformPayload");
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledTimes(1);
    const call = (
      materialityMock.recordMaterialityEvent.mock.calls[0] as unknown as [
        { resource: string; reasonCode: string; afterValue: unknown },
      ]
    )?.[0];
    expect(call?.resource).toBe("platform_payload");
    expect(call?.reasonCode).toBe("platform_payload.clear");
    expect(call?.afterValue).toBeNull();
  });
});
