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
  /** Simulate an optimistic-concurrency race: the UPDATE matches no row. */
  updateWritesNoRows: boolean;
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
    return updateChain;
  });
  // `savePlatformPayload` chains `.returning()` and treats a zero-row
  // write as a lost optimistic-concurrency race. Default to one row so
  // the ordinary path succeeds; a test can set
  // `state.updateWritesNoRows` to simulate the race.
  updateChain.returning = vi.fn(() =>
    Promise.resolve(
      state.updateWritesNoRows ? [] : [{ socialChannelId: "22222222-2222-4222-8222-222222222222" }],
    ),
  );
  const update = vi.fn(() => updateChain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    return Promise.resolve();
  });
  const mock: Record<string, unknown> = {
    select,
    insert: vi.fn(() => insertChain),
    update,
    execute: vi.fn(async () => undefined),
  };
  mock.transaction = vi.fn(async (callback: (tx: Record<string, unknown>) => unknown) =>
    callback(mock),
  );

  return { ...mock, state };
}

const dbState: DrizzleState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertCalls: [] as { values: unknown }[],
  updateCalls: [] as { set: unknown; where: unknown }[],
  updateWritesNoRows: false,
  lastSelectRowCount: 0,
}));
const dbMock = vi.hoisted(() => makeDrizzleMock(dbState));

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
  isAgencyAdmin: vi.fn(async () => true as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    hasWorkspaceRole: policyMock.hasWorkspaceRole,
    isAgencyAdmin: policyMock.isAgencyAdmin,
  };
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
  setFinalCopyApproval,
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
  dbState.updateWritesNoRows = false;
  dbState.lastSelectRowCount = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.isAgencyAdmin.mockReset();
  policyMock.isAgencyAdmin.mockResolvedValue(true);
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
    const draftFields: Record<string, unknown> = { ...payload };
    delete draftFields.approval;
    delete draftFields.captions;
    expect((upsert?.set as Record<string, unknown>).platformPayload).toEqual(
      expect.objectContaining({
        ...draftFields,
        approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
      }),
    );
    expect(result.approval).toEqual({
      finalCopyApproved: false,
      approvedByUserId: null,
      approvedAt: null,
    });
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

/**
 * Optimistic concurrency on the SINGLE-channel path.
 *
 * The plan required `expectedUpdatedAt` to be enforced on both the
 * single and the batch path, because a collaborator's commit between
 * the page load and the save must be caught rather than silently
 * overwritten. `publish-batch-save.test.ts` covers the batch side; this
 * block is the single-channel half, which had no coverage at all — every
 * existing case in this file dequeues an empty `existingRow`, so the
 * comparison at `platform-payload-service.ts:202-217` was never
 * reached.
 */
