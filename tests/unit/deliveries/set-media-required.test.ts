import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `setMediaRequired` — the "this post ships no creative" toggle.
 *
 * Added in 4eadc7f1 ("allow posts that ship no creative") and shipped with
 * no test at all. It is a gate, not a cosmetic field: flipping
 * `mediaRequired` to false is what lets `submitDelivery` accept a zero-asset
 * delivery, so the guard here is the only thing standing between a planner and
 * a post that silently ships with nothing attached.
 *
 * Three invariants are worth pinning:
 *
 *   1. **The role gate is `workspace_manager` / `content_planner`, not the
 *      designer.** A designer must not be able to flip the media floor to get
 *      past the check that would otherwise block their own submission.
 *   2. **The status gate stops at the creative boundary.** Once a version is
 *      in `creative_review` the reviewer is looking at specific files;
 *      changing the requirement underneath them would make the approved
 *      version mean something different than what was reviewed.
 *   3. **The status list is exported for the UI.** `MEDIA_REQUIRED_STATUSES`
 *      and the service guard are one list, so a test asserts the UI and the
 *      service cannot drift apart.
 */

const dbMock = vi.hoisted(() => {
  const select = vi.fn();
  const update = vi.fn();
  const insert = vi.fn();
  return { db: { select, update, insert } };
});
vi.mock("@/lib/db", () => dbMock);

const cacheMock = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cacheMock);

const policyMock = vi.hoisted(() => ({ hasWorkspaceRole: vi.fn(), requirePolicy: vi.fn() }));
vi.mock("@/lib/auth/policy", () => policyMock);

import {
  MEDIA_REQUIRED_STATUSES,
  setMediaRequired,
  SetMediaRequiredSchema,
} from "@/lib/deliveries/service";

const ACTOR = { id: "11111111-1111-4111-8111-111111111111" };
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

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

function primeItem(item: { workspaceId?: string; status: string; current: boolean } | null) {
  dbMock.db.select.mockReturnValue(
    makeChain(
      item === null
        ? []
        : [
            {
              workspaceId: item.workspaceId ?? WORKSPACE_ID,
              status: item.status,
              current: item.current,
            },
          ],
    ),
  );
}

/** Allow the write path to run. */
function primeWrite() {
  dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));
  dbMock.db.insert.mockImplementation(() => ({ values: () => makeChain(undefined) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReset();
  dbMock.db.update.mockReset();
  dbMock.db.insert.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.requirePolicy.mockReset();
  cacheMock.revalidatePath.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.requirePolicy.mockResolvedValue(undefined);
  primeItem({ status: "draft", current: true });
});

// ── Schema ───────────────────────────────────────────────────────────────

describe("SetMediaRequiredSchema", () => {
  it("accepts a uuid + boolean", () => {
    expect(
      SetMediaRequiredSchema.safeParse({ contentItemId: ITEM_ID, mediaRequired: false }),
    ).toEqual({ success: true, data: { contentItemId: ITEM_ID, mediaRequired: false } });
  });

  it("rejects a non-uuid content item id", () => {
    expect(
      SetMediaRequiredSchema.safeParse({ contentItemId: "nope", mediaRequired: true }).success,
    ).toBe(false);
  });

  it("rejects a non-boolean flag", () => {
    expect(
      SetMediaRequiredSchema.safeParse({ contentItemId: ITEM_ID, mediaRequired: "yes" }).success,
    ).toBe(false);
  });

  it("is strict, so an unexpected key is a typo rather than a silent no-op", () => {
    // `mediaRequiredd: false` would otherwise leave the real field untouched
    // and the toggle would appear to do nothing.
    expect(
      SetMediaRequiredSchema.safeParse({
        contentItemId: ITEM_ID,
        mediaRequired: false,
        mediaRequiredd: false,
      }).success,
    ).toBe(false);
  });
});

// ── The status list is shared with the UI ─────────────────────────────────

describe("MEDIA_REQUIRED_STATUSES", () => {
  it("is exactly the pre-creative statuses", () => {
    // One list, two consumers: the delivery form hides the toggle outside
    // these statuses and the service throws outside them.
    expect([...MEDIA_REQUIRED_STATUSES]).toEqual([
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "changes_requested",
    ]);
  });

  it("stops before the creative-review boundary", () => {
    // Changing the requirement while a version is in review would make the
    // approved version mean something different than what was reviewed.
    for (const status of [
      "in_creative_review",
      "creative_review",
      "ready_to_publish",
      "published",
    ]) {
      expect(MEDIA_REQUIRED_STATUSES as readonly string[]).not.toContain(status);
    }
  });
});

// ── Guard order ──────────────────────────────────────────────────────────

describe("setMediaRequired guards", () => {
  it("throws when the content item does not exist", async () => {
    primeItem(null);
    await expect(
      setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false }),
    ).rejects.toThrow("Content item not found");
    expect(policyMock.requirePolicy).not.toHaveBeenCalled();
  });

  it("authorises only workspace_manager and content_planner", async () => {
    primeWrite();
    await setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false });
    // Explicitly NOT a designer: the designer is the party the media floor
    // exists to constrain.
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(ACTOR, WORKSPACE_ID, [
      "workspace_manager",
      "content_planner",
    ]);
  });

  it("propagates the policy denial", async () => {
    policyMock.requirePolicy.mockRejectedValue(new Error("Not allowed."));
    await expect(
      setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false }),
    ).rejects.toThrow("Not allowed.");
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });

  it("refuses to change the flag past the creative boundary", async () => {
    primeItem({ status: "in_creative_review", current: true });
    await expect(
      setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false }),
    ).rejects.toThrow("Cannot change the media requirement while content is in_creative_review");
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });

  it("allows the change in every documented status", async () => {
    for (const status of MEDIA_REQUIRED_STATUSES) {
      primeItem({ status, current: true });
      primeWrite();
      await expect(
        setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false }),
      ).resolves.toEqual({ mediaRequired: false });
    }
  });
});

