import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Publishing service tests — exercise the schema, recordPublication
 * (with all status branches), and listPublicationsForItem.
 */

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  insertReturningIds: { id: string }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  executeCalls: { sql: unknown }[];
  transactionCalls: number;
};

function makeDrizzleMock(state: DrizzleState) {
  function thenableProxy(target: Record<string, unknown>): Record<string, unknown> {
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []);
        }
        if (prop === "limit") return t.limit;
        if (prop === "orderBy") return t.orderBy;
        if (prop === "for") return t.for;
        return Reflect.get(t, prop, receiver);
      },
    });
  }
  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => thenableProxy(chain));
    chain.orderBy = vi.fn(() => thenableProxy(chain));
    chain.for = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const select = vi.fn(() => makeSelectChain());

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
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
    state.updateCalls.push({ table: "update", set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const execute = vi.fn((sqlArg: unknown) => {
    state.executeCalls.push({ sql: sqlArg });
    return Promise.resolve();
  });

  const transaction = vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
    state.transactionCalls += 1;
    const txSelect = vi.fn(() => makeSelectChain());
    const txInsert = vi.fn(() => insertChain);
    const txUpdate = vi.fn(() => updateChain);
    const txApi = {
      select: txSelect,
      insert: txInsert,
      update: txUpdate,
      execute: vi.fn(() => Promise.resolve()),
    };
    return cb(txApi);
  });

  return { select, insert, update, transaction, execute, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    insertReturningIds: [],
    updateCalls: [],
    executeCalls: [],
    transactionCalls: 0,
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
  canAccessWorkspace: vi.fn(async () => true as boolean),
  requirePolicy: vi.fn(async (predicate: Promise<boolean>, action: string) => {
    if (!(await predicate)) {
      const err = new Error(`Permission denied: ${action}`);
      err.name = "PermissionDeniedError";
      throw err;
    }
  }),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, ...policyMock };
});

const { recordPublication, listPublicationsForItem, RecordPublicationSchema } =
  await import("@/lib/publishing/service");

const actor = { id: "user-1" };
const contentItemChannelId = "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa";
const contentItemId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.insertReturningIds = [];
  dbMock.state.updateCalls = [];
  dbMock.state.executeCalls = [];
  dbMock.state.transactionCalls = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.canAccessWorkspace.mockReset();
  policyMock.canAccessWorkspace.mockResolvedValue(true);
  policyMock.requirePolicy.mockReset();
  policyMock.requirePolicy.mockImplementation(
    async (predicate: Promise<boolean>, action: string) => {
      if (!(await predicate)) {
        const err = new Error(`Permission denied: ${action}`);
        err.name = "PermissionDeniedError";
        throw err;
      }
    },
  );
});

