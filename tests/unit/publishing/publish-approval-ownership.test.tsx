import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * PR2 D2 — approval ownership on the Publish form.
 *
 * The form used to reset `payload.approval` to
 * `{ finalCopyApproved: false, ... }` inside `updateDraft`, on every
 * keystroke. Approval is server-owned (`savePlatformPayload` re-reads
 * the stored approval and spreads it last, discarding whatever the
 * client sent), so the local reset made the form report "not approved"
 * for a package the server still considered approved — and healed
 * silently on the next render. It also backed a `approvalResetHint`
 * paragraph promising a reset that never happened.
 *
 * These tests pin the fixed behaviour:
 *   1. Editing an approved package leaves the approval shown as approved.
 *   2. The "approval is reset" copy is not rendered.
 *   3. Only the explicit approval action may change approval.
 * The harness (LocaleProvider wrapper, `vi.hoisted` mock pattern,
 * `readinessFor` shape, mocked action + navigation modules) mirrors
 * `publish-platform-fields.test.tsx`.
 */

const { saveMock, batchSaveMock, setApprovalMock } = vi.hoisted(() => ({
  // A save returns the persisted payload, and the form writes it back
  // into its draft state verbatim, so the stub must return a complete
  // payload including the server-owned `approval`.
  saveMock: vi.fn(async (_input: { payload: string }) => ({
    ok: true as const,
    payload: JSON.parse(_input.payload),
  })),
  batchSaveMock: vi.fn(),
  setApprovalMock: vi.fn(),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: vi.fn(),
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: saveMock,
  savePublishPackageBatchAction: batchSaveMock,
  setFinalCopyApprovalAction: setApprovalMock,
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishPackageForm } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/publish-package-form";
import type { ReadinessReport } from "@/lib/publishing/readiness";
// Type-only import: the payload schemas module pulls no server code, and
// a value import of `@/lib/publishing` would drag in the server-only
// barrel.
import type { PlatformPayload } from "@/lib/publishing/payload-schemas";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const socialChannelA = "22222222-2222-4222-8222-222222222222";
const socialChannelB = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";

/** The en catalog copy this suite asserts on. */
const COPY = {
  finalCopyApproved: "Final copy approved",
  finalCopyAwaitingApproval: "Final copy awaiting approval",
  revokeApproval: "Revoke approval",
  approveFinalCopy: "Approve final copy",
  unsavedGuard: "You have unsaved publishing changes. Leave and lose them?",
  approvalResetHint:
    "Approved before later edits. Approval remains valid according to workspace policy.",
} as const;

const APPROVAL = {
  finalCopyApproved: true,
  approvedByUserId: "55555555-5555-4555-8555-555555555555",
  approvedAt: "2026-08-20T09:00:00.000Z",
} as const;

function instagramPayload(socialChannelId: string, caption: string): PlatformPayload {
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
    approval: { ...APPROVAL },
    hashtags: [],
    mentions: [],
    collaborators: [],
    deliveryReferences: [],
    selectedDestinationProfile: { socialChannelId },
  };
}

function readinessForChannels(socialChannelIds: string[]): ReadinessReport {
  return {
    contentItemId,
    revision: 1,
    blockers: 0,
    recommendations: 0,
    requiredTotal: 0,
    requiredCompleted: 0,
    canPublish: false,
    issues: [],
    channels: socialChannelIds.map((socialChannelId) => ({
      socialChannelId,
      platform: "instagram",
      hasPayload: true,
      requiredTotal: 1,
      requiredCompleted: 1,
      blockerCount: 0,
      recommendationCount: 0,
      issues: [],
    })),
  };
}

function renderForm({
  socialChannelIds = [socialChannelA],
  canApproveFinalCopy = true,
}: {
  socialChannelIds?: string[];
  canApproveFinalCopy?: boolean;
} = {}) {
  return render(
    <LocaleProvider locale="en">
      <PublishPackageForm
        workspaceId={workspaceId}
        workspaceSlug="demo"
        agencySlug="acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId={contentItemId}
        itemFormat="short_form_video"
        contentLocale="en"
        deliveryVersions={[]}
        channels={socialChannelIds.map((socialChannelId, index) => ({
          id: `aaaaaaaa-0000-4000-8000-00000000000${index + 1}`,
          socialChannelId,
          platform: "instagram",
          accountName: index === 0 ? "Dr. Reem Reda" : "Studioflow HQ",
          payload: instagramPayload(socialChannelId, `Original caption ${index + 1}`),
          updatedAt: "2026-08-24T10:00:00.000Z",
        }))}
        readiness={readinessForChannels(socialChannelIds)}
        canSavePackage={true}
        canApproveFinalCopy={canApproveFinalCopy}
        canConfirmReadiness={false}
      />
    </LocaleProvider>,
  );
}

/** The `Preview & approval` card, which holds the approval state text. */
function approvalBlock() {
  const block = document.getElementById("publish-approval");
  expect(block).not.toBeNull();
  return within(block as HTMLElement);
}

afterEach(() => {
  vi.restoreAllMocks();
  saveMock.mockClear();
  batchSaveMock.mockClear();
  setApprovalMock.mockClear();
});

describe("approval ownership on the publish form", () => {
  it("keeps an approved package shown as approved after the caption is edited", async () => {
    renderForm();
    const caption = await screen.findByTestId("publish-caption");
    expect(caption).toHaveValue("Original caption 1");

    // The regression: this keystroke used to clear `approval`.
    fireEvent.change(caption, { target: { value: "Edited caption" } });

    const block = approvalBlock();
    expect(block.getByText(COPY.finalCopyApproved)).toBeInTheDocument();
    expect(block.queryByText(COPY.finalCopyAwaitingApproval)).not.toBeInTheDocument();

    // The approval toggle still reads "revoke", i.e. the form still
    // believes the copy is approved. With the old reset in place this
    // flipped to "approve" on the very first keystroke.
    const toggle = screen.getByTestId("publish-final-copy-approved");
    expect(toggle).toHaveTextContent(COPY.revokeApproval);
    expect(toggle).not.toHaveTextContent(COPY.approveFinalCopy);
  });

  it("sends the still-approved approval to the server instead of a cleared one", async () => {
    renderForm();
    const caption = await screen.findByTestId("publish-caption");
    fireEvent.change(caption, { target: { value: "Edited caption" } });

    fireEvent.click(screen.getByTestId("publish-save-draft"));
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });

    const call = saveMock.mock.calls[0]![0] as {
      payload: string;
      expectedUpdatedAt: string | null;
    };
    const sent = JSON.parse(call.payload) as {
      caption: string;
      approval: typeof APPROVAL;
    };
    expect(sent.caption).toBe("Edited caption");
    expect(sent.approval).toEqual(APPROVAL);
    // The optimistic-concurrency token rides along with the single save.
    expect(call.expectedUpdatedAt).toBe("2026-08-24T10:00:00.000Z");
  });

  it("never renders the copy claiming approval is reset on save", async () => {
    renderForm();
    await screen.findByText(COPY.finalCopyApproved);

    expect(screen.queryByText(COPY.approvalResetHint)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/approval remains valid according to workspace policy/i),
    ).not.toBeInTheDocument();
  });

  it("leaves the approval alone when the actor may not approve final copy", async () => {
    // Read-only on the approval control: the block still reflects the
    // stored approval, it just offers no way to change it.
    renderForm({ canApproveFinalCopy: false });
    const caption = await screen.findByTestId("publish-caption");
    fireEvent.change(caption, { target: { value: "Edited caption" } });

    const block = approvalBlock();
    expect(block.getByText(COPY.finalCopyApproved)).toBeInTheDocument();
    expect(screen.queryByTestId("publish-final-copy-approved")).not.toBeInTheDocument();
  });
});

