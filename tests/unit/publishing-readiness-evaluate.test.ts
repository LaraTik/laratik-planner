import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M4.4 — Readiness service unit tests.
 *
 * The pure helpers (`foldAiSuggestions`, `ReadinessReportSchema`,
 * and the per-platform `REQUIRED_FIELDS` table) are exercised
 * here. The DB-bound `evaluateReadiness` is the focus: it walks
 * the channel → payload → per-platform required-fields tree, sums
 * blockers and recommendations, and folds in AI suggestions +
 * open approvals. The test exercises one channel per platform
 * family so every `REQUIRED_FIELDS[platform]` branch is hit.
 *
 * DB conventions follow the rest of the publishing test suite.
 * The Drizzle mock lets us queue a content item + per-channel
 * rows; the SUT consumes them in order. `recordMaterialityEvent`
 * is not exercised here (readiness is read-only).
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
  const update = vi.fn();
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

const { evaluateReadiness } = await import("@/lib/publishing/readiness");

const actor = { id: "99999999-9999-9999-9999-999999999999" };
const workspaceId = "ws-1";
const contentItemId = "11111111-1111-1111-1111-111111111111";
const instagramChannelId = "22222222-2222-2222-2222-222222222222";
const youtubeChannelId = "33333333-3333-3333-3333-333333333333";
const pinterestChannelId = "44444444-4444-4444-4444-444444444444";
const xChannelId = "55555555-5555-5555-5555-555555555555";
const tiktokChannelId = "66666666-6666-6666-6666-666666666666";
const facebookChannelId = "77777777-7777-7777-7777-777777777777";
const linkedinChannelId = "88888888-8888-8888-8888-888888888888";
const otherChannelId = "99999999-9999-9999-9999-999999999998";
const deliveryVersionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function resetState() {
  dbState.selectResults = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.lastSelectRowCount = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
}

beforeEach(resetState);

function contentItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: contentItemId,
    revision: 0,
    approvedDeliveryVersionId: deliveryVersionId,
    format: "static_post",
    workspaceId,
    ...overrides,
  };
}

function channelRow(overrides: Record<string, unknown> = {}) {
  return {
    socialChannelId: instagramChannelId,
    platformPayload: null,
    platform: "instagram",
    ...overrides,
  };
}

