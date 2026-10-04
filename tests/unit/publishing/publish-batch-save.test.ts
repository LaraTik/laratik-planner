import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformPayload } from "@/lib/publishing/payload-schemas";

/**
 * PR2 D1/D3 — atomic batch save of several channel packages.
 *
 * `savePlatformPayloadsBatch(actor, workspaceId, { contentItemId, entries })`
 * replaces the client-side loop over `savePublishPackageAction`, which
 * used to produce N revision bumps and N notification fan-outs for one
 * "Save all" click. The contract under test:
 *
 *   1. Every entry is validated BEFORE anything is written. One bad
 *      entry means nothing is written at all.
 *   2. A stale `expectedUpdatedAt` (the `content_item_channel.updated_at`
 *      the client read) is reported per channel as `errorCode: "stale"`.
 *   3. A successful batch is ONE material edit: one transaction, one
 *      `content_items.revision` increment, one `activity_event` row.
 *   4. The per-row compare-and-set is inside the transaction, so a
 *      collaborator who commits between the read and the write is
 *      caught rather than overwritten.
 *
 * The DB mock follows the same conventions as
 * `publishing-platform-payload.test.ts` (which in turn follows
 * `publishing-materiality.test.ts`): a thenable Proxy over a chain
 * object, with a queue of results to dequeue per `await`.
 *
 * One deliberate difference from those files: the batch path contains
 * two *different* `.update(...).returning(...)` shapes in the same
 * transaction — the channel writes return `{ socialChannelId }`, the
 * materiality revision bump returns `{ revision }`. A single shared
 * result queue (as in the older files, where every returning row has
 * the same shape) cannot express that, so selects and update-returnings
 * get separate queues. The `table` is recorded per update so the
 * assertions can prove the revision bump happened exactly once.
 */

vi.mock("server-only", () => ({}));

type UpdateCall = {
  table: unknown;
  set: unknown;
  where: unknown;
  returning: unknown[];
};

type DrizzleState = {
  selectResults: unknown[][];
  returningResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  updateCalls: UpdateCall[];
  transactionCalls: number;
};

function makeDrizzleMock(state: DrizzleState) {
  /**
   * Wrap a chain so it can be `await`ed directly (drizzle builders are
   * thenable) while still exposing the `.returning()` escape hatch that
   * `update()` chains use.
   */
  function thenable(chain: Record<string, unknown>, resolve: () => unknown[]) {
    return new Proxy(chain, {
      get(target, prop, receiver) {
        if (prop === "then") {
          return (res: (v: unknown) => void) => res(resolve());
        }
        if (prop === "limit") return target.limit;
        if (prop === "orderBy") return target.orderBy;
        if (prop === "returning") return target.returning;
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => thenable(chain, () => state.selectResults.shift() ?? []));
    chain.leftJoin = vi.fn(() => thenable(chain, () => state.selectResults.shift() ?? []));
    chain.limit = vi.fn(() => Promise.resolve(state.selectResults.shift() ?? []));
    chain.orderBy = vi.fn(() => thenable(chain, () => state.selectResults.shift() ?? []));
    chain.where = vi.fn(() => thenable(chain, () => state.selectResults.shift() ?? []));
    return chain;
  }
  const select = vi.fn(() => makeSelectChain());

  const insert = vi.fn((table: unknown) => {
    const record = { table, values: undefined as unknown };
    const chain: Record<string, unknown> = {};
    chain.values = vi.fn((values: unknown) => {
      record.values = values;
      state.insertCalls.push(record);
      return chain;
    });
    return thenable(chain, () => []);
  });

  const update = vi.fn((table: unknown) => {
    const record: UpdateCall = { table, set: undefined, where: undefined, returning: [] };
    state.updateCalls.push(record);
    const chain: Record<string, unknown> = {};
    chain.set = vi.fn((set: unknown) => {
      record.set = set;
      return chain;
    });
    chain.returning = vi.fn(() => {
      record.returning = state.returningResults.shift() ?? [];
      return Promise.resolve(record.returning);
    });
    chain.where = vi.fn((where: unknown) => {
      record.where = where;
      return thenable(chain, () => state.returningResults.shift() ?? []);
    });
    return chain;
  });

  const mock: Record<string, unknown> = {
    select,
    insert,
    update,
    execute: vi.fn(async () => undefined),
  };
  // The batch passes this object as `tx` to `recordMaterialityEventInTx`,
  // which then calls `db.select` (not `tx.select`) for the content item
  // before writing through `tx`. Handing it the same object keeps one
  // queue for both, exactly like the real single-connection case.
  mock.transaction = vi.fn(async (cb: (tx: Record<string, unknown>) => unknown) => {
    state.transactionCalls += 1;
    return cb(mock);
  });

  return { ...mock, state };
}

const dbState: DrizzleState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  returningResults: [] as unknown[][],
  insertCalls: [] as { table: unknown; values: unknown }[],
  updateCalls: [] as UpdateCall[],
  transactionCalls: 0,
}));
const dbMock = vi.hoisted(() => makeDrizzleMock(dbState));

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
  isAgencyAdmin: vi.fn(async () => true as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, ...policyMock };
});