describe("channel switching while the current draft is dirty", () => {
  it("stays on the current channel when the operator declines the guard", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm({ socialChannelIds: [socialChannelA, socialChannelB] });
    const caption = await screen.findByTestId("publish-caption");
    fireEvent.change(caption, { target: { value: "Edited caption" } });

    fireEvent.click(screen.getByTestId(`publish-channel-tab-${socialChannelB}`));

    expect(confirmSpy).toHaveBeenCalledWith(COPY.unsavedGuard);
    // Declined: the active channel is unchanged.
    expect(screen.getByTestId(`publish-channel-panel-${socialChannelA}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`publish-channel-panel-${socialChannelB}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`publish-channel-tab-${socialChannelA}`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The draft is not discarded by a declined switch.
    expect(screen.getByTestId("publish-caption")).toHaveValue("Edited caption");
  });

  it("switches channels when the operator accepts the guard", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm({ socialChannelIds: [socialChannelA, socialChannelB] });
    const caption = await screen.findByTestId("publish-caption");
    fireEvent.change(caption, { target: { value: "Edited caption" } });

    fireEvent.click(screen.getByTestId(`publish-channel-tab-${socialChannelB}`));

    expect(confirmSpy).toHaveBeenCalledWith(COPY.unsavedGuard);
    expect(screen.getByTestId(`publish-channel-panel-${socialChannelB}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`publish-channel-panel-${socialChannelA}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`publish-channel-tab-${socialChannelB}`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The second channel shows its own stored draft, not the first's edit.
    expect(screen.getByTestId("publish-caption")).toHaveValue("Original caption 2");
  });

  it("switches channels without prompting when the draft is clean", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm({ socialChannelIds: [socialChannelA, socialChannelB] });
    await screen.findByTestId("publish-caption");

    fireEvent.click(screen.getByTestId(`publish-channel-tab-${socialChannelB}`));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId(`publish-channel-panel-${socialChannelB}`)).toBeInTheDocument();
  });
});