describe("evaluateReadiness", () => {
  it("throws FORBIDDEN when the actor is not a workspace member", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(evaluateReadiness({ actor, workspaceId, contentItemId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws NOT_FOUND when the content item is missing", async () => {
    dbState.selectResults.push([]); // no content item
    await expect(evaluateReadiness({ actor, workspaceId, contentItemId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns canPublish=false when there are no channels", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([]); // channelRows
    dbState.selectResults.push([]); // openApprovals
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(report.canPublish).toBe(false);
    expect(report.channels).toEqual([]);
  });

  it("flags a missing payload as a single blocker", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([channelRow({ platformPayload: null })]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([{ id: deliveryVersionId }]); // delivery version exists
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(report.canPublish).toBe(false);
    expect(report.blockers).toBe(1);
    expect(report.channels[0]?.issues.find((i) => i.code === "missing_payload")).toBeDefined();
  });

  it("flags an invalid (schema-rejected) payload as a single blocker", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([
      channelRow({
        platformPayload: {
          schemaVersion: 1,
          platform: "myspace" as unknown as "instagram",
          // The discriminated union requires the platform
          // literal to be a known string; an unknown platform
        },
      }),
    ]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([{ id: deliveryVersionId }]);
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(report.blockers).toBe(1);
    expect(report.channels[0]?.issues[0]?.code).toBe("invalid_payload");
  });

  it("flags a missing-platform-tag payload as a blocker", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([
      channelRow({
        platformPayload: { schemaVersion: 1 /* no platform */ },
      }),
    ]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([{ id: deliveryVersionId }]);
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(report.blockers).toBe(1);
    expect(report.channels[0]?.issues[0]?.code).toBe("missing_platform");
  });

  it("flags a missing approved delivery version as a blocker (alongside missing_payload)", async () => {
    dbState.selectResults.push([contentItemRow({ approvedDeliveryVersionId: null })]);
    dbState.selectResults.push([channelRow()]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([]); // no delivery version row
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    // 1 missing_payload + 1 no_approved_delivery = 2 blockers.
    expect(report.blockers).toBe(2);
    expect(report.channels[0]?.issues.find((i) => i.code === "no_approved_delivery")).toBeDefined();
  });

  it("flags a stale approved delivery version (pointing to a deleted row) as a blocker", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([channelRow()]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([]); // deliveryVersions row missing
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(
      report.channels[0]?.issues.find((i) => i.code === "delivery_version_missing"),
    ).toBeDefined();
  });

  it("emits common recommendations (rights, synthetic-media) on top of platform-specific blockers", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([
      channelRow({
        platformPayload: {
          schemaVersion: 1,
          platform: "instagram" as const,
          feedCrop: "1:1",
          carouselOrder: [],
          altText: "A planner's desk",
          caption: "Caption present",
          disclosures: {
            paidPartnership: false,
            aiGenerated: true, // → synthetic_media recommendation expected
            syntheticMedia: false,
            rightsConfirmed: false, // → rights_not_confirmed recommendation
          },
          publicationMethod: "api",
          approval: { finalCopyApproved: true },
          hashtags: [],
          mentions: [],
          collaborators: [],
          deliveryReferences: [],
          selectedDestinationProfile: { socialChannelId: instagramChannelId },
        },
      }),
    ]);
    dbState.selectResults.push([]); // openApprovals
    dbState.selectResults.push([{ id: deliveryVersionId }]);
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    const codes = report.channels[0]?.issues.map((i) => i.code) ?? [];
    expect(codes).toContain("synthetic_media_disclosure_recommended");
    expect(codes).toContain("rights_not_confirmed");
  });

  it("canPublish=true when every channel passes its required fields and has an approved delivery", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([
      channelRow({
        platformPayload: {
          schemaVersion: 1,
          platform: "instagram" as const,
          feedCrop: "1:1",
          carouselOrder: [],
          altText: "A planner's desk",
          caption: "Caption present",
          disclosures: {
            paidPartnership: false,
            aiGenerated: false,
            syntheticMedia: false,
            rightsConfirmed: true,
          },
          publicationMethod: "api",
          approval: { finalCopyApproved: true },
          hashtags: [],
          mentions: [],
          collaborators: [],
          deliveryReferences: [],
          selectedDestinationProfile: { socialChannelId: instagramChannelId },
        },
      }),
    ]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([{ id: deliveryVersionId }]);
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(report.blockers).toBe(0);
    expect(report.recommendations).toBe(0);
    expect(report.canPublish).toBe(true);
  });

  it("folds AI suggestions as recommendations (never blockers) and surfaces open-approval count", async () => {
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([channelRow()]);
    dbState.selectResults.push([{ id: "approval-1" }, { id: "approval-2" }]); // openApprovals
    dbState.selectResults.push([{ id: deliveryVersionId }]);
    const report = await evaluateReadiness({
      actor,
      workspaceId,
      contentItemId,
      aiSuggestions: [{ path: "channels.x.payload.caption", message: "Tighten the hook." }],
    });
    // AI suggestion = +1 recommendation, plus the missing_payload
    // blocker (+1 blocker), plus the open-approvals banner (+1
    // recommendation).
    expect(report.recommendations).toBe(2);
    expect(report.blockers).toBe(1);
    const ai = report.issues.find((i) => i.code === "ai_suggestion");
    expect(ai?.severity).toBe("recommendation");
    const openApprovals = report.issues.find((i) => i.code === "approvals_open");
    expect(openApprovals?.message).toMatch(/2 approval request/);
  });

  it("exercises every platform's required-fields branch in one evaluation", async () => {
    // We submit a PARTIALLY-FILLED payload for each platform so
    // every required-field rule fires. The per-field tests are
    // inside the REQUIRED_FIELDS table; the common missing-field
    // code (`missing_caption`, `missing_alt_text`, etc.) is what
    // each platform's test function emits when its required field
    // is missing. With all the required fields absent, the SUT
    // walks every per-platform test branch.
    const instagramReelChannelId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    dbState.selectResults.push([contentItemRow()]);
    dbState.selectResults.push([
      // instagram: caption, destinationProfile, altText, approval
      channelRow({
        socialChannelId: instagramChannelId,
        platform: "instagram",
        platformPayload: {
          schemaVersion: 1,
          platform: "instagram",
          // caption missing, destinationProfile missing, altText
          // missing, finalCopyApproved missing → 4 blockers.
        },
      }),
      // instagram_reel: 5 required fields (audio, transcript,
      // cover, altText, finalCopyApproved). All have defaults
      // except altText, so the parse succeeds with the empty
      // payload and the test functions fire.
      channelRow({
        socialChannelId: instagramReelChannelId,
        platform: "instagram_reel",
        platformPayload: {
          schemaVersion: 1,
          platform: "instagram_reel",
        },
      }),
      // youtube: title, thumbnail, privacy, approval
      channelRow({
        socialChannelId: youtubeChannelId,
        platform: "youtube",
        platformPayload: {
          schemaVersion: 1,
          platform: "youtube",
          // `title` is required (no default) — provide a value
          // so the parse succeeds and the per-field test
          // functions fire. The other three required fields
          // (thumbnail, privacy, finalCopyApproved) have
          // defaults or are optional, so they fall through to
          // the test-function layer where they get flagged.
          title: "Required title for parse",
        },
      }),
      // tiktok: musicRightsConfirmed, privacy, approval
      channelRow({
        socialChannelId: tiktokChannelId,
        platform: "tiktok",
        platformPayload: {
          schemaVersion: 1,
          platform: "tiktok",
        },
      }),
      // pinterest: pinTitle, boardId, altText, approval
      channelRow({
        socialChannelId: pinterestChannelId,
        platform: "pinterest",
        platformPayload: {
          schemaVersion: 1,
          platform: "pinterest",
          // `pinTitle` and `boardId` are required (no default) —
          // provide values so the parse succeeds and the per-field
          // test functions fire. The other two required fields
          // (altText, finalCopyApproved) fall through to the
          // test-function layer.
          pinTitle: "Pin",
          boardId: "board-1",
        },
      }),
      // x: caption, approval
      channelRow({
        socialChannelId: xChannelId,
        platform: "x",
        platformPayload: {
          schemaVersion: 1,
          platform: "x",
        },
      }),
      // facebook: destinationProfile, approval
      channelRow({
        socialChannelId: facebookChannelId,
        platform: "facebook",
        platformPayload: {
          schemaVersion: 1,
          platform: "facebook",
        },
      }),
      // linkedin: destinationProfile, approval
      channelRow({
        socialChannelId: linkedinChannelId,
        platform: "linkedin",
        platformPayload: {
          schemaVersion: 1,
          platform: "linkedin",
        },
      }),
      // other: destinationProfile, approval
      channelRow({
        socialChannelId: otherChannelId,
        platform: "other",
        platformPayload: {
          schemaVersion: 1,
          platform: "other",
        },
      }),
    ]);
    dbState.selectResults.push([]); // openApprovals
    // 9 channels × 1 delivery-version check each.
    for (let i = 0; i < 9; i++) {
      dbState.selectResults.push([{ id: deliveryVersionId }]);
    }
    const report = await evaluateReadiness({ actor, workspaceId, contentItemId });
    expect(report.channels.length).toBe(9);
    // Every channel has at least one blocker.
    for (const channel of report.channels) {
      expect(channel.blockerCount).toBeGreaterThanOrEqual(2);
    }
    expect(report.canPublish).toBe(false);
  });
});