/**
 * `materiality.ts` is deliberately NOT mocked: the point of the batch
 * contract is that it routes through the real funnel, so counting the
 * `content_items` revision bump and the `activity_event` insert is a
 * stronger assertion than counting a mock call.
 */
const { savePlatformPayloadsBatch, PlatformPayloadError } =
  await import("@/lib/publishing/platform-payload-service");
const { contentItems, contentItemChannels, activityEvents } = await import("@/lib/db/schema");

const actor = { id: "99999999-9999-9999-9999-999999999999" };
const workspaceId = "ws-1";
const contentItemId = "11111111-1111-1111-1111-111111111111";
const channelA = "22222222-2222-4222-8222-222222222222";
const channelB = "33333333-3333-4333-8333-333333333333";
const channelC = "44444444-4444-4444-8444-444444444444";

const STORED_UPDATED_AT = "2026-08-24T10:00:00.000Z";
const APPROVED_AT = "2026-08-20T09:00:00.000Z";

function makePayload(
  socialChannelId: string,
  overrides: Record<string, unknown> = {},
): PlatformPayload {
  return {
    schemaVersion: 1 as const,
    platform: "instagram" as const,
    feedCrop: "1:1" as const,
    carouselOrder: [],
    altText: "A photo of a planner's desk",
    disclosures: {
      paidPartnership: false,
      aiGenerated: false,
      syntheticMedia: false,
      rightsConfirmed: true,
    },
    publicationMethod: "api" as const,
    approval: {
      finalCopyApproved: false,
      approvedByUserId: null,
      approvedAt: null,
    },
    hashtags: ["#studioflow"],
    mentions: [],
    collaborators: [],
    deliveryReferences: [],
    selectedDestinationProfile: { socialChannelId },
    ...overrides,
  } as PlatformPayload;
}

function resetState() {
  dbState.selectResults = [];
  dbState.returningResults = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.transactionCalls = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.isAgencyAdmin.mockReset();
  policyMock.isAgencyAdmin.mockResolvedValue(true);
}

beforeEach(resetState);

/** `ensureContentItemChannelInWorkspace` reads once per entry, in order. */
function queueChannelLinkChecks(count: number) {
  for (let i = 0; i < count; i += 1) {
    dbState.selectResults.push([{ id: `link-${i}` }]);
  }
}

function updatesTo(table: unknown): UpdateCall[] {
  return dbState.updateCalls.filter((call) => call.table === table);
}

function insertsTo(table: unknown) {
  return dbState.insertCalls.filter((call) => call.table === table);
}

type BatchEntry = {
  socialChannelId: string;
  payload: PlatformPayload;
  expectedUpdatedAt: string | null;
};

function entry(
  socialChannelId: string,
  expectedUpdatedAt: string | null = STORED_UPDATED_AT,
  overrides: Record<string, unknown> = {},
): BatchEntry {
  return { socialChannelId, payload: makePayload(socialChannelId, overrides), expectedUpdatedAt };
}