describe("savePlatformPayload — optimistic concurrency (expectedUpdatedAt)", () => {
  const STORED_UPDATED_AT = "2026-08-24T10:00:00.000Z";
  const COLLABORATOR_UPDATED_AT = "2026-08-24T11:30:00.000Z";

  /**
   * Queue the two reads the service performs, in order:
   *   1. `ensureContentItemChannelInWorkspace` — the channel link check.
   *   2. the `platformPayload` / `updatedAt` read the token is compared
   *      against.
   */
  function queueReads(
    storedRow: {
      platformPayload?: unknown;
      updatedAt?: Date | undefined;
    } | null,
  ) {
    dbState.selectResults.push([{ id: "channel-link" }]);
    dbState.selectResults.push(storedRow ? [storedRow] : []);
  }

  it("rejects a save whose base row moved since the client read it", async () => {
    queueReads({
      platformPayload: makePayload(),
      updatedAt: new Date(COLLABORATOR_UPDATED_AT),
    });

    const error = await savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      payload: makePayload({ altText: "Locally edited alt text" }),
      expectedUpdatedAt: STORED_UPDATED_AT,
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(PlatformPayloadError);
    expect(error).toMatchObject({ code: "INVALID" });
    // The details carry both timestamps so the action layer can report a
    // field-level conflict rather than a bare "save failed".
    expect((error as InstanceType<typeof PlatformPayloadError>).details).toMatchObject({
      contentItemId,
      socialChannelId,
      expectedUpdatedAt: STORED_UPDATED_AT,
      actualUpdatedAt: COLLABORATOR_UPDATED_AT,
    });

    // Nothing was written and no material edit was recorded: a rejected
    // save must not leave a bumped revision with no payload saved.
    expect(dbState.updateCalls).toHaveLength(0);
    expect(materialityMock.recordMaterialityEvent).not.toHaveBeenCalled();
  });

  it("accepts a save whose token still matches the stored row", async () => {
    queueReads({
      platformPayload: makePayload(),
      updatedAt: new Date(STORED_UPDATED_AT),
    });

    const result = await savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      payload: makePayload({ altText: "Locally edited alt text" }),
      expectedUpdatedAt: STORED_UPDATED_AT,
    });

    expect(result.altText).toBe("Locally edited alt text");
    // The payload write plus the copySourceRevision bookkeeping write.
    expect(dbState.updateCalls).toHaveLength(2);
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps last-write-wins when the caller supplies no token", async () => {
    // Documented on `SavePlatformPayloadInputSchema`: `null`/absent is
    // the escape hatch for callers that cannot supply the token. It is
    // also the asymmetry with the batch, where the token is required —
    // worth pinning so the difference stays deliberate.
    queueReads({
      platformPayload: makePayload(),
      updatedAt: new Date(COLLABORATOR_UPDATED_AT),
    });

    const result = await savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      payload: makePayload({ altText: "Last write wins" }),
      expectedUpdatedAt: null,
    });

    expect(result.altText).toBe("Last write wins");
    expect(dbState.updateCalls).toHaveLength(2);
  });

  it("saves a channel that has never been written, which has no updatedAt to compare", async () => {
    // A brand-new channel row has a null `updated_at` on the read side, so
    // there is no token to reject against. This is the path every
    // "publish a package for the first time" save takes.
    queueReads({ platformPayload: null, updatedAt: undefined });

    const result = await savePlatformPayload(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      payload: makePayload({ altText: "First save" }),
      expectedUpdatedAt: STORED_UPDATED_AT,
    });

    expect(result.altText).toBe("First save");
    expect(dbState.updateCalls).toHaveLength(2);
  });
});

describe("setFinalCopyApproval", () => {
  it("requires an existing workspace", async () => {
    dbState.selectResults.push([]);
    await expect(
      setFinalCopyApproval(actor, workspaceId, {
        contentItemId,
        socialChannelId,
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-admin actor before touching the channel", async () => {
    dbState.selectResults.push([{ agencyId: "agency-1" }]);
    policyMock.isAgencyAdmin.mockResolvedValue(false);
    await expect(
      setFinalCopyApproval(actor, workspaceId, {
        contentItemId,
        socialChannelId,
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires a saved package before approval", async () => {
    dbState.selectResults.push([{ agencyId: "agency-1" }]);
    dbState.selectResults.push([{ id: "channel-link" }]);
    dbState.selectResults.push([{ platformPayload: null }]);
    await expect(
      setFinalCopyApproval(actor, workspaceId, {
        contentItemId,
        socialChannelId,
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("stamps actor and timestamp and records an audit event", async () => {
    dbState.selectResults.push([{ agencyId: "agency-1" }]);
    dbState.selectResults.push([{ id: "channel-link" }]);
    dbState.selectResults.push([{ platformPayload: makePayload({ approval: undefined }) }]);
    const result = await setFinalCopyApproval(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      approved: true,
    });
    expect(result.approval.finalCopyApproved).toBe(true);
    expect(result.approval.approvedByUserId).toBe(actor.id);
    expect(result.approval.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dbState.updateCalls).toHaveLength(1);
    expect(dbState.insertCalls).toHaveLength(1);
    expect(dbState.insertCalls[0]?.values).toEqual(
      expect.objectContaining({ summary: "Final copy approved", actorId: actor.id }),
    );
  });

  it("revokes approval by clearing server-owned metadata", async () => {
    dbState.selectResults.push([{ agencyId: "agency-1" }]);
    dbState.selectResults.push([{ id: "channel-link" }]);
    dbState.selectResults.push([{ platformPayload: makePayload() }]);
    const result = await setFinalCopyApproval(actor, workspaceId, {
      contentItemId,
      socialChannelId,
      approved: false,
    });
    expect(result.approval).toEqual({
      finalCopyApproved: false,
      approvedByUserId: null,
      approvedAt: null,
    });
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