describe("RecordPublicationSchema", () => {
  it("accepts a published record with https url", () => {
    expect(
      RecordPublicationSchema.safeParse({
        contentItemChannelId,
        status: "published",
        publishedUrl: "https://instagram.com/p/abc",
      }).success,
    ).toBe(true);
  });

  it("accepts a skipped record with a note", () => {
    expect(
      RecordPublicationSchema.safeParse({
        contentItemChannelId,
        status: "skipped",
        note: "Replaced with Reel",
      }).success,
    ).toBe(true);
  });

  it("accepts a failed record with a failureReason", () => {
    expect(
      RecordPublicationSchema.safeParse({
        contentItemChannelId,
        status: "failed",
        failureReason: "Auth token expired",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(
      RecordPublicationSchema.safeParse({ contentItemChannelId, status: "weird" }).success,
    ).toBe(false);
  });
});

describe("recordPublication", () => {
  it("requires a publishedUrl for published", async () => {
    await expect(
      recordPublication(actor, { contentItemChannelId, status: "published" }),
    ).rejects.toThrow(/publishedurl/i);
  });

  it("requires a note for skipped", async () => {
    await expect(
      recordPublication(actor, { contentItemChannelId, status: "skipped" }),
    ).rejects.toThrow(/note/i);
  });

  it("requires a failureReason for failed", async () => {
    await expect(
      recordPublication(actor, { contentItemChannelId, status: "failed" }),
    ).rejects.toThrow(/failurereason/i);
  });

  it("requires https for publishedUrl", async () => {
    await expect(
      recordPublication(actor, {
        contentItemChannelId,
        status: "published",
        publishedUrl: "http://insecure.example.com",
      }),
    ).rejects.toThrow(/https/i);
  });

  it("throws when the channel link is not found", async () => {
    dbMock.state.selectResults.push([]);
    await expect(
      recordPublication(actor, {
        contentItemChannelId,
        status: "published",
        publishedUrl: "https://x.example.com",
      }),
    ).rejects.toThrow(/channel link/i);
  });

  it("throws when the content item is not found", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([]);
    await expect(
      recordPublication(actor, {
        contentItemChannelId,
        status: "published",
        publishedUrl: "https://x.example.com",
      }),
    ).rejects.toThrow(/content item/i);
  });

  it("throws when the content is in a non-publishable status", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "draft" }]);
    await expect(
      recordPublication(actor, {
        contentItemChannelId,
        status: "published",
        publishedUrl: "https://x.example.com",
      }),
    ).rejects.toThrow(/cannot record publication/i);
  });

  it("rejects when the actor is not a publisher/manager", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "ready_to_publish" }]);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      recordPublication(actor, {
        contentItemChannelId,
        status: "published",
        publishedUrl: "https://x.example.com",
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("records a published publication, updates the content item, and writes the activity event", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]); // channel lookup
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "ready_to_publish" }]); // item
    // inside tx: lockedItem, lockedChannel, existing record, all, allChannelCount
    dbMock.state.selectResults.push([{ status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ contentItemId }]); // channel re-fetch after row lock
    dbMock.state.selectResults.push([]); // no existing publication record
    dbMock.state.selectResults.push([{ status: "published" }]); // all records
    dbMock.state.selectResults.push([{ id: contentItemChannelId }]); // allChannelCount

    const result = await recordPublication(actor, {
      contentItemChannelId,
      status: "published",
      publishedUrl: "https://x.example.com/post-1",
    });

    expect(result).toEqual({ ok: true });
    const pubInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["status"] === "published",
    );
    expect(pubInsert).toBeDefined();
    expect((pubInsert?.values as Record<string, unknown>)["publisherId"]).toBe(actor.id);
  });

  it("records a skipped publication with a note", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ contentItemId }]); // channel re-fetch after row lock
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([{ status: "skipped" }]);
    dbMock.state.selectResults.push([{ id: contentItemChannelId }]);

    await recordPublication(actor, {
      contentItemChannelId,
      status: "skipped",
      note: "Replaced with a Reel",
    });
    const pubInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["status"] === "skipped",
    );
    expect(pubInsert).toBeDefined();
    expect((pubInsert?.values as Record<string, unknown>)["note"]).toBe("Replaced with a Reel");
  });

  it("records a failed publication with a failureReason", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ contentItemId }]); // channel re-fetch after row lock
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([{ status: "failed" }]);
    dbMock.state.selectResults.push([{ id: contentItemChannelId }]);

    await recordPublication(actor, {
      contentItemChannelId,
      status: "failed",
      failureReason: "Auth token expired",
    });
    const pubInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["status"] === "failed",
    );
    expect(pubInsert).toBeDefined();
    expect((pubInsert?.values as Record<string, unknown>)["failureReason"]).toBe(
      "Auth token expired",
    );
  });

  it("updates an existing publication record instead of inserting a new one", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ contentItemId }]); // channel re-fetch after row lock
    dbMock.state.selectResults.push([{ id: "pr-existing" }]); // existing
    dbMock.state.selectResults.push([{ status: "published" }]);
    dbMock.state.selectResults.push([{ id: contentItemChannelId }]);

    await recordPublication(actor, {
      contentItemChannelId,
      status: "published",
      publishedUrl: "https://x.example.com/post-2",
    });
    // An update was made (no insert for the publication record)
    const pubUpdate = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["status"] === "published",
    );
    expect(pubUpdate).toBeDefined();
  });

  it("rejects when the channel row moved to a different content item mid-write", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "ready_to_publish" }]);
    dbMock.state.selectResults.push([{ status: "ready_to_publish" }]);
    // Channel re-fetch after the FOR UPDATE row lock returns a
    // different contentItemId — the reparenting race we are guarding
    // against. The service must throw rather than write a
    // publication record against the now-stale parent.
    dbMock.state.selectResults.push([{ contentItemId: "other-item" }]);

    await expect(
      recordPublication(actor, {
        contentItemChannelId,
        status: "published",
        publishedUrl: "https://x.example.com/post-3",
      }),
    ).rejects.toThrow(/moved to a different content item/i);
  });

  it("emits a retry_publication activity event when all recorded channels are failed and the previous status was published", async () => {
    dbMock.state.selectResults.push([{ contentItemId }]);
    // Previous status was "published" so the demotion is interesting
    // enough to surface.
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", status: "published" }]);
    dbMock.state.selectResults.push([{ status: "published" }]); // lockedItem
    dbMock.state.selectResults.push([{ contentItemId }]); // channel re-fetch
    dbMock.state.selectResults.push([{ id: "pr-existing" }]); // existing record
    // All recorded channels are failed.
    dbMock.state.selectResults.push([{ status: "failed" }]);
    dbMock.state.selectResults.push([{ id: contentItemChannelId }]);

    await recordPublication(actor, {
      contentItemChannelId,
      status: "failed",
      failureReason: "API rate-limited",
    });

    // The retry_publication event is the second activity event
    // (the first is the standard "Publication marked failed" entry).
    // The mock doesn't differentiate tables, so we match on the
    // metadata tag and summary that uniquely identify the retry
    // entry.
    const retryInsert = dbMock.state.insertCalls.find(
      (c) =>
        (c.values as Record<string, unknown>)["kind"] === "publication" &&
        (c.values as Record<string, unknown>)["summary"] ===
          "All publication attempts failed; item is ready to retry.",
    );
    expect(retryInsert).toBeDefined();
  });
});

describe("listPublicationsForItem", () => {
  it("throws when the content item is not found", async () => {
    dbMock.state.selectResults.push([]);
    await expect(listPublicationsForItem(actor, contentItemId)).rejects.toThrow(/not found/i);
  });

  it("rejects when the actor is not a workspace member", async () => {
    // Widened the read gate to `canAccessWorkspace` (any
    // workspace member, not just publisher/manager) so a
    // viewer / client_reviewer can see the publication
    // outcomes on the planning detail page. A user that
    // isn't a workspace member at all is still rejected.
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    policyMock.canAccessWorkspace.mockResolvedValue(false);
    await expect(listPublicationsForItem(actor, contentItemId)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("returns the queued rows", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([{ id: "pr-1", status: "published" }]);
    const rows = await listPublicationsForItem(actor, contentItemId);
    expect(rows).toHaveLength(1);
  });
});
