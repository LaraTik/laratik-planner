import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The publish form's sticky action bar — "one state, one action".
 *
 * Two defects in this bar shipped uncaught, for the same root reason:
 * **every unit fixture in this directory declared exactly one channel.**
 *
 *   1. `saveAllIsTheRightAction` first keyed on `channels.length > 1`,
 *      so on any multi-channel item a single edited channel rendered
 *      "Save all changes (1)" and the per-channel Save *disappeared* —
 *      the operator lost the ability to save one package. The count that
 *      decides this is how many channels *changed* (`dirtyCount > 1`),
 *      not how many exist. Found by the browser gate; a one-channel
 *      component test could never have surfaced it.
 *   2. The `workflowAtPublishingSetup` gate was applied to the command
 *      center only. The bar is the second surface, and it kept offering
 *      "Mark publishing setup ready" below the gate — two primary
 *      buttons at different lifecycle levels, which is how the wrong one
 *      gets clicked.
 *
 * `publishing-dominant-cta.test.tsx` covers the gate on the command
 * center. This file covers the bar, and covers the whole state machine,
 * with a multi-channel fixture.
 *
 * Harness (LocaleProvider, `vi.hoisted` mock pattern, `ReadinessReport`
 * shape) mirrors `publish-approval-ownership.test.tsx`, which is the
 * other multi-channel suite in this directory.
 */