// ── No-op path ───────────────────────────────────────────────────────────

describe("setMediaRequired no-op", () => {
  it("returns the current value without writing when the flag is unchanged", async () => {
    primeItem({ status: "draft", current: true });
    const result = await setMediaRequired(ACTOR, {
      contentItemId: ITEM_ID,
      mediaRequired: true,
    });
    expect(result).toEqual({ mediaRequired: true });
    // A no-op must not produce an activity event — the audit timeline would
    // fill up with phantom "changed" entries on every re-render that posts.
    expect(dbMock.db.update).not.toHaveBeenCalled();
    expect(dbMock.db.insert).not.toHaveBeenCalled();
    expect(cacheMock.revalidatePath).not.toHaveBeenCalled();
  });

  it("is a no-op for an already-assetless post too", async () => {
    primeItem({ status: "draft", current: false });
    expect(await setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false })).toEqual(
      { mediaRequired: false },
    );
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });
});

// ── Write path ───────────────────────────────────────────────────────────

describe("setMediaRequired writes", () => {
  it("persists the flag, stamps updatedAt, and records the activity event", async () => {
    primeItem({ status: "draft", current: true });
    const sets: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        sets.push(payload);
        return makeChain(undefined);
      },
    }));
    const events: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        events.push(payload);
        return makeChain(undefined);
      },
    }));

    const result = await setMediaRequired(ACTOR, {
      contentItemId: ITEM_ID,
      mediaRequired: false,
    });

    expect(result).toEqual({ mediaRequired: false });
    expect(sets[0]).toMatchObject({ mediaRequired: false });
    expect(sets[0]!.updatedAt).toBeInstanceOf(Date);
    // The audit row carries both sides so the timeline can render the diff.
    expect(events[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      contentItemId: ITEM_ID,
      actorId: ACTOR.id,
      kind: "delivery",
      summary: "Marked as not requiring media assets",
      beforeData: { mediaRequired: true },
      afterData: { mediaRequired: false },
    });
  });

  it("uses the opposite summary when re-enabling media", async () => {
    primeItem({ status: "draft", current: false });
    const events: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        events.push(payload);
        return makeChain(undefined);
      },
    }));

    expect(await setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: true })).toEqual({
      mediaRequired: true,
    });
    expect(events[0]!.summary).toBe("Marked as requiring media assets");
  });

  it("revalidates the app tree so the delivery form re-reads the flag", async () => {
    primeItem({ status: "draft", current: true });
    dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));
    dbMock.db.insert.mockImplementation(() => ({ values: () => makeChain(undefined) }));

    await setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false });
    // The toggle lives inside the delivery form on several routes, so the
    // revalidation is deliberately coarse.
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/app/w/");
  });

  it("resolves the workspace from the item rather than the caller's scope", async () => {
    // The item's own workspace is the authority; passing some other
    // workspaceId in the input would be a privilege-escalation vector.
    primeItem({ workspaceId: "other-workspace", status: "draft", current: true });
    dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));
    dbMock.db.insert.mockImplementation(() => ({ values: () => makeChain(undefined) }));

    await setMediaRequired(ACTOR, { contentItemId: ITEM_ID, mediaRequired: false });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(ACTOR, "other-workspace", [
      "workspace_manager",
      "content_planner",
    ]);
  });
});
