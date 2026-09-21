import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Audit fix (GAP-IDEA-EDIT-2026-09-21):
 *
 * The planning detail page's inline title/date/brief editors
 * previously declared that each mutation "calls
 * `recordMaterialityActivity` which performs the same
 * invalidation + activity-event write" — but the actual server
 * actions never did. A planner could change the title / date /
 * brief on a `ready_to_publish` item without:
 *   - bumping the revision
 *   - cancelling the open approval_requests
 *   - notifying the reviewers
 * which broke the master-prompt §4 materiality contract.
 *
 * These tests pin the new contract: every successful inline
 * mutation must call `recordMaterialityEvent` exactly once,
 * with the matching resource code and before/after values.
 * The full edit form's `updateContentItem` path is covered by
 * `tests/unit/update-content.test.ts`; this file is the
 * inline-edit equivalent.
 */

// ── Mocked dependencies ────────────────────────────────────

// DB chainable — adapted from `notifications-dispatch.test.ts`.
type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
  transactionCalls: number;
};
let dbState: DrizzleState;

function thenableProxy(): Promise<unknown> {
  return Promise.resolve(dbState.selectResults.shift() ?? []);
}
function makeSelectChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => thenableProxy());
  return chain;
}
const insertReturningChain = {
  returning: vi.fn(() => Promise.resolve([{ id: "default-id" }])),
};
const insertChain = {
  values: vi.fn((values: unknown) => {
    dbState.insertCalls.push({ values });
    return insertReturningChain;
  }),
};
const updateChain: Record<string, unknown> = {};
updateChain.set = vi.fn((set: unknown) => ({
  where: vi.fn(() => {
    dbState.updateCalls.push({ set, where: {} });
    return Promise.resolve();
  }),
  then: () => Promise.resolve(),
}));

const txChain = {
  select: vi.fn(() => makeSelectChain()),
  insert: vi.fn(() => insertChain),
  update: vi.fn(() => updateChain),
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    transaction: vi.fn(async (fn: (tx: typeof txChain) => Promise<void>) => {
      dbState.transactionCalls++;
      await fn(txChain);
      return Promise.resolve();
    }),
  },
}));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/lib/auth/current-actor", () => ({
  currentActor: vi.fn(async () => ({
    id: "user-1",
    userId: "user-1",
    agencyId: "agency-1",
    isPlatformAdmin: false,
    isAgencyAdmin: true,
    isAgencyManager: true,
    isWorkspaceManager: true,
    isWorkspaceMember: true,
    isDesigner: false,
    isPlanner: true,
  })),
}));

vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: vi.fn(async () => ({
    id: "ws-1",
    slug: "food-game",
    name: "Food Game",
    timezone: "Europe/Berlin",
    agencyId: "agency-1",
  })),
}));

vi.mock("@/lib/auth/policy", () => ({
  hasWorkspaceRole: vi.fn(async () => true),
}));

// The star of the show — the materiality service. We assert
// it's called with the correct resource / before / after.
// Typed as a `Mock`-like object so the test bodies can read
// `mock.calls` without TS narrowing to `[]` (the default for
// `vi.hoisted(() => ({ ...vi.fn()... }))`).
type MaterialityArgs = {
  actor: { id: string };
  contentItemId: string;
  resource: string;
  beforeValue: string | null;
  afterValue: string;
  reasonCode: string;
};
interface MockedMateriality {
  mock: { calls: MaterialityArgs[][] };
  mockReset: () => void;
  mockResolvedValue: (value: {
    revision: number;
    cancelledApprovalCount: number;
    notifiedReviewerCount: number;
  }) => void;
  (...args: unknown[]): Promise<{
    revision: number;
    cancelledApprovalCount: number;
    notifiedReviewerCount: number;
  }>;
}
const materialityMock: { recordMaterialityEvent: MockedMateriality } = vi.hoisted(() => ({
  // The mock has both a callable surface (so the module
  // interface is satisfied) and the vi.fn() handles
  // (`mock.calls`, `mockReset`, `mockResolvedValue`).
  // Wrapping `vi.fn()` in a Proxy that forwards the call
  // surface while exposing `vi.fn()` controls keeps the
  // import-site types compatible with the real service.
  recordMaterialityEvent: new Proxy(
    Object.assign(
      vi.fn(
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
    ) as unknown as MockedMateriality,
    {
      get(target, prop, receiver) {
        if (prop === "mock") {
          return (
            (Reflect.get(target, "mock", receiver) as object) ?? {
              calls: [] as MaterialityArgs[][],
            }
          );
        }
        return Reflect.get(target, prop, receiver);
      },
    },
  ),
}));

vi.mock("@/lib/publishing/materiality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publishing/materiality")>();
  return {
    ...actual,
    recordMaterialityEvent: materialityMock.recordMaterialityEvent,
  };
});

const actor = { id: "user-1" };
const workspaceId = "ws-1";
const contentItemId = "content-1";

