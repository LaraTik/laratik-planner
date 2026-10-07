import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type BatchFailure = {
  ok: false;
  errorCode: "invalidPlatformPayload";
  results: Array<{
    socialChannelId: string;
    ok: false;
    errorCode: string;
    fieldPath?: string;
  }>;
  revision: null;
};

const { saveMock, batchMock } = vi.hoisted(() => ({
  saveMock: vi.fn(async (input: { payload: string }) => ({
    ok: true as const,
    payload: JSON.parse(input.payload),
  })),
  batchMock: vi.fn(async (): Promise<BatchFailure> => ({
    ok: false,
    errorCode: "invalidPlatformPayload",
    results: [],
    revision: null,
  })),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: vi.fn(),
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: saveMock,
  savePublishPackageBatchAction: batchMock,
  setFinalCopyApprovalAction: vi.fn(),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishPackageForm } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/publish-package-form";
import type { PlatformPayload, ReadinessReport } from "@/lib/publishing";
import { tFor } from "@/messages";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const channelA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const channelB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const socialA = "22222222-2222-4222-8222-222222222222";
const socialB = "33333333-3333-4333-8333-333333333333";

function pinterestPayload(overrides: Partial<PlatformPayload> = {}): PlatformPayload {
  return {
    schemaVersion: 1,
    platform: "pinterest",
    selectedDestinationProfile: { socialChannelId: socialA },
    pinTitle: "Autumn menu",
    boardId: "board-1",
    caption: "",
    hashtags: [],
    firstComment: "",
    description: "",
    callToAction: null,
    utm: {},
    mentions: [],
    collaborators: [],
    location: "",
    contentLanguage: "en",
    disclosures: {
      paidPartnership: false,
      aiGenerated: false,
      syntheticMedia: false,
      rightsConfirmed: true,
    },
    approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
    deliveryReferences: [],
    scheduleOverride: null,
    publicationMethod: "manual",
    ...overrides,
  } as unknown as PlatformPayload;
}

function readinessTwoChannels(): ReadinessReport {
  const channel = (socialChannelId: string) => ({
    socialChannelId,
    platform: "pinterest",
    hasPayload: true,
    requiredTotal: 2,
    requiredCompleted: 2,
    blockerCount: 0,
    recommendationCount: 0,
    issues: [],
  });
  return {
    contentItemId,
    revision: 1,
    blockers: 0,
    recommendations: 0,
    requiredTotal: 4,
    requiredCompleted: 4,
    canPublish: false,
    issues: [],
    channels: [channel(socialA), channel(socialB)],
  };
}

function renderTwoChannels({ channelBBoardId = "" }: { channelBBoardId?: string } = {}) {
  return render(
    <LocaleProvider locale="en">
      <PublishPackageForm
        workspaceId="44444444-4444-4444-8444-444444444444"
        workspaceSlug="acme"
        agencySlug="acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId={contentItemId}
        itemFormat="static_post"
        contentLocale="en"
        channels={[
          {
            id: channelA,
            socialChannelId: socialA,
            platform: "pinterest",
            accountName: "Acme A",
            payload: pinterestPayload(),
            updatedAt: "2026-10-04T10:00:00.000Z",
          },
          {
            id: channelB,
            socialChannelId: socialB,
            platform: "pinterest",
            accountName: "Acme B",
            payload: pinterestPayload({ boardId: channelBBoardId, pinTitle: "Autumn menu" }),
            updatedAt: "2026-10-04T10:00:00.000Z",
          },
        ]}
        deliveryVersions={[]}
        readiness={readinessTwoChannels()}
        canSavePackage
        canApproveFinalCopy={false}
        canConfirmReadiness={false}
        t={tFor("en")}
      />
    </LocaleProvider>,
  );
}

async function switchTo(secondChannelId: string) {
  const tab = await screen.findByTestId(
    secondChannelId === channelA
      ? `publish-channel-tab-${socialA}`
      : `publish-channel-tab-${socialB}`,
  );
  fireEvent.click(tab);
}

/**
 * `fieldErrors` used to be a flat `Record<fieldName, string>`, so a
 * batch validation failure left only the last failing channel's errors
 * in state and they rendered inside whichever channel was active — the
 * message pointed at a control that was perfectly valid.
 */
describe("per-channel field errors", () => {
  // The channel-switch guard correctly prompts when the outgoing channel
  // is dirty. Accept it, so the tests can reach the multi-dirty state
  // the batch path needs.
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    batchMock.mockClear();
    saveMock.mockClear();
  });

  /** Make both channels dirty, so the batch path is the primary action. */
  async function makeBothDirty() {
    await switchTo(channelA);
    fireEvent.change(await screen.findByTestId("publish-caption"), {
      target: { value: "A edited" },
    });
    await switchTo(channelB);
    fireEvent.change(await screen.findByTestId("publish-caption"), {
      target: { value: "B edited" },
    });
  }

  it("attributes a batch validation error to the channel that failed, not the active one", async () => {
    renderTwoChannels();
    await makeBothDirty();

    fireEvent.click(await screen.findByTestId("publish-save-all"));

    // A is valid, so nothing may be painted on A's panel. Before the
    // fix, B's error was rendered here with A's `aria-describedby`.
    await switchTo(channelA);
    expect(screen.queryByTestId("publish-platform-boardId-error")).not.toBeInTheDocument();

    // B is the channel with an empty board, so the error belongs there.
    await switchTo(channelB);
    expect(await screen.findByTestId("publish-platform-boardId-error")).toHaveTextContent(
      "Choose a Pinterest board.",
    );
  });

  it("blocks the whole batch and writes nothing while any channel is invalid", async () => {
    renderTwoChannels();
    await makeBothDirty();

    fireEvent.click(await screen.findByTestId("publish-save-all"));

    // Validate-first: one invalid channel means no write at all, which
    // is the atomic contract from PR2.
    expect(batchMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("publish-package-form").textContent).toContain(
      "Complete the required platform fields",
    );
  });

  it("switches to the failing channel when the server rejects a field", async () => {
    // The server rejected a specific field on channel B while channel A
    // was active. The error must be attributed to B *and* the operator
    // must be taken to it, or a correct message is invisible.
    batchMock.mockResolvedValueOnce({
      ok: false as const,
      errorCode: "invalidPlatformPayload" as const,
      revision: null,
      results: [
        {
          socialChannelId: socialB,
          ok: false as const,
          errorCode: "invalidPlatformPayload",
          fieldPath: "boardId",
        },
      ],
    });
    // B passes the client pre-flight and is rejected by the server, so
    // the server-rejection branch is the one under test.
    renderTwoChannels({ channelBBoardId: "board-2" });
    await makeBothDirty();
    // Start from A so the switch is observable.
    await switchTo(channelA);

    fireEvent.click(await screen.findByTestId("publish-save-all"));

    // B's panel is now active and carries the message.
    await waitFor(() => {
      expect(screen.getByTestId("publish-platform-boardId-error")).toBeInTheDocument();
    });
    // The server-rejection branch carries the payload-level message, not
    // the per-field "choose a board" copy — the two are different paths.
    expect(screen.getByTestId("publish-platform-boardId-error")).toHaveTextContent(
      "Check the platform-specific publish fields.",
    );
  });
});