const { saveMock, batchSaveMock, readyMock } = vi.hoisted(() => ({
  // Both saves return the persisted payload(s); the form writes them
  // back into draft state verbatim, so the stub must return a complete
  // payload including the server-owned `approval`.
  saveMock: vi.fn(async (input: { payload: string }) => ({
    ok: true as const,
    payload: JSON.parse(input.payload),
  })),
  batchSaveMock: vi.fn(
    async (input: { entries: Array<{ socialChannelId: string; payload: string }> }) => ({
      ok: true as const,
      revision: 2,
      results: input.entries.map((entry) => ({
        socialChannelId: entry.socialChannelId,
        ok: true as const,
        payload: JSON.parse(entry.payload),
      })),
    }),
  ),
  readyMock: vi.fn(async () => ({ ok: true as const, report: {} })),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: readyMock,
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: saveMock,
  savePublishPackageBatchAction: batchSaveMock,
  setFinalCopyApprovalAction: vi.fn(),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishingCommandCenter } from "@/components/planning/publishing-command-center";
import { PublishPackageForm } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/publish-package-form";
import type { ReadinessReport } from "@/lib/publishing/readiness";
import type { PlatformPayload } from "@/lib/publishing/payload-schemas";
// Type-only import: a value import of `@/lib/publishing` would drag in
// the server-only barrel.
import { tFor } from "@/messages";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const socialChannelA = "33333333-3333-4333-8333-333333333333";
const socialChannelB = "44444444-4444-4444-8444-444444444444";
const channelRowA = "55555555-5555-4555-8555-555555555555";
const channelRowB = "66666666-6666-4666-8666-666666666666";

const STORED_UPDATED_AT = "2026-08-24T10:00:00.000Z";

function savedPayload(socialChannelId: string, caption: string): PlatformPayload {
  return {
    schemaVersion: 1,
    platform: "instagram",
    feedCrop: "original",
    carouselOrder: [],
    caption,
    altText: "A latte on a wooden counter",
    disclosures: {
      paidPartnership: false,
      aiGenerated: false,
      syntheticMedia: false,
      rightsConfirmed: true,
    },
    publicationMethod: "api",
    approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
    hashtags: [],
    mentions: [],
    collaborators: [],
    deliveryReferences: [],
    selectedDestinationProfile: { socialChannelId },
  } as unknown as PlatformPayload;
}

function readinessFor(
  socialChannelIds: string[],
  { canPublish }: { canPublish: boolean },
): ReadinessReport {
  return {
    contentItemId,
    revision: 1,
    blockers: canPublish ? 0 : 2,
    recommendations: 0,
    requiredTotal: 0,
    requiredCompleted: 0,
    canPublish,
    issues: [],
    channels: socialChannelIds.map((socialChannelId) => ({
      socialChannelId,
      platform: "instagram",
      hasPayload: true,
      requiredTotal: 1,
      requiredCompleted: canPublish ? 1 : 0,
      blockerCount: canPublish ? 0 : 2,
      recommendationCount: 0,
      issues: [],
    })),
  };
}

type FormOverrides = {
  canPublish: boolean;
  publishingSetupReady: boolean;
  workflowAtPublishingSetup: boolean;
  canConfirmReadiness: boolean;
  /** `null` = the channel has never been saved (no stored payload). */
  saved: boolean;
};

const DEFAULTS: FormOverrides = {
  canPublish: true,
  publishingSetupReady: false,
  workflowAtPublishingSetup: true,
  canConfirmReadiness: true,
  saved: true,
};

function renderForm(overrides: Partial<FormOverrides> = {}) {
  const opts = { ...DEFAULTS, ...overrides };
  const socialChannelIds = [socialChannelA, socialChannelB];
  const rows = [
    { id: channelRowA, socialChannelId: socialChannelA, accountName: "Food Game" },
    { id: channelRowB, socialChannelId: socialChannelB, accountName: "Studioflow HQ" },
  ];
  return render(
    <LocaleProvider locale="en">
      <PublishPackageForm
        workspaceId={workspaceId}
        workspaceSlug="demo"
        agencySlug="acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId={contentItemId}
        itemFormat="static_post"
        contentLocale="en"
        channels={rows.map((row, index) => ({
          id: row.id,
          socialChannelId: row.socialChannelId,
          platform: "instagram",
          accountName: row.accountName,
          payload: opts.saved
            ? savedPayload(row.socialChannelId, `Stored caption ${index + 1}`)
            : null,
          updatedAt: opts.saved ? STORED_UPDATED_AT : null,
        }))}
        deliveryVersions={[]}
        readiness={readinessFor(socialChannelIds, { canPublish: opts.canPublish })}
        canSavePackage={true}
        canApproveFinalCopy={false}
        canConfirmReadiness={opts.canConfirmReadiness}
        workflowAtPublishingSetup={opts.workflowAtPublishingSetup}
        publishingSetupReady={opts.publishingSetupReady}
      />
    </LocaleProvider>,
  );
}

/**
 * The five controls the bar may put in its primary slot. `one state, one
 * action` is only meaningful if the slot is enumerated, so the invariant
 * is asserted as "exactly one of these rendered" rather than "the one I
 * expected rendered" — a fourth competing CTA would fail both.
 *
 * `publish-internal-note` is deliberately excluded: it lives in the
 * bar's left group as a ghost button, not in the primary slot.
 */
const PRIMARY_ACTIONS = [
  "publish-save-all",
  "publish-save-draft",
  "publish-review-blockers",
  "publish-record-outcome",
  "publish-ready",
] as const;

type PrimaryAction = (typeof PRIMARY_ACTIONS)[number];

function renderedPrimaryActions(): PrimaryAction[] {
  const bar = within(screen.getByTestId("publish-action-bar"));
  return PRIMARY_ACTIONS.filter((id) => bar.queryByTestId(id) !== null);
}

/** Assert the primary slot holds exactly this one action. */
function expectOnlyPrimaryAction(expected: PrimaryAction) {
  expect(renderedPrimaryActions()).toEqual([expected]);
}

afterEach(() => {
  vi.restoreAllMocks();
  saveMock.mockClear();
  batchSaveMock.mockClear();
  readyMock.mockClear();
});

describe("save target — a single edited channel is not a batch (4bb71fcb)", () => {
  it("keeps the per-channel Save when exactly one of two channels is edited", async () => {
    // The browser-gate repro: two channels exist, one changed. The old
    // `channels.length > 1` rule rendered "Save all changes (1)" here and
    // the per-channel Save was unreachable.
    renderForm();
    await screen.findByTestId("publish-caption");

    fireEvent.change(screen.getByTestId("publish-caption"), {
      target: { value: "Edited caption" },
    });

    expectOnlyPrimaryAction("publish-save-draft");
    expect(screen.queryByTestId("publish-save-all")).not.toBeInTheDocument();
  });

  it("routes the single Save to the single-channel action, not the batch", async () => {
    renderForm();
    await screen.findByTestId("publish-caption");
    fireEvent.change(screen.getByTestId("publish-caption"), {
      target: { value: "Edited caption" },
    });

    fireEvent.click(screen.getByTestId("publish-save-draft"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    expect(batchSaveMock).not.toHaveBeenCalled();
    const call = saveMock.mock.calls[0]![0] as { socialChannelId: string; payload: string };
    expect(call.socialChannelId).toBe(socialChannelA);
    expect((JSON.parse(call.payload) as { caption: string }).caption).toBe("Edited caption");
  });

  it("offers Save all only once two channels are edited, and saves both in one call", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm();
    await screen.findByTestId("publish-caption");

    fireEvent.change(screen.getByTestId("publish-caption"), { target: { value: "Caption A" } });
    // Switching away from a dirty channel confirms (the channel-switch
    // guard); accepting it moves to channel B.
    fireEvent.click(screen.getByTestId(`publish-channel-tab-${socialChannelB}`));
    await screen.findByTestId(`publish-channel-panel-${socialChannelB}`);
    fireEvent.change(screen.getByTestId("publish-caption"), { target: { value: "Caption B" } });

    expectOnlyPrimaryAction("publish-save-all");
    expect(screen.queryByTestId("publish-save-draft")).not.toBeInTheDocument();
    expect(screen.getByTestId("publish-save-all")).toHaveTextContent("Save all changes (2)");

    fireEvent.click(screen.getByTestId("publish-save-all"));

    await waitFor(() => {
      expect(batchSaveMock).toHaveBeenCalledTimes(1);
    });
    // One click, one call, one material edit — never a client-side loop
    // over the single-channel action.
    expect(saveMock).not.toHaveBeenCalled();
    const call = batchSaveMock.mock.calls[0]![0] as {
      entries: Array<{
        socialChannelId: string;
        payload: string;
        expectedUpdatedAt: string | null;
      }>;
    };
    expect(call.entries.map((entry) => entry.socialChannelId)).toEqual([
      socialChannelA,
      socialChannelB,
    ]);
    for (const entry of call.entries) {
      expect(entry.expectedUpdatedAt).toBe(STORED_UPDATED_AT);
    }
    expect((JSON.parse(call.entries[0]!.payload) as { caption: string }).caption).toBe("Caption A");
    expect((JSON.parse(call.entries[1]!.payload) as { caption: string }).caption).toBe("Caption B");
    confirmSpy.mockRestore();
  });
});

describe("one state, one action — the full sticky-bar state machine (ca0e1db3)", () => {
  it("never-saved-and-clean offers Save, because there is nothing to save back to yet", async () => {
    renderForm({ saved: false });
    await screen.findByTestId("publish-caption");
    // No keystroke, no dirty flag — but also no persisted package, so
    // collapsing this into "not dirty" would hide the only way to persist
    // the draft.
    expect(screen.queryByTestId("publish-unsaved-state")).not.toBeInTheDocument();
    expectOnlyPrimaryAction("publish-save-draft");
  });

  it("never-saved-and-dirty still offers Save rather than a batch", async () => {
    renderForm({ saved: false });
    await screen.findByTestId("publish-caption");
    fireEvent.change(screen.getByTestId("publish-caption"), { target: { value: "First draft" } });

    expect(screen.getByTestId("publish-unsaved-state")).toBeInTheDocument();
    expectOnlyPrimaryAction("publish-save-draft");
  });

  it("saved-and-blocked sends the operator to the blockers, never to the lifecycle", async () => {
    renderForm({ canPublish: false });
    await screen.findByTestId("publish-caption");

    expectOnlyPrimaryAction("publish-review-blockers");
    expect(screen.getByTestId("publish-review-blockers")).toHaveAttribute(
      "href",
      "#publish-package",
    );
  });

  it("saved-and-clean-not-gated offers the setup confirmation", async () => {
    renderForm();
    await screen.findByTestId("publish-caption");

    const ready = screen.getByTestId("publish-ready");
    expectOnlyPrimaryAction("publish-ready");
    expect(ready).toBeEnabled();
    expect(ready).toHaveTextContent("Mark publishing setup ready");

    fireEvent.click(ready);
    await waitFor(() => {
      expect(readyMock).toHaveBeenCalledTimes(1);
    });
  });

  it("setup-ready routes to outcomes rather than re-offering the confirmation", async () => {
    renderForm({ publishingSetupReady: true });
    await screen.findByTestId("publish-caption");

    expectOnlyPrimaryAction("publish-record-outcome");
    expect(screen.getByTestId("publish-record-outcome")).toHaveAttribute(
      "href",
      "#publish-outcomes",
    );
  });
});

describe("the lifecycle gate on the sticky bar (ca0e1db3 D-gate)", () => {
  it("hides publish-ready below the gate instead of offering a second primary CTA", async () => {
    // Blockers clear and the package is clean and saved — the only state
    // in which the bar would otherwise render "Mark publishing setup
    // ready". The global workflow has not reached publishing setup, so the
    // workspace rail still owns the next action.
    renderForm({ workflowAtPublishingSetup: false });
    await screen.findByTestId("publish-caption");

    expect(screen.queryByTestId("publish-ready")).not.toBeInTheDocument();
    // Absent, not merely disabled: a disabled button is still a second
    // affordance competing for the same click.
    expect(renderedPrimaryActions()).toEqual([]);
  });

  it("restores publish-ready as soon as the gate opens", async () => {
    renderForm({ workflowAtPublishingSetup: true });
    await screen.findByTestId("publish-caption");
    expectOnlyPrimaryAction("publish-ready");
  });

  it("offers exactly one lifecycle CTA across the command center and the bar", () => {
    // The two surfaces the gate was split across. Below the gate the
    // command center shows a non-advancing "Review setup" link and the
    // bar offers nothing, so the rail's next action ("Submit for review")
    // is the only lifecycle advance on the Publishing tab.
    const t = tFor("en");
    render(
      <LocaleProvider locale="en">
        <PublishingCommandCenter
          channelCount={2}
          readyChannelCount={2}
          blockerCount={0}
          publishingSetupReady={false}
          outcomesRecorded={0}
          workflowAtPublishingSetup={false}
          t={t}
        />
        <PublishPackageForm
          workspaceId={workspaceId}
          workspaceSlug="demo"
          agencySlug="acme"
          workspaceTimezone="Europe/Berlin"
          contentItemId={contentItemId}
          itemFormat="static_post"
          contentLocale="en"
          channels={[
            {
              id: channelRowA,
              socialChannelId: socialChannelA,
              platform: "instagram",
              accountName: "Food Game",
              payload: savedPayload(socialChannelA, "Stored caption 1"),
              updatedAt: STORED_UPDATED_AT,
            },
          ]}
          deliveryVersions={[]}
          readiness={readinessFor([socialChannelA], { canPublish: true })}
          canSavePackage={true}
          canApproveFinalCopy={false}
          canConfirmReadiness={true}
          workflowAtPublishingSetup={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("publishing-command-center-action")).toHaveTextContent(
      "Review setup",
    );
    expect(screen.queryByTestId("publish-ready")).not.toBeInTheDocument();
    expect(renderedPrimaryActions()).toEqual([]);
  });
});