const { inlineUpdateBriefAction, inlineUpdateDateAction, inlineUpdateTitleAction } =
  await import("@/lib/content/inline-update");
const { INLINE_EDITABLE_STATUSES } = await import("@/lib/content/inline-update-actions");

beforeEach(() => {
  dbState = {
    selectResults: [
      // First SELECT (in transaction) — the `before` snapshot.
      [{ workspaceId, status: "ready_to_publish" }],
    ],
    insertCalls: [],
    updateCalls: [],
    transactionCalls: 0,
  };
  materialityMock.recordMaterialityEvent.mockReset();
  materialityMock.recordMaterialityEvent.mockResolvedValue({
    revision: 1,
    cancelledApprovalCount: 0,
    notifiedReviewerCount: 0,
  });
});

describe("inline-update — materiality contract (idea edit publish data or time audit)", () => {
  it("INLINE_EDITABLE_STATUSES contains exactly the seven overview-editable statuses", () => {
    expect([...INLINE_EDITABLE_STATUSES].sort()).toEqual([
      "approved_for_design",
      "changes_requested",
      "content_review",
      "creative_review",
      "draft",
      "in_design",
      "ready_to_publish",
    ]);
  });

  it("inlineUpdateDateAction triggers recordMaterialityEvent for `schedule`", async () => {
    const newDate = new Date("2026-09-30T09:00:00Z");
    const result = await inlineUpdateDateAction("food-game", contentItemId, newDate);
    expect(result).toEqual({ ok: true });
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledTimes(1);
    const call = materialityMock.recordMaterialityEvent.mock.calls[0]?.[0] as unknown as {
      actor: { id: string };
      contentItemId: string;
      resource: string;
      beforeValue: string | null;
      afterValue: string;
      reasonCode: string;
    };
    expect(call.contentItemId).toBe(contentItemId);
    expect(call.actor.id).toBe(actor.id);
    expect(call.resource).toBe("schedule");
    expect(call.afterValue).toBe(newDate.toISOString());
    expect(call.reasonCode).toBe("schedule.update");
  });

  it("inlineUpdateTitleAction triggers recordMaterialityEvent for the title-as-creative-direction change", async () => {
    const result = await inlineUpdateTitleAction("food-game", contentItemId, "Renamed in-test");
    expect(result).toEqual({ ok: true });
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledTimes(1);
    const call = materialityMock.recordMaterialityEvent.mock.calls[0]?.[0] as unknown as {
      contentItemId: string;
      resource: string;
      afterValue: string;
      reasonCode: string;
    };
    expect(call.contentItemId).toBe(contentItemId);
    expect(call.resource).toBe("schedule");
    expect(call.afterValue).toBe("Renamed in-test");
    expect(call.reasonCode).toBe("audience_copy.update");
  });

  it("inlineUpdateBriefAction triggers recordMaterialityEvent for `audience_copy`", async () => {
    const result = await inlineUpdateBriefAction(
      "food-game",
      contentItemId,
      "Brief rewritten in-test",
    );
    expect(result).toEqual({ ok: true });
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledTimes(1);
    const call = materialityMock.recordMaterialityEvent.mock.calls[0]?.[0] as unknown as {
      contentItemId: string;
      resource: string;
      afterValue: string;
      reasonCode: string;
    };
    expect(call.contentItemId).toBe(contentItemId);
    expect(call.resource).toBe("audience_copy");
    expect(call.afterValue).toBe("Brief rewritten in-test");
    expect(call.reasonCode).toBe("audience_copy.update");
  });

  it("records the activity event kind matching the field that was edited", async () => {
    // date_updated
    dbState.selectResults = [
      [
        {
          workspaceId,
          status: "ready_to_publish",
          plannedPublishAt: new Date("2026-08-01T09:00Z"),
        },
      ],
    ];
    await inlineUpdateDateAction("food-game", contentItemId, new Date("2026-09-30T09:00Z"));
    const dateEvent = dbState.insertCalls.find(
      (c) => (c.values as { kind?: string })?.kind === "date_updated",
    );
    expect(dateEvent).toBeDefined();
    expect((dateEvent!.values as { workspaceId: string }).workspaceId).toBe(workspaceId);

    // title_updated
    dbState.selectResults = [[{ workspaceId, status: "ready_to_publish", title: "Old title" }]];
    dbState.insertCalls = [];
    await inlineUpdateTitleAction("food-game", contentItemId, "New title");
    const titleEvent = dbState.insertCalls.find(
      (c) => (c.values as { kind?: string })?.kind === "title_updated",
    );
    expect(titleEvent).toBeDefined();

    // brief_updated
    dbState.selectResults = [[{ workspaceId, status: "ready_to_publish", brief: "Old brief" }]];
    dbState.insertCalls = [];
    await inlineUpdateBriefAction("food-game", contentItemId, "New brief");
    const briefEvent = dbState.insertCalls.find(
      (c) => (c.values as { kind?: string })?.kind === "brief_updated",
    );
    expect(briefEvent).toBeDefined();
  });
});