describe("savePlatformPayloadsBatch — role gate", () => {
  it("refuses actors who are neither workspace_manager nor content_planner", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      savePlatformPayloadsBatch(actor, workspaceId, {
        contentItemId,
        entries: [entry(channelA)],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbState.transactionCalls).toBe(0);
    expect(dbState.updateCalls).toHaveLength(0);
  });
});

describe("savePlatformPayloadsBatch — one call is one material edit", () => {
  it("saves N channels in one transaction with exactly one revision bump", async () => {
    const entries = [entry(channelA), entry(channelB), entry(channelC)];
    queueChannelLinkChecks(3);
    // The single multi-row read of the existing channel rows.
    dbState.selectResults.push([
      { socialChannelId: channelA, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
      { socialChannelId: channelB, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
      { socialChannelId: channelC, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
    ]);
    // Inside the transaction: 3 channel compare-and-set writes, then the
    // materiality content-item lookup, then its revision bump.
    for (const socialChannelId of [channelA, channelB, channelC]) {
      dbState.returningResults.push([{ socialChannelId }]);
    }
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    dbState.returningResults.push([{ revision: 9 }]);
    // No pending approval requests → no reviewer notifications.
    dbState.selectResults.push([]);

    const result = await savePlatformPayloadsBatch(actor, workspaceId, {
      contentItemId,
      entries,
    });

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(9);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(result.results.map((r) => r.socialChannelId)).toEqual([channelA, channelB, channelC]);

    // ONE transaction for the whole click.
    expect(dbState.transactionCalls).toBe(1);

    // N channel rows written...
    const channelWrites = updatesTo(contentItemChannels);
    expect(channelWrites).toHaveLength(3);
    for (const write of channelWrites) {
      expect(write.set).toHaveProperty("platformPayload");
      expect(write.set).toHaveProperty("updatedAt");
    }

    // ...but the content item's revision is incremented EXACTLY ONCE,
    // not once per channel. This is the regression the N-iteration
    // client loop caused.
    expect(updatesTo(contentItems)).toHaveLength(1);
    expect(updatesTo(contentItems)[0]?.set).toHaveProperty("revision");
  });

  it("records exactly one materiality event for the whole batch", async () => {
    queueChannelLinkChecks(2);
    dbState.selectResults.push([
      { socialChannelId: channelA, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
      { socialChannelId: channelB, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
    ]);
    dbState.returningResults.push([{ socialChannelId: channelA }], [{ socialChannelId: channelB }]);
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    dbState.returningResults.push([{ revision: 4 }]);
    dbState.selectResults.push([]);

    await savePlatformPayloadsBatch(actor, workspaceId, {
      contentItemId,
      entries: [entry(channelA), entry(channelB)],
    });

    const events = insertsTo(activityEvents);
    expect(events).toHaveLength(1);
    const values = events[0]?.values as Record<string, unknown>;
    expect(values.contentItemId).toBe(contentItemId);
    const metadata = values.metadata as Record<string, unknown>;
    expect(metadata.reasonCode).toBe("platform_payload.save_batch");
    expect(metadata.revision).toBe(4);
    // The audit row carries BOTH channels' payloads, so the operator's
    // single click is one reviewable edit rather than two.
    const after = metadata.after as Array<{ socialChannelId: string }>;
    expect(after.map((a) => a.socialChannelId)).toEqual([channelA, channelB]);
  });

  it("keeps the server-owned approval instead of the one the client sent", async () => {
    const storedApproval = {
      finalCopyApproved: true,
      approvedByUserId: actor.id,
      approvedAt: APPROVED_AT,
    };
    queueChannelLinkChecks(1);
    dbState.selectResults.push([
      {
        socialChannelId: channelA,
        platformPayload: makePayload(channelA, { approval: storedApproval }),
        updatedAt: new Date(STORED_UPDATED_AT),
      },
    ]);
    dbState.returningResults.push([{ socialChannelId: channelA }]);
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    dbState.returningResults.push([{ revision: 2 }]);
    dbState.selectResults.push([]);

    // The client sends a cleared approval (the old form's behaviour).
    const result = await savePlatformPayloadsBatch(actor, workspaceId, {
      contentItemId,
      entries: [
        entry(channelA, STORED_UPDATED_AT, {
          approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
          altText: "Edited caption side text",
        }),
      ],
    });

    expect(result.ok).toBe(true);
    const first = result.results[0];
    expect(first?.ok).toBe(true);
    if (first?.ok) {
      expect(first.payload.approval).toEqual(storedApproval);
      expect(first.payload.altText).toBe("Edited caption side text");
    }
    const written = updatesTo(contentItemChannels)[0]?.set as Record<string, unknown>;
    expect((written.platformPayload as { approval: unknown }).approval).toEqual(storedApproval);
  });
});

describe("savePlatformPayloadsBatch — validate everything before writing anything", () => {
  it("writes nothing and throws when an entry fails schema validation", async () => {
    queueChannelLinkChecks(1);
    const badEntry = entry(channelA, STORED_UPDATED_AT, {
      altText: 42 as unknown as string,
    });

    // `SavePlatformPayloadBatchInputSchema.parse` runs first and throws on
    // a payload that is not a valid `PlatformPayload`, so the batch never
    // reaches the database. Atomicity holds either way: nothing written,
    // no revision bump, no transaction opened.
    await expect(
      savePlatformPayloadsBatch(actor, workspaceId, {
        contentItemId,
        entries: [badEntry],
      }),
    ).rejects.toThrow();

    expect(dbState.updateCalls).toHaveLength(0);
    expect(dbState.insertCalls).toHaveLength(0);
    expect(dbState.transactionCalls).toBe(0);
  });

  it("reports a stale expectedUpdatedAt per channel and leaves the other channel unwritten", async () => {
    const entries = [entry(channelA), entry(channelB, "2026-08-24T11:00:00.000Z")];
    queueChannelLinkChecks(2);
    dbState.selectResults.push([
      { socialChannelId: channelA, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
      { socialChannelId: channelB, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
    ]);

    const result = await savePlatformPayloadsBatch(actor, workspaceId, {
      contentItemId,
      entries,
    });

    expect(result.ok).toBe(false);
    expect(result.revision).toBeNull();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      socialChannelId: channelB,
      ok: false,
      errorCode: "stale",
    });

    // Channel A passed validation but is NOT written: a partial batch is
    // worse than a rejected one, because the operator cannot tell which
    // packages the resulting revision and notifications were about.
    expect(dbState.updateCalls).toHaveLength(0);
    expect(dbState.insertCalls).toHaveLength(0);
    expect(dbState.transactionCalls).toBe(0);
  });

  it("rejects the batch when the stored row moved between the read and the write", async () => {
    // The optimistic token matched at validation time, but the
    // compare-and-set inside the transaction returns no row — a
    // collaborator committed in between.
    const entries = [entry(channelA), entry(channelB)];
    queueChannelLinkChecks(2);
    dbState.selectResults.push([
      { socialChannelId: channelA, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
      { socialChannelId: channelB, platformPayload: null, updatedAt: new Date(STORED_UPDATED_AT) },
    ]);
    dbState.returningResults.push([{ socialChannelId: channelA }], []); // second update matched nothing

    // One call, one rejection — asserting both the error type and its
    // details needs the same throw, so catch it once.
    const error = await savePlatformPayloadsBatch(actor, workspaceId, {
      contentItemId,
      entries,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PlatformPayloadError);
    expect(error).toMatchObject({
      code: "INVALID",
      details: { socialChannelId: channelB },
    });

    // The revision bump never happened, so a rolled-back write cannot
    // leave a bumped revision with no payload saved.
    expect(updatesTo(contentItemChannels)).toHaveLength(2);
    expect(updatesTo(contentItems)).toHaveLength(0);
    expect(insertsTo(activityEvents)).toHaveLength(0);
  });
});
